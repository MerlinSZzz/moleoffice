// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useWordGeneration } from '../lib/word-settings.ts'
import { t } from '@shared/i18n.ts'
import { useLanguage } from '../lib/language.ts'
import { useInspect } from '../lib/mode.ts'
import { TieredPress } from './TieredPress.tsx'
import { RanBy } from './ChatRanBy.tsx'
import { EditedMark, EditPress } from './ChatEdited.tsx'
/**
 * THE CIRCLE AT THE BOTTOM RIGHT, AND WHAT OPENS OUT OF IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS
 * ---------------------------------------------------------------------------------------
 *
 * A circle at the bottom right opens something like the chat window of
 * QQ, a chat program. The first screen is the reader's own picture, name and state, then the
 * contacts: a picture, a name and the last message on one line. Pressing a contact opens the
 * conversation: their picture, name, a coloured dot and their state in small text at the top, the
 * messages below, and a box to write in. Criterion M6 of design/messages/ACCEPTANCE.md.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS A DRAWING OF THE POOL AND NOTHING ELSE
 * ---------------------------------------------------------------------------------------
 *
 * It is only a view of the functions underneath: it does not read Claude Code's
 * output directly, and it does not inject anything either. Everything on this panel
 * comes from the API and from the channel. It reads no terminal and it writes into none.
 *
 * ---------------------------------------------------------------------------------------
 * THE SENTENCES ARE NOT IN THIS FILE
 * ---------------------------------------------------------------------------------------
 *
 * `CHAT_WORDS` in src/shared/messages.ts holds every word this panel says, and `DELIVERY` holds the
 * sentence for each mark. A sentence written here would be a sentence one screen says, and the same
 * fact would get a second wording on the next screen.
 */

import {
  cloneElement,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as APointer,
  type ReactElement,
  type ReactNode,
} from 'react'
import type React from 'react'
import { flushSync } from 'react-dom'
import { useLoadingLight } from '../lib/waiting-light.ts'
import { putThePageAt, thePlaceOnThePage, whenThePageScrolls } from '../lib/page-scroll.ts'
import { THE_SPLIT_FROM, TWO_COLUMNS_FROM, keepTheWidth, openTheChatAsChosen, putTheChat, sayHowTheChatOpens, sayTheCount, sayTheSplitIsDrawn, swapTheSides, theSplit, watchTheSplit, widthInside } from '../lib/chat-split.ts'
import { THE_NARROW_FROM } from '../lib/the-shell-width.ts'
import { AShapePress, BackToThePageShape, BesideThePageShape, BetweenShape, ContactsShape, GroupsShape, ItsOwnWindowShape, PutItAwayShape, SendShape, AddGroupShape, FlagShape, SwapSidesShape } from './chat/Shapes.tsx'
import {
  CANNOT_REACH_WORDS,
  CHAT_DRAFTS_KEY,
  CHAT_WORDS,
  CIRCLE_PICTURE_BEFORE_ANYBODY_CHOOSES,
  NEITHER_SIDE,
  whereItWasWrittenReads,
  chatDraftKey,
  chatDraftsFromStored,
  circlePictureUrl,
  firstWordsOfAMessage,
  whenAContactLastSpoke,
  LEADING,
  SEEN_MARKS_IN_ONE_REQUEST_AT_MOST,
  deliveryReading,
  participantFromKey,
  participantKey,
  piecesOfBody,
  sameParticipant,
  theAgentAStoredSenderNames,
  theCarriedWords,
  theLineAnUnregisteredWriterTyped,
  theWritersName,
  unregisteredFromKey,
  unregisteredKey,
  unregisteredName,
  withTheChatDraft,
  type BodyPiece,
  type DeliveryMark,
  type KnownParticipant,
  type UnregisteredWriter,
  type WhereTheNameGoes,
  type WhichChatConversation,
} from '@shared/messages.ts'
import {
  chatButtonStaysBeforeAnybodyChooses,
  CHAT_OPENS_AS_BEFORE_ANYBODY_CHOOSES,
  CHAT_TEXT_SIZE_BEFORE_ANYBODY_CHOOSES,
  CIRCLE_BEFORE_ANYBODY_CHOOSES,
  MESSAGE_LINK_LAYOUT_BEFORE_ANYBODY_CHOOSES,
  MESSAGE_PROJECT_MARK_BEFORE_ANYBODY_CHOOSES,
  MESSAGE_LINK_LEVEL_BEFORE_ANYBODY_CHOOSES,
  PRESENCE_BEFORE_ANYBODY_CHOOSES,

  STATE_MAX,
  STATE_PRESETS,
  isMoleOffice,
  MOLE_OFFICE_NAME,
  type ChatTextSize,
  type CircleShows,
  type MessageLinkLayout,
  type MessageProjectMark,
  type MessageLinkLevel,
  type ParticipantKind,
  type ParticipantRef,
  type PresenceChoice,
} from '@shared/participants.ts'
import { WhetherYouAreHere } from './WhetherYouAreHere.tsx'
// THE CONTACTS LIST, LIFTED OUT OF THIS FILE — the same chooser the right-click panel draws. Criterion W4.
import { ContactsInGroups, Dot, facesInAGroup, isASystemLine, ReadOutOnly, theNameBesideItsDate } from './ContactChooser.tsx'
import { HowLinksAreDrawn, TheLineWithItsLinksInWords, theWordsOfALink } from './ChatLinks.tsx'
import { GROUP_WORDS, THE_CHECKLIST_LINES, theTimelineOfAGroup, whereEachGroupSits, type GroupMemberOnTheWire, type SystemLine, type SystemLineKind } from '@shared/groups.ts'
import { theWordsOfAnOfficeLine } from '@shared/dead-letter-lines.ts'
import { whereAMessageHoldsAKey } from '@shared/message-keys.ts'
import { A_PERSONS_TURN_DRAFT_GOES_WITHIN_MINUTES } from '@shared/turn-drafts.ts'
import { theDraftAsTheStoreKeepsIt } from '../lib/the-kept-chat-draft.ts'
import { KeyQuestion, useAKeyQuestion, type HowTheDraftChanged } from './AKeyQuestion.tsx'
import { theFoldsOf, whenItStands } from '@shared/folded-lines.ts'
import { CONTACT_SIDES, type ContactGroup, type ContactSide } from '@shared/contacts.ts'
import type { ChannelEvent, EventName } from '@shared/events.ts'
import type { ImageBlock } from '@shared/types.ts'
import {
  api,
  errorMessage,
  faultOf,
  type Fault,
  moleOfficeRequest,
  type AsSideReply,
  type ShortContactLine,
  type ContactListHeld,
  type ContactListPage,
  type ConversationReply,
  type OneGroupReply,
  type ParticipantOnTheWire,
  type ParticipantForThePage,
  type ParticipantsForThePageReply,
  type PoolEntry,
  type PresenceOnTheWire,
  type ShortBetweenAgentsReply,
  type ShortGroupsReply,
  type UnregisteredReply,
} from '../api.ts'
// WHAT THE SHORT LISTS KEEP, and what a closed panel reads. It follows option 2 of a decision.
import { theLastLineInWords, type ShortGroupRow, type TheCircle } from '@shared/short-lists.ts'
import { hearAlways, useChannel, whenEventsWereLost } from '../lib/channel.ts'
import { isFresh, keepAnswer, keptAnswer, markFresh, markFreshFrom, markStale, nothingIsFresh, placeOf, stamped } from '../lib/pagecache.ts'
import { aDotMovesAContactRow, applyAnEvent, namesWithOne, presenceWithOne, type HeldLists } from '../lib/chatdeltas.ts'
import { firstBetweenAgentPage, nextBetweenAgentPage, type AgentConversationPages } from '../lib/between-agent-pages.ts'
import { ChatFlowLine } from '../lib/chat-status.tsx'
import { presenceWord } from '../lib/server-sentences.ts'
import {
  readUnder,
  theContactListAsHeld,
  theReadFromTheTop,
  theRowsOnTopHeld,
  withTheNextPage,
  type TheNarrowing,
} from '../lib/the-contact-list-held.ts'
import {
  readTheParticipantsOnce,
  theReaderIs,
  useAfterTheBurst,
  whoIsReading,
  listsAnEventChanges,
  type ChatList,
  type TheOpenOne,
} from '../lib/chatlists.ts'
import { readCircleOnce, readGroupsOnce, readWorkspacesOnce } from '../lib/oneread.ts'
import { reviewChanged, useReview } from '../lib/review.ts'
// THE ONE CLOCK FOR AN AUTOMATIC READ, and its thirty seconds. The open conversation with an agent is
// read again on it, so the cannot-reach banner follows the latest reading. Problem msjrx1epgeBt.
import { aMachineReadClock, type MachineReadClock } from '../lib/oneclock.ts'
import { readStored, theBrowsersStore, writeStored } from '../lib/store.ts'
// THE ONE CLOCK. Chapter 4's eighth rule: local wall-clock time, one reader and one writer, both in
// src/shared/time.ts. A contact's row reads the time of the last message against this.
import { calendarDaysBetweenDayKeys, drawnStamp, nowStamp } from '@shared/time.ts'
import { REMIND_ME_LATER_CHOICES, type RemindMeLaterChoice } from '@shared/remind-me-later.ts'
import { whereRequestsGo } from '../lib/visiting.ts'
import { navigate, pathFor, recordPath, RouteLink, whoPath } from './router.tsx'
import { SleepLine, theLineAfterAPress, type TheSleepLine } from './SleepLine.tsx'
import { SleepPresses } from './SleepPresses.tsx'
import { settingsPath } from '@shared/addresses.ts'
import { recordNamedByTarget, TARGET_ATTRIBUTE, targetAttributes, targetFromAttributeValue, wordsNamedBy, type Context } from '@shared/targets.ts'
// A MESSAGE'S PARTS, from the one derivation the server resolves against. Problem DowO7yEioWp0.
import { recordRegionsOf } from '@shared/regions.ts'
import { nameAttributes } from './agent/pointing.ts'
import { addressableAt, pointedAt } from './agent/pointing.ts'
import { pressChoosesTheSubject, showWhatCanBeTalkedAbout, stopShowing, usePointMode } from './agent/open.ts'
// THE QUOTE ABOVE A MESSAGE SENT BY POINTING.
import { Quotes } from './chat/Quotes.tsx'
import { QuoteBox, type DraftQuote, type QuoteCaret } from './chat/QuoteBox.tsx'
import { MarkedWordsPaint, type AMarkedPartToDraw } from './chat/MarkedWords.tsx'
// A SENT MESSAGE'S MARKED PARTS, PAINTED ON ITS MARKDOWN, and the count of those that cannot be.
import { MarkedPartsFoot, MarksOnMarkdownStyle, MESSAGE_BODY_FIELD, NO_PLACE, THE_MARKDOWN_OF_A_MESSAGE, drawsPressesInside, markTheDrawing, saysWhereItIs, theMessageInPlaces, thePartsToDraw, type HowToMark } from './chat/marks-on-markdown.tsx'
import { markedPartsAfterATypedChange, markedPartsOverTheChosenWords, unmarkedOverTheChosenWords, type ADroppedPart } from '../lib/marking-the-words.ts'
import { knownTitleOf, useRecordTitles } from '../lib/titles.ts'
import { goToTheLead, useWhatALeadsPageShows, whereALeadGoes } from './Leading.tsx'
import { Avatar } from './Avatar.tsx'
// THE PICTURES A MESSAGE CARRIES, drawn the way this browser asked for. Criterion M64. The same
// component for all four conversations here and for the pool page, so the three answers are
// decided in one place rather than in five.
import { MessagePictures } from './MessagePictures.tsx'
// THE SHORT MARK A MESSAGE CARRIES WHEN IT WAS NOT DELIVERED, in place of the long notes: the chat draws
// it under the foot, and Developer detail opens the same words.
import { NotDeliveredLine } from './RoutedLine.tsx'
// THE RENDERER THE REPORTS USE, AND THE STYLESHEET ITS DRAWING NEEDS. Criterion M103: a message
// body is Markdown, and what Markdown means is worked out in one place for the whole product.
import { PaintTheWords, regionMarksOfRecord, renderMarkdown, SummaryStyle } from './SummaryBlocks.tsx'
// AND THE PURE HALF OF THE SAME READING, for a contact's row, which draws one line and no markup.
import { inlinePieces } from '@shared/inline.ts'
// AND WHAT THE PERSON CHOSE ABOUT THEM, which lives on their registry row since decision rJphPkCG3l7X.
import { saySomebodyChose } from '../lib/messagepictures.ts'
// AND WHETHER MEDIA A RECORD POINTS AT ARE LOADED. Criterion U5. A different setting from the one
// above: that one is a picture inside a message, this one is a picture in a report.
import { sayMediaLoad } from '../lib/mediaload.ts'
// WHICH KEY SENDS A MESSAGE: the shared rule and the person's own choice, so both composers here
// and every other message box act on the same setting.
import { aSendKeyPress, useSendKey } from '../lib/send-key.ts'
// AND CHOOSING ONE TO SEND. Criterion M65: the composer takes a file, chosen or dropped, says the
// size and the three types before it refuses anybody, and hands `send` the block to carry.
import { AttachPress, PictureToSendRow, usePictureToSend, type PictureChosen } from './PictureToSend.tsx'
import { Menu, Overlay, useCloseOnOutsidePress, useNarrow } from './ui.tsx'
import { anIntentThatAsks, theFlagFor, theFlagForLabel, theFlagsOf, readTheMarkedParts, type AFlagOfThePersons, type AMarkedPart, type AnIntentThatAsks, type IntentMark, type TheFlagsOfAPerson } from '@shared/intent-mark.ts'
import type { MessageLabel } from '@shared/message-label.ts'
import { LabelColourStyle } from './chat/LabelColours.tsx'
import { StartANewAgent, StartANewAgentFromHere, letThePressGoFor, useMadeOnThisPage } from './StartANewAgent.tsx'
import type { WorkspaceReading } from '@shared/workspaces.ts'
// THE ONE FUNCTION IN THE BROWSER THAT NAMES A PROJECT. Two spellings of one project's name is the
// defect the switcher had; this is the same function the switcher and the record pages call.
import { projectName } from '../lib/projects.ts'
import {
  inTheChosenProject,
  rememberProjectChoice,
  rememberedProjectChoice,
  theChoiceInForce,
  theProjectsToChooseFrom,
} from '../lib/projectmarks.ts'
import { ProjectMarks } from './ProjectMarks.tsx'
import { PERSONAL_AGENT_TAGS_CHANGED } from './PersonalAgentTags.tsx'
import { currentWorkspace, subscribeWorkspace } from '../lib/workspace.ts'
// ONE PAGE OF A CONVERSATION AT A TIME, AND WHAT WAS READ KEPT FOR THE NEXT ENTRY. Problem 8_cP0E-745e5.
import {
  afterANewerRead,
  afterAnOlderRead,
  aMessageJoinedTheHeldOnes,
  forgetEveryConversation,
  heldConversation,
  holdConversation,
  NEAR_THE_TOP,
  whatToAskFor,
  whatToAskForOlder,
} from '../lib/conversationpages.ts'

// ---------------------------------------------------------------------------- what is remembered

const WITH_KEY = 'mole-office.chat.with'
const SIZE_KEY = 'mole-office.chat.size'
/**
 * WHETHER THE PANEL WAS FILLING THE WINDOW LAST TIME. Criterion M104.
 *
 * It is remembered the way the panel's size and open contact are, and for the same reason: a person
 * who put the panel full screen has said how they want to read, and having to say it again after
 * every reload is the thing remembering exists to stop.
 */
const FULL_KEY = 'mole-office.chat.full'
/**
 * WHERE THE PANEL WAS MOVED TO, as its distance from the window's right and bottom edges, or nothing because it sits in
 * the corner. Wave 13y round 113, item 45. It is remembered in this browser beside the panel's size, for the reason
 * the size is.
 */
const PLACE_KEY = 'mole-office.chat.place'

/** Who this panel had open last time, as `kind:id`, or null. */
function rememberedContact(): { kind: ParticipantKind; id: string } | null {
  const held = readStored(WITH_KEY)
  if (!held.ok || held.value === null) return null
  return participantFromKey(held.value)
}

// --------------------------------------------------------------- a draft belongs to one conversation

/**
 * WHAT WAS TYPED INTO EACH CONVERSATION AND NOT SENT, read back out of this browser. Criterion M98.
 *
 * SESSION STORAGE AND NOT LOCAL. The criterion says so, and the reason is that these are words in
 * flight: a browser closed and opened again is a new sitting, and a draft that outlived it would be
 * sent days later by somebody who no longer remembers writing it. `readStored` reads local storage,
 * which is where the panel's size and open contact belong, so this reaches the store itself.
 *
 * A BROWSER THAT REFUSES THE STORE IS SAID OUT LOUD. The fault comes back beside the drafts and the
 * composer draws it, the same way the instruction composer does in src/web/lib/drafts.ts. What is
 * never done is losing the words and saying nothing.
 */
function draftsHeldHere(): { drafts: Record<string, string>; fault: string | null } {
  let held: string | null = null
  try {
    held = theBrowsersStore('session').getItem(CHAT_DRAFTS_KEY)
  } catch (err: unknown) {
    return { drafts: {}, fault: err instanceof Error ? err.message : String(err) }
  }
  if (held === null) return { drafts: {}, fault: null }
  const read = chatDraftsFromStored(held)
  // ABSENCE BEATS A GUESS. A stored set this build cannot read is dropped whole rather than
  // half-restored: half of somebody's sentence in the box, with nothing saying so, is worse than an
  // empty box with a line under it.
  if (read === null) {
    return { drafts: {}, fault: t('chat.draftUnreadable') }
  }
  return { drafts: read, fault: null }
}

/** Keep the drafts, and hand back why this browser will not, or null when it will. */
function keepTheDrafts(drafts: Record<string, string>): string | null {
  try {
    theBrowsersStore('session').setItem(CHAT_DRAFTS_KEY, JSON.stringify(drafts))
    return null
  } catch (err: unknown) {
    return err instanceof Error ? err.message : String(err)
  }
}

/**
 * THE DRAFTS, HELD OUTSIDE THE PANEL'S STATE, SO A KEY PRESS DRAWS THE BOX AND NOTHING ELSE.
 *
 * Problem VovNhzVWkNOl. The drafts used to be the panel's own state, so every key press drew the
 * whole panel again. Measured on 27 September 2026 with
 * tests/typing-on-the-chat-page-redraws-only-the-box.test.ts, 35 keys into a conversation of 120
 * messages, processor slowed four times: on the chat page each key drew 25 components in the lists
 * and 483 in the conversation again, and the median key took 32 ms to reach the screen. The corner
 * on Home drew the same 483 in the conversation and none in the lists, and took 24 ms. The page is
 * slower because it draws the lists beside the conversation.
 *
 * Now the box reads its own draft from here (`TheBox` below), and a key press redraws only the
 * box. The panel reads two things from here, and neither of them changes on an ordinary key press:
 * whether this browser keeps the drafts (`fault`), and the copy of the drafts the contact rows draw
 * (`forTheRows`).
 *
 * THE ROWS' COPY FOLLOWS THE DRAFTS WHEN THE TYPING PAUSES. A contact row draws a pencil and the
 * first words of its draft (criterion M99). If the rows read every key, every key would redraw the
 * lists, which is the lag. So the rows' copy is brought up to date `ROWS_FOLLOW_AFTER_MS` after the
 * last change. It is brought up to date at once when a draft is emptied, so a sent message's words
 * never stay on its row as a draft, and when the box moves to another conversation or away, so the
 * list the corner shows next has the newest words on its rows.
 *
 * ONE STORE FOR THE PAGE, READ FROM THE BROWSER ONCE, the first time a panel asks. The chat page
 * and the corner are two drawings of one chat, and both draw from this.
 */
const ROWS_FOLLOW_AFTER_MS = 400

/** What a send held when the key question was asked about it, which is what Send anyway sends. */
interface WhatTheQuestionHeld {
  words: string
  pictures: readonly PictureChosen[]
  /** The mark on the button at the asking, so Send anyway sends the message with the mark it was about to carry. */
  intent: IntentMark
  /** And the person's own label on it at the asking, or null because none was chosen. */
  label: MessageLabel | null
}

interface TheDrafts {
  drafts: Record<string, string>
  fault: string | null
  quoteFault: string | null
  quotes: Record<string, readonly DraftQuote[]>
  /** The marked parts kept with each draft, beside its words, and why this browser could not keep some. */
  parts: Record<string, readonly AMarkedPart[]>
  partsFault: string | null
  forTheRows: Record<string, string>
  /** The drafts as this browser's store holds them: each with every piece that looks like a key left out. */
  kept: Record<string, string>
  /** The words of each draft still being written, which the store does not keep (src/web/lib/the-kept-chat-draft.ts). */
  writing: Record<string, string[]>
}

let theDrafts: TheDrafts | null = null
const draftWatchers = new Set<() => void>()
let rowsFollowLater: ReturnType<typeof setTimeout> | null = null
const QUOTE_DRAFTS_KEY = 'mole-office.chat.quote-drafts'
const NO_DRAFT_QUOTES: readonly DraftQuote[] = []
const MARKED_PARTS_DRAFTS_KEY = 'mole-office.chat.marked-part-drafts'
const NO_DRAFT_PARTS: readonly AMarkedPart[] = []

/** Read the quote parts separately so older text-only drafts remain readable. */
function draftQuotesHeldHere(drafts: Record<string, string>): { quotes: Record<string, readonly DraftQuote[]>; fault: string | null } {
  try {
    const stored = theBrowsersStore('session').getItem(QUOTE_DRAFTS_KEY)
    if (stored === null) return { quotes: {}, fault: null }
    const parsed: unknown = JSON.parse(stored)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { quotes: {}, fault: t('chat.draftUnreadable') }
    const quotes: Record<string, readonly DraftQuote[]> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) return { quotes: {}, fault: t('chat.draftUnreadable') }
      let previous = 0
      const ids = new Set<string>()
      for (const quote of value as unknown[]) {
        if (quote === null || typeof quote !== 'object') return { quotes: {}, fault: t('chat.draftUnreadable') }
        const q = quote as Partial<DraftQuote>
        if (typeof q.id !== 'string' || ids.has(q.id) || typeof q.about !== 'string' || !Number.isInteger(q.at) || q.at! < previous || q.at! > (drafts[key] ?? '').length || q.context === null || typeof q.context !== 'object' || q.context.target === null || typeof q.context.target !== 'object') return { quotes: {}, fault: t('chat.draftUnreadable') }
        ids.add(q.id)
        previous = q.at!
      }
      quotes[key] = value as DraftQuote[]
    }
    return { quotes, fault: null }
  } catch (err: unknown) {
    return { quotes: {}, fault: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Read the marked parts kept with the drafts, through the office's own reader. A part that no longer names the draft's
 * words is not drawn and not sent: half a mark is worse than a part that says it was not kept.
 */
function draftPartsHeldHere(drafts: Record<string, string>): { parts: Record<string, readonly AMarkedPart[]>; fault: string | null } {
  try {
    const stored = theBrowsersStore('session').getItem(MARKED_PARTS_DRAFTS_KEY)
    if (stored === null) return { parts: {}, fault: null }
    const parsed: unknown = JSON.parse(stored)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { parts: {}, fault: t('chat.marksNotKeptWithTheDraft', { reason: t('chat.draftUnreadable') }) }
    const parts: Record<string, readonly AMarkedPart[]> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) return { parts: {}, fault: t('chat.marksNotKeptWithTheDraft', { reason: t('chat.draftUnreadable') }) }
      const read = readTheMarkedParts({ body: drafts[key] ?? '', markedParts: value })
      if (!read.ok) return { parts: {}, fault: t('chat.marksNotKeptWithTheDraft', { reason: read.why }) }
      if (read.parts.length > 0) parts[key] = read.parts
    }
    return { parts, fault: null }
  } catch (err: unknown) {
    return { parts: {}, fault: t('chat.marksNotKeptWithTheDraft', { reason: err instanceof Error ? err.message : String(err) }) }
  }
}

function draftsNow(): TheDrafts {
  if (theDrafts === null) {
    const read = draftsHeldHere()
    const quoted = draftQuotesHeldHere(read.drafts)
    const marked = draftPartsHeldHere(read.drafts)
    theDrafts = { drafts: read.drafts, fault: read.fault, quoteFault: quoted.fault, quotes: quoted.quotes, parts: marked.parts, partsFault: marked.fault, forTheRows: read.drafts, kept: read.drafts, writing: {} }
  }
  return theDrafts
}

function watchTheDrafts(watcher: () => void): () => void {
  draftWatchers.add(watcher)
  return () => {
    draftWatchers.delete(watcher)
  }
}

function sayTheDraftsMoved(): void {
  for (const watcher of draftWatchers) watcher()
}

/** Write one conversation's draft, keep all of them in the browser, and tell whoever draws them. */
function writeADraft(key: string, next: string): void {
  const was = draftsNow()
  const drafts = withTheChatDraft(was.drafts, key, next)
  const keeps = theDraftAsTheStoreKeepsIt(was.drafts[key] ?? '', next, was.writing[key] ?? [])
  const kept = withTheChatDraft(was.kept, key, keeps.kept)
  const writing = { ...was.writing, [key]: keeps.writing }
  const emptied = next === '' && (was.drafts[key] ?? '') !== ''
  theDrafts = { ...was, drafts, fault: keepTheDrafts(kept), forTheRows: emptied ? drafts : was.forTheRows, kept, writing }
  if (rowsFollowLater !== null) clearTimeout(rowsFollowLater)
  rowsFollowLater = null
  if (!emptied) rowsFollowLater = setTimeout(rowsFollowNow, ROWS_FOLLOW_AFTER_MS)
  sayTheDraftsMoved()
}

function quotesInDraft(key: string | null): readonly DraftQuote[] {
  return key === null ? NO_DRAFT_QUOTES : (draftsNow().quotes[key] ?? NO_DRAFT_QUOTES)
}

/** The marked parts kept with one conversation's draft, or none. */
function partsInDraft(key: string | null): readonly AMarkedPart[] {
  return key === null ? NO_DRAFT_PARTS : (draftsNow().parts[key] ?? NO_DRAFT_PARTS)
}

/** Keep the marked parts with the conversation, in the same browser session as its words. */
function writeDraftParts(key: string | null, parts: readonly AMarkedPart[]): void {
  if (key === null) return
  const now = draftsNow()
  const next = { ...now.parts }
  if (parts.length === 0) delete next[key]
  else next[key] = parts
  let partsFault: string | null = null
  try {
    theBrowsersStore('session').setItem(MARKED_PARTS_DRAFTS_KEY, JSON.stringify(next))
  } catch (err: unknown) {
    partsFault = t('chat.marksNotKeptWithTheDraft', { reason: err instanceof Error ? err.message : String(err) })
  }
  theDrafts = { ...now, parts: next, partsFault }
  sayTheDraftsMoved()
}

/** Keep the quote positions with the conversation, in the same browser session as its words. */
function writeDraftQuotes(key: string | null, quotes: readonly DraftQuote[]): void {
  if (key === null) return
  const now = draftsNow()
  const next = { ...now.quotes }
  if (quotes.length === 0) delete next[key]
  else next[key] = quotes
  let quoteFault: string | null = null
  try {
    theBrowsersStore('session').setItem(QUOTE_DRAFTS_KEY, JSON.stringify(next))
  } catch (err: unknown) {
    quoteFault = err instanceof Error ? err.message : String(err)
  }
  theDrafts = { ...now, quotes: next, quoteFault }
  sayTheDraftsMoved()
}

/** Bring the rows' copy of the drafts up to date now. */
function rowsFollowNow(): void {
  if (rowsFollowLater !== null) clearTimeout(rowsFollowLater)
  rowsFollowLater = null
  const now = draftsNow()
  if (now.forTheRows === now.drafts) return
  theDrafts = { ...now, forTheRows: now.drafts }
  sayTheDraftsMoved()
}

function draftOf(key: string | null): string {
  return key === null ? '' : (draftsNow().drafts[key] ?? '')
}

/**
 * TAKE OUT OF ONE DRAFT THE WORDS A FINISHED SEND CARRIED, AND ONLY THOSE. Problem DpiY-sIBZoln: a send emptied the whole
 * box when it finished, so words typed while its upload was still running were lost without a word. `carried` is the box
 * as it was at the press. If the box still holds just that, it is emptied. If the person typed on after it, what they
 * added stays. If they changed the sent words themselves, the box is left as it is: the sent words are on their bubble,
 * and nothing the person typed is thrown away.
 */
function takeTheSentWordsOut(key: string | null, carried: string): void {
  if (key === null) return
  const now = draftOf(key)
  if (now === carried) writeADraft(key, '')
  else if (now.startsWith(carried)) writeADraft(key, now.slice(carried.length).trimStart())
}

function positionsForSend(quotes: readonly DraftQuote[], typed: string, words: string): number[] | undefined {
  if (quotes.length === 0) return undefined
  const leading = typed.length - typed.trimStart().length
  return quotes.map((quote) => Math.min(words.length, Math.max(0, quote.at - leading)))
}

/**
 * THE PARTS AS THE SENT WORDS HOLD THEM. The send trims the words, and a part's offsets are in the untrimmed draft, so
 * the spaces the trim took off the front are taken off its offsets too. A part that no longer names the sent words is
 * not sent: the office refuses such a part, and the person's words are what matters.
 */
function partsForTheSentWords(parts: readonly AMarkedPart[], typed: string, words: string): AMarkedPart[] {
  const leading = typed.length - typed.trimStart().length
  return parts.flatMap((part) => {
    const from = part.from - leading
    const to = part.to - leading
    if (from < 0 || to > words.length) return []
    const quote = words.slice(from, to)
    return quote === part.quote ? [{ ...part, from, to, quote }] : []
  })
}

/** Remove only the parts carried by this send, retaining additions made during an upload. */
function takeTheSentDraftOut(key: string | null, words: string, quotes: readonly DraftQuote[]): void {
  if (key === null) return
  const before = draftOf(key)
  takeTheSentWordsOut(key, words)
  const after = draftOf(key)
  const removed = before.endsWith(after) ? before.length - after.length : 0
  const sent = new Set(quotes.map((quote) => quote.id))
  writeDraftQuotes(key, quotesInDraft(key).filter((quote) => !sent.has(quote.id)).map((quote) => ({ ...quote, at: Math.max(0, quote.at - removed) })))
}

/**
 * WHAT IS TYPED IN ONE CONVERSATION, AND THE PRESS THAT CHANGES IT, for the part of the panel that
 * draws the box. It is its own component so that a key press draws this and not the panel around it.
 * `children` is called with the words in the box.
 */
function TheBox({ draftKey, children }: { draftKey: string | null; children: (typed: string) => ReactNode }) {
  const typed = useSyncExternalStore(
    watchTheDrafts,
    () => draftOf(draftKey),
    () => draftOf(draftKey),
  )
  return <>{children(typed)}</>
}

// ------------------------------------------------------------------ how big the panel is, and why

/**
 * THE WIDTH BELOW WHICH THE PANEL IS THE WHOLE SCREEN, written once and read by both halves.
 *
 * The stylesheet at the bottom of this file draws the phone layout at this width, and the component
 * asks the browser the same question to decide whether to draw the drag handles at all. Spelling the
 * number twice is this repository's recurring defect: the stylesheet could move and the handles
 * would stay, with nothing failing.
 */
const THE_WHOLE_SCREEN_BELOW = '40rem'

/** The size the panel opens at before anybody has dragged it, in pixels. 21rem by 32rem. */
const SIZE_TO_START_WITH = { width: 336, height: 512 } as const

/** The smallest it may be dragged to. Below this the header and the composer stop fitting. */
const SMALLEST = { width: 260, height: 220 } as const

/** How much of the window the panel leaves free at its widest and tallest. */
const ROOM_LEFT = { width: 32, height: 96 } as const

/** Which edge is being dragged. The corner is both at once. */
type Edge = 'left' | 'top' | 'corner'

/** How far a press on the panel's top row travels before it is a move of the panel and no longer a press. */
const A_PRESS_BECOMES_A_MOVE_PX = 4

export interface PanelSize {
  width: number
  height: number
}

/** Where a moved panel sits: its distance in pixels from the window's right edge and from its bottom edge. */
export interface PanelPlace {
  right: number
  bottom: number
}

/**
 * A size held inside what the window can show and above what the panel can draw.
 *
 * The window is asked here rather than left to CSS, because a stored size from a bigger monitor
 * would otherwise open a panel wider than the screen and the handle to shrink it would be off it.
 *
 * A MOVED PANEL GROWS NO FURTHER THAN THE WINDOW'S LEFT AND TOP EDGES. The panel keeps its bottom-right corner where
 * it was put while an edge is dragged, so the room it has is the room between that corner and those two edges.
 */
export function sizeHeldInside(
  want: PanelSize,
  window: { width: number; height: number },
  place: PanelPlace | null = null,
): PanelSize {
  const widest = Math.max(SMALLEST.width, window.width - ROOM_LEFT.width)
  const tallest = Math.max(SMALLEST.height, window.height - ROOM_LEFT.height)
  const held = {
    width: Math.round(Math.min(Math.max(want.width, SMALLEST.width), widest)),
    height: Math.round(Math.min(Math.max(want.height, SMALLEST.height), tallest)),
  }
  if (place === null) return held
  return {
    width: Math.max(SMALLEST.width, Math.min(held.width, window.width - place.right)),
    height: Math.max(SMALLEST.height, Math.min(held.height, window.height - place.bottom)),
  }
}

/**
 * A place held inside the window, so the whole panel is on the screen. A window made smaller pulls a moved panel back
 * inside it; the panel's size is held first, by `sizeHeldInside`, so a panel that still fits is moved and not shrunk.
 */
export function placeHeldInside(want: PanelPlace, size: PanelSize, window: { width: number; height: number }): PanelPlace {
  return {
    right: Math.round(Math.min(Math.max(want.right, 0), Math.max(0, window.width - size.width))),
    bottom: Math.round(Math.min(Math.max(want.bottom, 0), Math.max(0, window.height - size.height))),
  }
}

/**
 * The place this panel was moved to, or null because it sits in the corner. Two numbers and nothing else, written as
 * `right x bottom`; a value this build cannot read is the corner, as an unreadable size is the size it starts at.
 */
export function placeFromWhatWasStored(said: string | null): PanelPlace | null {
  if (said === null || said === '') return null
  const halves = said.split('x')
  // AN EMPTY HALF IS NOT A ZERO, though `Number` reads it as one.
  if (halves.length !== 2 || halves.some((one) => one.trim() === '')) return null
  const right = Number(halves[0])
  const bottom = Number(halves[1])
  if (!Number.isFinite(right) || !Number.isFinite(bottom)) return null
  if (right < 0 || bottom < 0) return null
  return { right, bottom }
}

function rememberedPlace(): PanelPlace | null {
  const held = readStored(PLACE_KEY)
  return held.ok ? placeFromWhatWasStored(held.value) : null
}

/**
 * The size this panel was left at, or the size it starts at because nobody has dragged it.
 *
 * A BROWSER THAT REFUSES STORAGE IS NOT AN ERROR HERE, for the reason the open flag above gives:
 * the size is a convenience, and the honest answer when nothing can be read is the size it starts
 * at. A stored value this build cannot read is dropped the same way — two numbers and nothing else.
 */
export function sizeFromWhatWasStored(said: string | null): PanelSize | null {
  if (said === null) return null
  const halves = said.split('x')
  if (halves.length !== 2) return null
  const width = Number(halves[0])
  const height = Number(halves[1])
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null
  if (width <= 0 || height <= 0) return null
  return { width, height }
}

function rememberedSize(): PanelSize {
  const held = readStored(SIZE_KEY)
  const said = held.ok ? sizeFromWhatWasStored(held.value) : null
  return said ?? { ...SIZE_TO_START_WITH }
}

// ------------------------------------------------------- the three lists and the tabs above them

/** The three lists the panel can show, in the order their tabs are drawn. Criterion M18. */
const LISTS = ['contacts', 'groups', 'between'] as const

/** One of the three. */
type WhichList = (typeof LISTS)[number]

/**
 * The name on each tab, taken from the words each list already had.
 *
 * Nothing is worded here. A tab named separately from the heading it replaced would be the same
 * name written twice and free to drift, which is this repository's recurring defect.
 */
const LIST_NAMES: Readonly<Record<WhichList, string>> = {
  get contacts() { return CHAT_WORDS.contacts },
  get groups() { return GROUP_WORDS.heading },
  get between() { return CHAT_WORDS.betweenAgents },
}

// ---------------------------------------------------------------------------- small pieces


/** The stored message a body belongs to: its record id, and its title for the region tree. */
interface MessageWhoseWordsTheseAre {
  id: string
  title: string
}

/**
 * A message body with the record ids and page addresses in it drawn as things to press.
 *
 * The record links are drawn by the shared inline reading in src/shared/inline.ts, which the
 * Markdown below goes through; this draws the page addresses.
 *
 * IT IS EXPORTED because a message's own page draws the body exactly as the chat does, by criterion
 * E2 and the decision it rests on: one reader of Markdown and one linker of record ids for the
 * panel and for the page, rather than a second block reader that would drift from this
 * one. Nothing in the panel's own drawing changes.
 */
export function Body({ text, message, markedParts, flags, sourceOffset = 0 }: {
  text: string; message?: MessageWhoseWordsTheseAre; markedParts?: readonly AMarkedPartToDraw[]
  flags?: TheFlagsOfAPerson; sourceOffset?: number
}) {
  const inspect = useInspect()
  // WHICH PART OF THE MESSAGE EACH PARAGRAPH IS, when these words are a stored message's own body.
  // The tree is the one the server resolves a comment against, so a right-click on a sentence takes
  // that sentence and the write door finds it. Without a message nothing is declared, which is right
  // for a system line's few words, a notebook entry and a message not stored yet.
  const regions = useMemo(() => {
    if (message === undefined) return null
    const root = recordRegionsOf({ kind: 'message', data: { body: text }, title: message.title, summary: null, relations: [] })
    return { origin: { field: MESSAGE_BODY_FIELD, stored: text }, marks: regionMarksOfRecord(message.id, root) }
  }, [message, text])

  /** A page address in the words, drawn as a press. */
  const pressOf = (piece: Extract<BodyPiece, { what: 'page' }>, key: number): ReactNode => (
    <button
      key={key}
      type="button"
      className="px-chat-link"
      onClick={() => {
        navigate(piece.path.slice(1))
      }}
    >
      {theWordsOfALink(piece, null, inspect)}
    </button>
  )

  /** One run of plain words, with the page addresses in it drawn as presses. */
  const drawWords = (words: string, key: string): ReactNode => (
    <Fragment key={key}>
      {piecesOfBody(words).map((piece, at) => (piece.what === 'page' ? pressOf(piece, at) : <span key={at}>{piece.text}</span>))}
    </Fragment>
  )

  // THE REPORTS' OWN RENDERER DRAWS THE BODY. Criterion M103. On 9 September 2026 the owner reported
  // that the chat did not draw Markdown properly: not bold, not tables, not bullets or numbered
  // lists, and not even line breaks. What Markdown
  // means is worked out in `renderMarkdown`, and this panel asks it rather than holding a second
  // opinion. `sb` carries the tokens those rules read; the chat's own stylesheet sets them smaller.
  // `lineBreaks` draws a single newline as a line break, as every chat product does; the reports
  // leave it off.
  const parts = markedParts ?? []
  const drawing = renderMarkdown(text, 'chat', regions?.origin ?? (parts.length > 0 ? { field: MESSAGE_BODY_FIELD, stored: text } : null), regions?.marks ?? null, THE_MARKDOWN_OF_A_MESSAGE)
  // WITH MARKED PARTS, ONE WALK DRAWS THE PRESSES AND PAINTS THE PARTS, and a table paints its own cells with the same
  // walk as it draws them. Without parts the drawing is the one it always was.
  const how: HowToMark | null = flags !== undefined && parts.length > 0 ? { source: text, sourceOffset, parts, flags, press: pressOf } : null
  return (
    <div className="sb px-chat-md" data-chat-content>
      {/* THE RULES THE REPORTS' MARKDOWN IS SET BY, here as well as in the panel. A message's own page draws its body
          with this component, and with the chat closed nothing else on that page asked for them, so a typed number
          and every other rule of the stylesheet went missing (wave 13y round 137's refusal). React draws one copy. */}
      <SummaryStyle />
      {how === null ? (
        pressesInside(drawing, drawWords, 'b')
      ) : (
        <>
          {/* AND THE FLAGS' COLOURS, for the same reason: the page may draw a part with the chat closed. */}
          <LabelColourStyle />
          <MarksOnMarkdownStyle />
          <PaintTheWords.Provider value={(drawn) => markTheDrawing(drawn, { ...how, press: null }).drawn}>
            {markTheDrawing(drawing, how).drawn}
          </PaintTheWords.Provider>
        </>
      )}
    </div>
  )
}

/**
 * Draw the stored order, retaining the earlier quote-first drawing for messages without positions.
 *
 * Each words segment is rendered as Markdown, with marks measured against the whole stored body.
 */
function OrderedMessage({ entry, titles, ofMessage, flags }: {
  entry: { body: string; quotes: readonly Context[]; quotePositions?: readonly number[] | null; markedParts?: readonly AMarkedPartToDraw[] }
  titles: Readonly<Record<string, string>>
  ofMessage?: PoolEntry
  flags: TheFlagsOfAPerson
}) {
  const parts = thePartsToDraw(entry)
  const positions = entry.quotePositions ?? null
  if (positions === null) return <>
    <Quotes entry={entry} titles={titles} ofMessage={ofMessage} />
    <div className="px-chat-words"><Body text={entry.body} message={ofMessage} markedParts={parts} flags={flags} /></div>
  </>
  return <>{theMessageInPlaces(entry.body, entry.quotes.map((_, at) => at), positions).map((part, at) => {
    if (part.kind === 'quote') return <Quotes key={at} entry={entry} titles={titles} ofMessage={ofMessage} only={part.quote} />
    return <div key={at} className="px-chat-words"><Body text={part.text} markedParts={parts} flags={flags} sourceOffset={part.at} /></div>
  })}</>
}

/**
 * THE SAME DRAWING, WITH THE RECORD IDS AND PAGE ADDRESSES IN IT MADE PRESSABLE. Criterion M103.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A WALK OVER THE DRAWING AND NOT A SECOND READER
 * ---------------------------------------------------------------------------------------
 *
 * Two criteria are true of a message body at once: it is Markdown (M103) and a record id in it is a
 * link (M42, M48). Only one of them may own the reading of the text, and it is Markdown's, because
 * that is the renderer the reports use and a second block reader here would be the same fact in two
 * places. So the body goes through `renderMarkdown` exactly as a report does, and this walks what
 * came back, replacing the plain strings at the leaves. Nothing about the Markdown is re-read.
 *
 * CODE IS NEVER TOUCHED. A twelve-character run inside a code span or a fenced block is characters
 * somebody quoted, and turning it into a link would change what they quoted. Every code box this
 * renderer builds has a `code` element around its text, so skipping that element is the whole rule.
 *
 * NOTHING HERE BUILDS MARKUP FROM THE MESSAGE. Every node is a React element or a string, so a body
 * carrying HTML or a script is drawn as the characters it is.
 */
function pressesInside(
  node: ReactNode,
  drawWords: (words: string, key: string) => ReactNode,
  key: string,
): ReactNode {
  if (typeof node === 'string') return drawWords(node, key)
  if (Array.isArray(node)) {
    return (node as ReactNode[]).map((one, at) => pressesInside(one, drawWords, `${key}.${String(at)}`))
  }
  if (isValidElement(node)) {
    // A LINK'S WORDS ARE ITS OWN (wave 13k round 35): a record id or an address in them is not drawn as a
    // second press inside the link.
    if (node.type === 'code' || node.type === 'a') return node
    const props = node.props as Record<string, unknown> & { children?: ReactNode }
    const held = props.children
    if (held === undefined) return node
    // A RUN THAT SAYS WHERE ITS CHARACTERS ARE STORED, AND WILL NOT DRAW THOSE CHARACTERS, SAYS
    // NOTHING. A record id in it is drawn as the record's name and a page address as a press, so the
    // drawn words are no longer the stored ones and a selection inside the run would be placed at the
    // wrong characters. Dropping the two attributes keeps the words quotable, and places nothing.
    const redrawn = saysWhereItIs(props) && drawsPressesInside(held)
    return cloneElement(
      node as ReactElement<{ children?: ReactNode }>,
      redrawn ? (NO_PLACE as never) : undefined,
      pressesInside(held, drawWords, `${key}c`),
    )
  }
  return node
}

/**
 * The tick or the clock on the reader's own message, with the sentence that says what it means.
 *
 * WHAT THE SENTENCE IS, IS DECIDED IN shared/messages.ts AND NOT HERE. `deliveryReading` draws the
 * row's own sentence — which run took the message, why nothing could be started, who stopped the run
 * — and falls back to the mark's general reading for a row that says nothing. A read row starts with
 * the read sentence as well, so a retained hand-over sentence does not hide that it was read.
 * Other marks keep only their row's own sentence. This used to write the
 * general reading and then the row's sentence after it, which put *Something serving the person it
 * is addressed to has read this message* in front of a line Mole Office wrote that no run ever read.
 * Problem `HfBVX-es5qip`.
 *
 * THE GLYPHS ARE FIXED BY THE CRITERION. M113, as a decision amended it, says: queued ✓, delivered
 * muted ✓✓, read green ✓✓. This component only ever draws a row
 * that already exists on the server, so it never draws ◷ or ! itself — those are drawn by
 * `SendingMark` below, on a message that does not exist as a row yet. `shape: 'clock'` still reaches
 * here for a delivery mark this build does not recognise (`deliveryWord`'s fallback in
 * shared/messages.ts), and it draws the same ◷ for the same reason: an unreadable state is honestly
 * closer to *not sure yet* than to either tick.
 *
 * `shape: 'words'` DRAWS THE MARK'S WORD AND NO GLYPH. It is the archived mark: nobody read the message,
 * so a tick would say something false (problem 0WUuvB0IhRfb).
 */
function Mark({ mark, because }: { mark: DeliveryMark; because: string | null }) {
  const reading = deliveryReading({ mark, because })
  const says = reading.sentence
  return (
    <span className="px-chat-mark" data-shape={reading.shape} title={says} aria-label={reading.word}>
      {reading.shape === 'clock' ? '◷' : reading.shape === 'tick' ? '✓' :
        reading.shape === 'double-tick' || reading.shape === 'read' ? '✓✓' : reading.word}
      <span className="px-sr">{says}</span>
    </span>
  )
}

/**
 * THE READER'S NEWEST MESSAGE THAT STILL WAITS FOR THE AGENT THIS CONVERSATION IS WITH, or null. Criterion M86.
 *
 * What happens next to it is drawn under it in words, because a tick alone said only *Waiting*. It is drawn
 * once, under the newest, so five messages sent while nothing answers do not repeat one line five times; each
 * tick keeps its own sentence on hover. A person on the other side is never waited for in this sense.
 */
function theNewestWaitingMessage(
  messages: readonly PoolEntry[],
  me: { kind: string; id: string } | null,
  them: { kind: string; id: string } | null,
): string | null {
  if (me === null || them === null || them.kind !== 'agent') return null
  for (let at = messages.length - 1; at >= 0; at -= 1) {
    const one = messages[at]
    if (one === undefined || isASystemLine(one) || one.sentBy === null) continue
    if (one.sentBy.kind !== me.kind || one.sentBy.id !== me.id) continue
    if (one.deliveries.some((d) => d.to.kind === them.kind && d.to.id === them.id && d.mark === 'queued')) return one.id
  }
  return null
}

/**
 * WHERE A MESSAGE STANDS BEFORE THE REAL ROW EXISTS, criterion M113: ◷ while the press is on its
 * way to the server, ✓ in the brief gap between the server answering and the next fetch drawing
 * the real row, or a red ! with the reason and a press to try again.
 *
 * A SEPARATE COMPONENT FROM `Mark` ABOVE ON PURPOSE. `Mark` draws a stored `DeliveryMark`, which
 * this is not: nothing here has a row yet. Keeping them apart means a local, not-yet-real state can
 * never be mistaken for one the server has actually confirmed, on screen or in a test reading
 * data-shape.
 */
function SendingMark({
  state,
  reason,
  shortReason,
  stored,
  onRetry,
}: {
  state: PendingSendState
  reason: string | null
  /** The server's short reason, when it sent one. Criterion M113a. */
  shortReason: string | null
  /** Whether the server stored the letter anyway, so a second press may not store a second one. */
  stored: boolean
  onRetry: () => void
}) {
  // NO ANSWER CAME IN TIME, AND NOBODY HAS LOOKED YET. Problem KzLydNEm4HYX. The clock, because the
  // chat is still waiting (now for a read of the conversation), and never the red !, which would
  // say the send failed when that is not known. No press: a second press may store a second letter.
  if (state === 'not-known') {
    const says = CHAT_WORDS.sendNotKnownYet(SEND_TIMEOUT_MS / 1000)
    return (
      <span className="px-chat-send-not-known">
        <span className="px-chat-mark" data-shape="not-known" title={says} aria-label={says}>
          ◷
          <span className="px-sr">{says}</span>
        </span>
        <span className="px-chat-send-not-known-why">{says}</span>
      </span>
    )
  }
  // NO ANSWER CAME, AND A READ MADE AFTER THE TIMEOUT DOES NOT HOLD THE LETTER. The red ! and Send
  // again, as for a failed send, with words that say what the read found and nothing more.
  if (state === 'not-in-the-conversation') {
    const says = CHAT_WORDS.sendNotInTheConversation(SEND_TIMEOUT_MS / 1000)
    return (
      <span className="px-chat-send-failed">
        <span className="px-chat-mark" data-shape="failed" title={says} aria-label={says}>
          !
          <span className="px-sr">{says}</span>
        </span>
        <span className="px-chat-send-failed-why">{says}</span>
        <button type="button" className="px-chat-send-again" onClick={onRetry}>
          {CHAT_WORDS.sendAgain}
        </button>
      </span>
    )
  }
  if (state === 'failed') {
    // A KNOWN REASON IS SHOWN SHORT, and the whole sentence is kept on the mark's hover and for a
    // screen reader. Criterion M113a; every other failure keeps the words M113 has always drawn.
    const said =
      shortReason === null ? CHAT_WORDS.sendFailed(reason ?? '') : CHAT_WORDS.sendError(shortReason)
    const whole = shortReason === null ? said : (reason ?? said)
    return (
      <span className="px-chat-send-failed">
        <span className="px-chat-mark" data-shape="failed" title={whole} aria-label={whole}>
          !
          <span className="px-sr">{whole}</span>
        </span>
        <span className="px-chat-send-failed-why">{said}</span>
        {/* A SECOND PRESS WOULD STORE A SECOND LETTER AND GET THE SAME ANSWER, so no press is
            offered for a letter the server already stored. */}
        {stored ? null : (
          <button type="button" className="px-chat-send-again" onClick={onRetry}>
            {CHAT_WORDS.sendAgain}
          </button>
        )}
      </span>
    )
  }
  const says = state === 'sending' ? CHAT_WORDS.sendingNotYetReceived : CHAT_WORDS.sendingReceivedByServer
  return (
    <span className="px-chat-mark" data-shape={state === 'sending' ? 'pending' : 'tick'} title={says} aria-label={says}>
      {state === 'sending' ? '◷' : '✓'}
      <span className="px-sr">{says}</span>
    </span>
  )
}

/**
 * WHERE A MESSAGE WAS WRITTEN FROM, drawn as a small line beside it: "from cedar, Chrome".
 *
 * Criterion M63, which holds the owner's question: can Mole Office tell which machine and which browser a
 * message was written from?
 *
 * NOTHING IS DRAWN WHERE NOTHING IS KNOWN, the same rule `RanBy` in ChatRanBy.tsx answers to. Every message
 * written before this existed carries nothing, and so does every comment of the older kind: they
 * draw no line at all, not a dash and not "unknown". `whereItWasWrittenReads` is the one place the
 * words are decided, in src/shared/messages.ts, because a test reads them without a browser.
 */
function Urgent({ said }: { said: PoolEntry }) {
  if (!said.urgent) return null
  // THE MARK IS IN THE PAGE'S LANGUAGE. The mark on the message is criterion M62; criterion M90 and two
  // decisions put it in the page's language. The Chinese word
  // list keeps the wording it was given. There is no hover text: it only translated the mark, which the
  // language switch now does (problem OkWHLwRD6AAE).
  return <span className="px-chat-urgent">{t('chat.urgent.mark')}</span>
}

/** A FLAG'S NAME AS THE BUTTON AND THE BUBBLE SAY IT, from the person's own list of flags. */
function theMarksName(mark: IntentMark, flags: TheFlagsOfAPerson): string {
  const flag = theFlagFor(mark, flags)
  if (flag !== null) return flag.name
  if (mark === 'just-ask') return t('message.intent.name.justAsk')
  if (mark === 'proposal-first') return t('message.intent.name.proposalFirst')
  return t('chat.intent.name.none')
}

/**
 * THE BUTTON LEFT OF SEND THAT SAYS WHAT THE AGENT MAY DO WITH THE NEXT MESSAGE. Its menu opens upward with the name
 * and, under it, the description the person wrote for that flag when there is one, and a tick on the one in force, and
 * a chosen flag is drawn loud so it is never missed. "No mark" stays quiet.
 *
 * IT IS A FLAG IN A BORDER OF ITS OWN, just left of Send, and it shows the chosen flag's short word beside the flag. The
 * long name is still the button's name for a screen reader.
 *
 * THE MENU LISTS THE TWO SHIPPED FLAGS, THE PERSON'S OWN, AND 'NO MARK' LAST, in the order `theFlagsOf` gives them. A
 * chosen flag is drawn in its colour on a soft ground of the same colour, whichever kind it is, by one drawing rule.
 * The message carries an own flag as its word and colour only; the description and instruction stay on the person's row.
 */
function IntentSelector({
  chosen,
  flags,
  onChoose,
  onOpen,
}: {
  chosen: AFlagOfThePersons
  flags: TheFlagsOfAPerson
  onChoose: (flag: AFlagOfThePersons) => void
  /** Taken before the press moves the focus, so the selection in the box is still there to be read. */
  onOpen?: () => void
}) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement | null>(null)
  const name = chosen.name
  const word = chosen.shortWord
  const chosenAt = flags.all.findIndex((one) => one.id === chosen.id)
  const afterChoosing = (): void => {
    setOpen(false)
    button.current?.focus()
  }
  return (
    <>
      <button
        type="button"
        ref={button}
        className={chosen.kind === 'none' ? 'px-chat-intent' : 'px-chat-intent px-label-ink'}
        data-intent={chosen.kind === 'shipped' ? chosen.id : chosen.kind === 'none' ? 'none' : undefined}
        data-chosen={chosen.kind === 'none' ? 'no' : 'yes'}
        {...(chosen.kind === 'none' ? {} : { 'data-colour': chosen.colour, 'data-words-colour': chosen.wordsColour })}
        aria-label={chosen.kind === 'own' ? t('chat.label.selectorNow', { word: chosen.name }) : t('chat.intent.selectorNow', { mark: name })}
        title={name}
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        onPointerDown={() => {
          onOpen?.()
        }}
        onClick={() => {
          setOpen(!open)
        }}
      >
        <FlagShape />
        <span className="sr-only">{name}</span>
        {word === '' ? null : (
          <span className="px-chat-intent-word" aria-hidden="true">
            {word}
          </span>
        )}
      </button>
      {open ? (
        <Menu
          label={t('chat.intent.selector')}
          under={button}
          above
          focusIndex={chosenAt < 0 ? flags.all.length - 1 : chosenAt}
          onClose={() => {
            setOpen(false)
          }}
          onEscape={() => {
            button.current?.focus()
          }}
          choices={flags.all.map((flag) => ({
            key: flag.id,
            chosen: flag.id === chosen.id,
            mark: (
              <span className="px-chat-intent-tick" aria-hidden="true">
                {flag.id === chosen.id ? '✓' : ''}
              </span>
            ),
            label: (
              <span className={flag.kind === 'none' ? 'px-chat-intent-line' : 'px-chat-intent-line px-chat-intent-line-colour px-label-ink'} data-colour={flag.kind === 'none' ? undefined : flag.colour} data-intent={flag.kind === 'shipped' ? flag.id : flag.kind === 'none' ? 'none' : undefined}>
                <span className="px-chat-intent-line-name">{flag.name}</span>
                {flag.description === null ? null : <span className="px-chat-intent-line-what">{flag.description}</span>}
              </span>
            ),
            onChoose: () => {
              onChoose(flag)
              afterChoosing()
            },
          }))}
        />
      ) : null}
    </>
  )
}

/** THE MARK ON A SENT MESSAGE, in its footer where Urgent is drawn. A message marked none, or with no mark, draws nothing. */
function IntentOnIt({ intent, whatTheMarkAsks, flags }: { intent: IntentMark | undefined; whatTheMarkAsks?: string; flags: TheFlagsOfAPerson }) {
  if (!anIntentThatAsks(intent)) return null
  const colour = theFlagFor(intent, flags)?.colour ?? 'blue'
  return (
    <span className="px-chat-intent-mark px-label-ink" data-intent={intent} data-colour={colour} title={whatTheMarkAsks ?? undefined}>
      {theMarksName(intent, flags)}
    </span>
  )
}

/** THE PERSON'S OWN LABEL ON A SENT MESSAGE, beside the mark in its footer, in the label's colour. A message with none draws nothing. */
function LabelOnIt({ label }: { label: MessageLabel | undefined }) {
  if (label === undefined) return null
  return (
    <span className="px-chat-label-mark px-label-ink" data-colour={label.colour}>
      {label.text}
    </span>
  )
}

/**
 * THE PERSON'S MARKED MESSAGE THAT AN AGENT'S MESSAGE IN THIS LIST ANSWERS, or null because it answers none. The server
 * does not work this out (src/server/lib/intent-mark-broken.ts): the page knows which message it drew the reply under.
 *
 * IT IS THE PERSON'S LAST MESSAGE ABOVE THE REPLY, and only when that one carries a mark that asks something and was
 * given to the agent who wrote the reply. A later message of the person's without a mark is what the reply answers, so
 * an older mark above it is not the one in question.
 */
export function theMarkedMessageItAnswers(
  messages: readonly Pick<PoolEntry, 'id' | 'sentBy' | 'intent' | 'deliveries'>[],
  at: number,
): { id: string; intent: AnIntentThatAsks } | null {
  const reply = messages[at]
  if (reply === undefined || reply.sentBy === null || reply.sentBy.kind !== 'agent') return null
  const agent = reply.sentBy
  for (let i = at - 1; i >= 0; i -= 1) {
    const one = messages[i]
    if (one === undefined || one.sentBy === null || one.sentBy.kind !== 'person') continue
    if (!anIntentThatAsks(one.intent)) return null
    if (!one.deliveries.some((d) => d.to.kind === agent.kind && d.to.id === agent.id)) return null
    return { id: one.id, intent: one.intent }
  }
  return null
}

type MarkBrokenState =
  | { at: 'ready' }
  | { at: 'filing' }
  | { at: 'done'; filed: boolean; problem: string }
  | { at: 'failed'; why: string }

/**
 * "MARK BROKEN", ON AN AGENT'S REPLY TO THE PERSON'S MARKED MESSAGE. Only the person sees it; the caller decides that.
 * The press files one problem and tells the agent once, through POST /api/messages/:id/mark-broken. It is dark while
 * its answer is coming, so one hand cannot press it twice; a second press later is answered with the first problem.
 */
function MarkBrokenPress({ reply, marked, flagName }: { reply: string; marked: { id: string; intent: AnIntentThatAsks }; flagName: string }) {
  const [state, setState] = useState<MarkBrokenState>({ at: 'ready' })
  if (state.at === 'done') {
    return (
      <span className="px-chat-mark-broken-said" data-filed={state.filed ? 'yes' : 'no'}>
        {state.filed ? t('chat.intent.markBrokenFiled') : t('chat.intent.markBrokenAlready')}{' '}
        <RouteLink to={recordPath(state.problem)}>{t('chat.intent.markBrokenOpen')}</RouteLink>
      </span>
    )
  }
  return (
    <>
      <button
        type="button"
        className="px-chat-mark-broken"
        disabled={state.at === 'filing'}
        title={t('chat.intent.markBrokenTitle', { mark: flagName })}
        onClick={() => {
          setState({ at: 'filing' })
          api.markBroken(reply, marked.id).then(
            (said) => {
              setState({ at: 'done', filed: said.filed, problem: said.problem })
            },
            (err: unknown) => {
              setState({ at: 'failed', why: errorMessage(err) })
            },
          )
        }}
      >
        {state.at === 'filing' ? t('chat.intent.markBrokenSending') : t('chat.intent.markBroken')}
      </button>
      {state.at === 'failed' ? (
        <span className="px-chat-mark-broken-failed" role="alert">
          {t('chat.intent.markBrokenFailed', { why: state.why })}
        </span>
      ) : null}
    </>
  )
}

function WrittenFrom({ said }: { said: PoolEntry }) {
  if (said.writtenFrom === null) return null
  const words = whereItWasWrittenReads(said.writtenFrom)
  return (
    <span className="px-chat-from" title={words}>
      {words}
    </span>
  )
}

/** Keep the reply control below the mark without changing either message's box. */
function FromBesideTheMark({ said, marked, flagName }: { said: PoolEntry; marked: { id: string; intent: AnIntentThatAsks }; flagName: string }) {
  const line = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const element = line.current
    const list = element?.closest('.px-chat-said')
    if (element === null || element === undefined || list === null || list === undefined) return
    const source = [...list.querySelectorAll('.px-chat-one')].find((row) => theMessageInTheRow(row) === marked.id)
    if (source === undefined) return
    let offset = 0
    let active = true
    const time = element.parentElement?.querySelector<HTMLElement>('.px-chat-when') ?? null
    const from = element.querySelector<HTMLElement>('.px-chat-from')
    const bubble = element.closest<HTMLElement>('.px-chat-bubble')
    const timeFlex = time?.style.flex ?? ''
    const timeAlign = time?.style.textAlign ?? ''
    const fit = () => {
      if (!active) return
      const mark = source.querySelector('.px-chat-intent-mark')
      const press = element.querySelector('.px-chat-mark-broken')
      if (mark === null || press === null) return
      element.style.flex = ''
      element.style.width = ''
      element.style.flexDirection = ''
      element.style.alignItems = ''
      if (from !== null) {
        from.style.width = ''
        from.style.maxWidth = ''
        from.style.overflowWrap = ''
      }
      if (time !== null) {
        time.style.flex = timeFlex
        time.style.textAlign = timeAlign
      }
      const align = () => {
        let left = mark.getBoundingClientRect().left
        if (bubble !== null) {
          const style = getComputedStyle(bubble)
          const bounds = bubble.getBoundingClientRect()
          const contentLeft = bounds.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)
          const contentRight = bounds.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight)
          left = Math.max(contentLeft, Math.min(left, contentRight - press.getBoundingClientRect().width))
        }
        offset += left - press.getBoundingClientRect().left
        element.style.transform = `translateX(${offset}px)`
      }
      align()
      const bubbleStyle = bubble === null ? null : getComputedStyle(bubble)
      const contentRight = bubble === null || bubbleStyle === null ? Infinity : bubble.getBoundingClientRect().right - parseFloat(bubbleStyle.borderRightWidth) - parseFloat(bubbleStyle.paddingRight)
      if (from !== null && bubble !== null && from.getBoundingClientRect().right > contentRight + 0.5) {
        // Keep the original flex footprint: the bubble's width must not follow the wrapped words.
        const width = element.getBoundingClientRect().width
        const available = Math.max(1, contentRight - press.getBoundingClientRect().left)
        element.style.flex = `0 0 ${width}px`
        element.style.width = `${width}px`
        element.style.flexDirection = 'column'
        element.style.alignItems = 'flex-start'
        from.style.width = `${available}px`
        from.style.maxWidth = `${available}px`
        from.style.overflowWrap = 'anywhere'
        align()
      }
      if (time !== null) {
        const b = time.getBoundingClientRect()
        const overlaps = (a: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
        if (overlaps(press.getBoundingClientRect()) || (from !== null && overlaps(from.getBoundingClientRect()))) {
          time.style.flex = '0 0 100%'
          time.style.textAlign = 'right'
          align()
        }
      }
    }
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit)
    resize?.observe(list)
    resize?.observe(source)
    resize?.observe(element)
    const changes = new MutationObserver(fit)
    changes.observe(source, { attributes: true, childList: true, characterData: true, subtree: true })
    window.addEventListener('resize', fit)
    document.fonts?.addEventListener('loadingdone', fit)
    void document.fonts?.ready.then(fit)
    fit()
    return () => {
      active = false
      resize?.disconnect()
      changes.disconnect()
      window.removeEventListener('resize', fit)
      document.fonts?.removeEventListener('loadingdone', fit)
      if (time !== null) {
        time.style.flex = timeFlex
        time.style.textAlign = timeAlign
      }
    }
  }, [marked.id])
  return (
    <>
      <span className="px-chat-model-break" aria-hidden="true" />
      <span className="px-chat-from-with-press" ref={line}>
        <MarkBrokenPress reply={said.id} marked={marked} flagName={flagName} />
        <WrittenFrom said={said} />
      </span>
    </>
  )
}

/** Whether somebody has written a state at all. Words of nothing but spaces are none. */
function aStateIsWritten(said: string | null | undefined): boolean {
  return (said ?? '').trim() !== ''
}

/**
 * THE WORDS SOMEBODY WROTE ABOUT THEMSELVES, drawn as they typed them.
 *
 * A state is free text and never a stored vocabulary word, so there is no table to read it through:
 * reading it through one would be inventing a meaning for somebody's own sentence. What this does
 * instead is draw it once, in one place, so the panel cannot say it two ways. A state nobody has
 * written is not drawn here at all: its line is left out, and a pencil beside the name opens the
 * editor (wave 13y round 113, item 45, where a lone dash in its place was a line that said nothing).
 */
function StateWords({ said }: { said: string }) {
  return <span className="px-chat-said-state">{said}</span>
}

/**
 * THE CROSS THAT CLOSES A STATUS EDITOR, and only the editor. Both editors in the panel draw this one,
 * so neither is drawn without its way out again: the editor under an agent's name had none, and the
 * owner could not close it (25 October 2026, wave 13y round 80).
 */
function StopEditingTheLine({ onStop }: { onStop: () => void }) {
  return (
    <button type="button" className="px-chat-stop-editing" aria-label={CHAT_WORDS.stopEditing} title={CHAT_WORDS.stopEditing} onClick={onStop}>
      {'\u00d7'}
    </button>
  )
}

/**
 * WHERE A MESSAGE OFFERS TO TAKE THE READER.
 *
 * An offer to take the reader somewhere carries the same press the card on the page carries,
 * because it is the same offer and two copies of what taking one does would drift apart. What a
 * message is ABOUT used to be drawn here too, as a line naming the record; it is the quote above the
 * message's words now (`Quotes` in chat/Quotes.tsx), which keeps the link.
 */
function Where({
  entry,
  titles,
  fromName,
  projects,
  here,
}: {
  entry: PoolEntry
  titles: Readonly<Record<string, string>>
  /** Whose offer this is, by name. An id is a machine word and never stands in for a name. */
  fromName: string
  /** Every project, for naming the one a lead would move the reader to. Empty while unread. */
  projects: readonly WorkspaceReading[]
  /** The project the reader is in. Passed rather than read, so this redraws when it changes. */
  here: string
}) {
  const lead = theOfferItCarries(entry)
  // WHAT THE PAGE A LEAD POINTS AT SHOWS, read by the same hook the card on the page uses, and whether
  // the reader is in developer mode. Both are read before the early return, as hooks must be.
  const pageShows = useWhatALeadsPageShows(lead === null ? [] : [lead], here)
  const developer = useInspect()
  if (lead === null) return null
  const to = recordNamedByTarget(lead.target)
  const place = whereALeadGoes(
    lead,
    knownTitleOf(titles, to),
    here,
    (id) => projects.find((one) => one.id === id)?.title ?? id,
    { read: pageShows(lead), developer },
  )
  return (
    <div className="px-chat-lead">
      <p className="px-chat-lead-words">
        {/* THE SAME SENTENCE THE CARD ON THE PAGE DRAWS, from the same function, so the two
            cannot come to say different things about one offer — including the half that says
            the offer moves the reader's project. Criterion M60. */}
        {LEADING.offer(fromName, place)}
      </p>
      <div className="px-chat-lead-presses">
        <button
          type="button"
          className="px-chat-lead-go"
          onClick={() => {
            void goToTheLead(lead, entry.id)
          }}
        >
          {LEADING.takeMe}
        </button>
        <RemindMeLater messageId={entry.id} />
      </div>
    </div>
  )
}

/**
 * REMIND ME LATER, BESIDE TAKE ME THERE. When there is no time to look yet, the person chooses when the message
 * comes back. The three times are written once, in shared/remind-me-later.ts. The office
 * keeps the time, not this page, so the message comes back with no page open. After the press one sentence says
 * when; a refusal is said in words, and nothing is drawn as set that was not.
 */
function RemindMeLater({ messageId }: { messageId: string }) {
  const [choosing, setChoosing] = useState(false)
  const [said, setSaid] = useState<{ remindAt: string; pressedAt: string } | { failed: string } | null>(null)
  const choose = async (choice: RemindMeLaterChoice): Promise<void> => {
    setChoosing(false)
    try {
      const set = await api.remindMeLater(messageId, choice)
      setSaid({ remindAt: set.remindAt, pressedAt: set.pressedAt })
    } catch (err) {
      setSaid({ failed: errorMessage(err) })
    }
  }
  return (
    <>
      <button
        type="button"
        className="px-chat-lead-later"
        aria-expanded={choosing}
        onClick={() => {
          setChoosing(!choosing)
        }}
      >
        {t('chatEnglish.lead.remindMeLater')}
      </button>
      {choosing ? (
        <span className="px-chat-lead-choices" role="group" aria-label={t('chatEnglish.lead.remindMeLater')}>
          {REMIND_ME_LATER_CHOICES.map((choice) => (
            <button
              key={choice}
              type="button"
              className="px-chat-lead-choice"
              data-choice={choice}
              onClick={() => {
                void choose(choice)
              }}
            >
              {t(REMIND_ME_LATER_WORDS[choice])}
            </button>
          ))}
        </span>
      ) : null}
      {said === null ? null : 'failed' in said ? (
        <p className="px-chat-lead-said" role="alert">
          {t('chatEnglish.remindMeLater.failed', { why: said.failed })}
        </p>
      ) : (
        <p className="px-chat-lead-said" role="status">
          {t('chatEnglish.remindMeLater.comesBack', { when: whenItComesBackInWords(said.remindAt, said.pressedAt) })}
        </p>
      )}
    </>
  )
}

/** The word for each of the three times, by the choice the door takes. */
const REMIND_ME_LATER_WORDS = {
  'in-30-minutes': 'chatEnglish.remindMeLater.in30Minutes',
  'in-2-hours': 'chatEnglish.remindMeLater.in2Hours',
  'at-7-next-morning': 'chatEnglish.remindMeLater.at7NextMorning',
} as const satisfies Record<RemindMeLaterChoice, string>

/**
 * "today at 15:30" or "tomorrow at 07:00", from the stamp the office stored and the press on the office's own clock.
 * Both days are the office's, because the sentence says it is the office's clock: a browser in another time zone may
 * be on another date (round 45c). A stamp on a later day still names its date, and a stamp that cannot be read is
 * shown as it was stored rather than guessed at.
 */
function whenItComesBackInWords(remindAt: string, pressedAt: string): string {
  const days = calendarDaysBetweenDayKeys(pressedAt.slice(0, 10), remindAt.slice(0, 10))
  if (days === null) return remindAt
  const time = remindAt.slice(11, 16)
  if (days === 0) return t('chatEnglish.remindMeLater.today', { time })
  if (days === 1) return t('chatEnglish.remindMeLater.tomorrow', { time })
  return remindAt.slice(0, 16)
}

/** Where a message offers to take the reader, or null because it carries no offer. `Where` draws it and a system line is laid out by it. */
function theOfferItCarries(entry: PoolEntry): Context | null {
  return entry.lead === null || typeof entry.lead !== 'object' ? null : (entry.lead as Context)
}

/**
 * WHOSE OFFER A LINE FROM MOLE OFFICE CARRIES, BY NAME. A message brought back by Remind me later carries the offer
 * of the message that first carried it, and the offer is still that sender's. The server says who that is
 * (`offerMadeBy`), and the lead card (Leading.tsx) reads the same field, so the two name one sender. When nobody
 * recorded it, or the name is not known here, the line says which of those it is, as every page does (`theWritersName`).
 */
function whoFirstSentIt(line: PoolEntry, known: readonly KnownParticipant[]): string {
  return theWritersName({ sentBy: line.offerMadeBy ?? null, from: null }, known)
}

/**
 * THE UNREGISTERED WRITER THE HEADING NAMES (wave 13y round 86): the door's answer once the door has answered for this
 * writer, which is the writer as its newest message has it. Until then the writer the panel was opened at, unless that is
 * a claimed id with no typed line. A key from another page carries no typed line, and the heading would then say the
 * writer left no name when it may have typed one, so it names nobody until the door answers.
 */
function theUnregisteredWriterToName(opened: UnregisteredWriter, reply: UnregisteredReply | null): UnregisteredWriter | null {
  if (reply !== null && unregisteredKey(reply.writer) === unregisteredKey(opened)) return reply.writer
  return opened.said !== null && theLineAnUnregisteredWriterTyped(opened) === null ? null : opened
}

/**
 * WHAT ONE MESSAGE ON SCREEN IS, SAID ON ITS OWN ELEMENT. Problem p0H_xbR84hhx.
 *
 * Every other row in the product says which record it draws, and a message is a record. Without
 * this, words pointed at in a message climbed to the page under the chat, so a right-click on a
 * message was filed against whatever page was open and not against the message. The name is the
 * message's own title, which is the first of its words, so the chip above the composer names the
 * message rather than every word the bubble draws.
 */
function theMessagesOwnTarget(said: PoolEntry): Record<string, string> {
  return {
    ...targetAttributes({ kind: 'record', recordId: said.id, workspaceId: said.workspaceId }),
    ...nameAttributes(said.title),
  }
}

/** The message a row of a list draws, read back from the row's own target, or null for a row that draws none. */
function theMessageInTheRow(row: Element): string | null {
  const value = row.getAttribute(TARGET_ATTRIBUTE)
  if (value === null) return null
  const read = targetFromAttributeValue(value)
  return 'target' in read ? recordNamedByTarget(read.target) : null
}

/**
 * A LINE MOLE OFFICE WROTE, drawn as a small centred grey block in the flow.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS NOT SOMEBODY SPEAKING, SO IT MUST NOT LOOK LIKE SOMEBODY SPEAKING
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office is a participant (criterion M11) and its lines carry a sender, so without this they
 * were drawn like any other message: a bubble with an avatar beside it. On 4 September the owner
 * asked for a centred, floating system notice at the top of a group that was set up, like the group
 * notices of QQ: who was added and who left each shows as a small grey block. So a system line is a small grey block, centred, with no avatar and
 * no bubble — who joined, who left, what was opened, what ended, a run that stopped waiting (M22),
 * a run a restart cut off (M24). Criterion M26.
 *
 * ONE COMPONENT FOR EVERY LIST. A group, a one-to-one conversation and an agent-to-agent
 * conversation all draw these, and three copies of one rule is how one of them ends up drawing an
 * avatar again with nothing failing.
 */
function SystemLine({
  said,
  folded,
  lead,
}: {
  said: PoolEntry
  folded?: readonly PoolEntry[] | undefined
  /** The offer a line carries under its block: a message brought back by Remind me later carries its first offer. */
  lead?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  // WHETHER THIS LINE WRAPS ON A PHONE: the five lines that tell the person about a change to a
  // checklist, and no other line. The list lives once, in shared/groups.ts, and nothing here reads
  // the line's words to decide it.
  const wrapsOnAPhone = said.notice !== null && THE_CHECKLIST_LINES.has(said.notice as SystemLineKind)
  if (folded === undefined || folded.length === 0) {
    return (
      <li key={said.id} className="px-chat-system" data-carries-an-offer={theOfferItCarries(said) === null ? undefined : 'yes'} {...theMessagesOwnTarget(said)}>
        {/* THE WORDS A MESSAGE FROM MOLE OFFICE CARRIES. A message stores the few words in `body` and
            the whole sentence in `saidInFull`. A dead-letter line is drawn from its facts in the page's
            language (`theWordsOfAnOfficeLine` in shared/dead-letter-lines.ts); every other line as stored. */}
        <ASystemBlock at={said.sentAt} said={theWordsOfAnOfficeLine(t, said)} wrapsOnAPhone={wrapsOnAPhone} />
        {lead}
      </li>
    )
  }
  // A LINE THAT HOLDS FOLDED LINES. The office folded its own old lines under this one (`theFoldsOf` in
  // shared/folded-lines.ts). The press says how many lines are folded here and opens them under the line,
  // so nothing is hidden without saying so. Nothing folded was deleted. The line stands at the time of the
  // oldest line it holds (`whenItStands`), so the time above it is that time; its sentence says when it was
  // written.
  const n = folded.length
  const words = open
    ? n === 1 ? t('chat.foldedLines.hideOne') : t('chat.foldedLines.hideMany', { n })
    : n === 1 ? t('chat.foldedLines.showOne') : t('chat.foldedLines.showMany', { n })
  return (
    <li key={said.id} className="px-chat-system" data-holds-folded="yes" {...theMessagesOwnTarget(said)}>
      <ASystemBlock at={whenItStands(said, new Map([[said.id, folded]]))} said={theWordsOfAnOfficeLine(t, said, folded)} wrapsOnAPhone={wrapsOnAPhone} />
      <button
        type="button"
        className="px-chat-folded-press"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open)
        }}
      >
        {words}
      </button>
      {open ? (
        <ol className="px-chat-folded">
          {folded.map((one) => (
            <SystemLine key={one.id} said={one} />
          ))}
        </ol>
      ) : null}
    </li>
  )
}

/**
 * THE TIME ABOVE AND THE BLOCK, WHICH IS THE SHAPE OF EVERY SYSTEM LINE.
 *
 * One component so a line Mole Office wrote and a join drawn from a membership row cannot come to
 * two different shapes. `at` is the local wall-clock stamp the row carries; `said` is the short line
 * and the sentence behind it.
 */
function ASystemBlock({ at, said, wrapsOnAPhone = false }: { at: string; said: SystemLine; wrapsOnAPhone?: boolean }) {
  return (
    <span className="px-chat-system-stack">
      {/* THE TIME ABOVE IT, criterion M34. A system message carries its time
          above it, written like --time--, to set it apart from an
          ordinary message. An ordinary message carries its time under the bubble;
          this carries it above the block, between two marks, which is what tells the two apart at
          a glance. `When` is the same reader both use, so the two clocks cannot differ. */}
      <span className="px-chat-system-when">
        {DASH}
        <When at={at} />
        {DASH}
      </span>
      {/* AND A FEW WORDS, WITH THE WHOLE SENTENCE BEHIND THEM. The owner found the system messages
          too long: they need not explain in full sentences, and may say something like "Agent run
          ended". The sentence is the hover
          text where there is one; where there is none the few words are the whole of it and
          nothing is hidden. Criterion M34. */}
      {/* A LINE THAT WRAPS ON A PHONE SAYS SO, so the phone's one-line fold can leave it alone: the
          five lines about a change to a checklist, which carry no hover sentence and would lose
          the item's name behind an ellipsis. No other line carries the mark. */}
      <span
        className="px-chat-system-block"
        title={said.said ?? undefined}
        {...(wrapsOnAPhone ? { 'data-wraps-on-a-phone': 'yes' } : {})}
      >
        <Body text={said.line} />
      </span>
    </span>
  )
}

/**
 * THE LINE SAYING WHICH GROUP A FORWARDED REPLY CAME FROM, drawn above its words. Criterion GM2.
 *
 * A group reply that @s the person is drawn in the person's own chat with its sender as well as in
 * the group. It is one record and not a copy, so this line is what says where the words were really
 * said. The press opens that group at that message, which is the one place the words live.
 */
function FromTheGroup({ groupId, messageId, name }: { groupId: string; messageId: string; name: string }) {
  return (
    <button
      type="button"
      className="px-chat-from-group"
      onClick={() => {
        openTheChatAtGroup(groupId, messageId)
      }}
    >
      {GROUP_WORDS.fromGroup(name)}
    </button>
  )
}

/**
 * ONE ROW IN THE CHAT'S GROUP LIST: its pictures, its name, its unread marks, and — while Edit is
 * on — the press that takes one member out.
 *
 * ONE COMPONENT BECAUSE THE LIST DRAWS THE SAME ROW UNDER TWO HEADINGS: the pinned category holding
 * the office's own standing group, and the default category holding every other group. A second
 * copy is how the pinned row would quietly lose the unread mark the other one keeps.
 */
const CHAT_UNDO_MS = 10_000
const undoSeconds = (n: number): string => t('chat.undo', { n })

async function rejoinGroup(group: string, who: GroupMemberOnTheWire['who']): Promise<void> {
  await moleOfficeRequest<Pick<OneGroupReply, 'group'>>('/api/groups/' + encodeURIComponent(group) + '/members', {
    method: 'POST',
    body: JSON.stringify({ who, because: t('chat.groupUndoBecause') }),
  })
}

function AGroupRow({
  group,
  everybody,
  known,
  editing,
  onOpen,
  onChanged,
  keepForUndo,
}: {
  group: ShortGroupRow
  everybody: ReadonlyMap<string, Pick<ParticipantForThePage, 'kind' | 'id' | 'name' | 'avatarUrl' | 'retired' | 'retiredAt'>>
  /** Every project the office lists, for the names on the row's project mark. */
  known: readonly WorkspaceReading[]
  editing: boolean
  onOpen: (id: string) => void
  onChanged: () => Promise<void>
  keepForUndo: (group: string) => void
}) {
  const [removed, setRemoved] = useState<ShortGroupRow['members']>([])
  const members = [...group.members, ...removed.filter(member => !group.members.some(one => participantKey(one.who) === participantKey(member.who)))]
  return (
    <li>
      <button
        type="button"
        className="px-chat-contact"
        // BOLD WHEN ANYTHING IN IT IS UNREAD, criterion M33, a line Mole Office wrote included. The
        // number beside the name is messages only.
        data-unread={group.anythingUnread ? 'yes' : 'no'}
        onClick={() => {
          onOpen(group.id)
        }}
      >
        <span className="px-chat-faces">
          {facesInAGroup(group.members, everybody).slice(0, 4).map((member) => {
            const one = everybody.get(participantKey(member.who))
            return one === undefined ? null : (
              <Avatar
                key={participantKey(member.who)}
                kind={one.kind as ParticipantKind}
                id={one.id}
                name={one.name}
                url={one.avatarUrl}
                size={20}
              />
            )
          })}
        </span>
        <span className="px-chat-contact-words">
          <span className="px-chat-contact-top">
            <span className="px-chat-name">{group.name}</span>
            <ProjectMarks projects={group.projects} known={known} />
            {/* AND HOW MANY OF ITS MESSAGES ARE UNREAD. The number on the circle is the sum of the
                rows the panel draws, and a group is one of those rows; without this a group message
                would be counted and shown on nothing. Criterion M19. */}
            {group.unread > 0 ? <span className="px-chat-unread">{group.unread}</span> : null}
          </span>
          <span className="px-chat-last">{GROUP_WORDS.memberCount(group.members.length)}</span>
        </span>
      </button>
      {/* WHILE EDIT IS ON, EVERY MEMBER CAN BE TAKEN OUT. The door decides who may; pressing writes
          and the list is read again. Criterion M123. */}
      {!editing ? null : (
        <div className="px-chat-place px-chat-member-acts">
          {members.map((member) => {
            const one = everybody.get(participantKey(member.who))
            if (one === undefined) return null
            return (
              <TieredPress key={participantKey(member.who)} tier="undo" size="sm"
                available={group.members.some(current => participantKey(current.who) === participantKey(member.who))}
                windowMs={CHAT_UNDO_MS} press={t('chat.group.takeOut', { name: theNameBesideItsDate(one.name, one.retiredAt) })}
                pending={t('chat.removing')} done={t('chat.groupRemoved')} undo={undoSeconds}
                undoing={t('chat.undoing')}
                onPress={async () => {
                  keepForUndo(group.id)
                  setRemoved(before => [...before.filter(current => participantKey(current.who) !== participantKey(member.who)), member])
                  await api.leaveGroup(group.id, member.who)
                  await onChanged()
                  return { remainingMs: CHAT_UNDO_MS, undo: async () => {
                    await rejoinGroup(group.id, member.who)
                    await onChanged()
                  } }
                }}
              />
            )
          })}
        </div>
      )}
    </li>
  )
}

/**
 * The mark on each side of a system line's time. One place, so the two sides cannot differ.
 *
 * TWO HYPHENS AND NOT AN EM DASH, because criterion M34 puts two hyphens on each side of
 * the time. A prettier mark would be this code rewriting the criterion.
 */
const DASH = '--'


/**
 * WHICH PROJECT A MESSAGE WAS WRITTEN IN, when it is not the one on screen. Criterion M55.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS DRAWN ONLY SOMETIMES, WHICH IS "WHERE IT MATTERS"
 * ---------------------------------------------------------------------------------------
 *
 * A conversation is the person's and spans every project, so most of what is in one was written
 * where the reader is now and saying so on every line would be noise on every line. What a reader
 * needs to know is the exception: this one was written somewhere else. So the mark appears exactly
 * when the message's project is not the project the page is on.
 *
 * IT NAMES THE PROJECT AND NEVER PRINTS ITS ID. `projectName` is the one function in this browser
 * that turns a project into words. Until the list of projects has been read there is no name to
 * print, and then nothing is drawn — an id in its place would be a key on a screen.
 */
function InAnotherProject({
  said,
  projects,
  here,
  mark,
}: {
  said: PoolEntry
  projects: readonly WorkspaceReading[]
  /** The project the reader is in. Passed rather than read, so this redraws when it changes. */
  here: string
  /**
   * WHETHER THE PERSON HAS TURNED THIS ON AT ALL. Criterion M73.
   *
   * It used to be drawn exactly when the message was filed somewhere other than where the reader
   * stood, so switching project made a line appear under messages that had not changed. This mark
   * is shown either always or never. The answer is a setting of the person's
   * own, off by default; when it is on the mark is on EVERY message, whatever project they stand in,
   * because the chat is theirs across every project and never changes with it.
   */
  mark: MessageProjectMark
}) {
  if (mark !== 'always') return null
  // WHERE IT WAS WRITTEN: every message is kept in the message centre, and its mark says the project.
  const found = projects.find((one) => one.id === (said.writtenIn?.project ?? said.workspaceId))
  if (found === undefined) return null
  return (
    <span className="px-chat-project" title={CHAT_WORDS.writtenInProject(projectName(found.id, found.title))}>
      {projectName(found.id, found.title)}
    </span>
  )
}

/**
 * A MESSAGE'S TIME, WITH THE DATE. Criterion M107. The chat used to show
 * only hours and minutes and no date; a time now takes the form 2026/01/25 22:09.
 *
 * THE DRAWING ITSELF LIVES IN src/shared/time.ts, beside the one reader and the one writer, so
 * every message time on this panel — the ordinary bubble and the system line's dashes — is drawn
 * by one function. `When` only wraps it in the class the stylesheet reads.
 */
function When({ at }: { at: string }) {
  return <span className="px-chat-when">{drawnStamp(at)}</span>
}

/**
 * OPEN THE PANEL AT ONE CONTACT, FROM ANOTHER PAGE.
 *
 * The Messages page (M27) lists every message and says a row opens in its conversation. The panel
 * is mounted once, on every page, so opening it is not navigation — it is telling the panel that is
 * already there which contact to show.
 *
 * IT IS AN EVENT AND NOT A STORED VALUE. Writing the two stored keys would work only on the next
 * reload, and a press that does nothing until you reload is a press that does nothing. The stored
 * keys are still written, by the panel's own effects, so the choice survives a reload as before.
 */
import { OPEN_AT, groupFromOpenKey, openTheChatAt, openTheChatAtGroup } from '../lib/open-chat.ts'
import { TheDutyLine } from './ChatDuty.tsx'
export { openTheChatAt }

/**
 * TELL THE PANEL TO READ ITSELF AGAIN, from another page.
 *
 * The settings page changes how the circle draws its number (M32), and the panel is mounted on that
 * page like every other. Without this the press would change nothing a person could see until they
 * navigated, because the panel reads again on a hash change and on nothing else a settings press
 * causes. It is an event for the same reason `openTheChatAt` is one.
 */
const READ_AGAIN = 'mole-office.chat.read-again'

/**
 * THE KEY OF A CONVERSATION BETWEEN TWO AGENTS: the two ids, sorted, with a tilde between them. It is
 * the key the between-agents door reads (`pairKey` in src/server/lib/messages.ts). A row opens with
 * it, and a new message is matched against the open conversation with it, so the two cannot differ.
 */
function thePairKey(between: readonly [{ id: string }, { id: string }]): string {
  return [between[0].id, between[1].id].sort().join('~')
}

/** The events the chat panel draws, so a tab is handed these and no others for it. */
/** How many dots one read of `GET /api/presence?of=` asks for. The door answers at most 500. */
const DOTS_IN_ONE_READ = 200

const CHAT_DRAWS: readonly EventName[] = ['message.new', 'delivery.changed', 'presence.changed', 'list.changed', 'answering.changed']

/**
 * HOW LONG AFTER ITS LAST READ THE OPEN CONVERSATION WITH AN AGENT IS READ AGAIN, in milliseconds, WHEN IT WAS READ IN
 * ANOTHER PROJECT THAN THE ONE THE PAGE WATCHES.
 *
 * Since wave 13w round 26 the server announces `answering.changed` when an agent starts or stops answering: a run
 * starting or ending, a session taking or dropping its handle, a run's wait starting or running out
 * (src/server/lib/answering-told.ts). The open conversation is read on it, so in the project the page watches this
 * beat asks nothing. The event reaches only the pages watching the project it names, and a conversation stays open in
 * the project it was read in when the reader moves to another (criterion M55). For that conversation the beat still
 * reads, every thirty seconds, as it did for every conversation before.
 */
const THE_TALKS_BEAT_MS = 30_000

/**
 * THE CHAT'S LISTS THAT EVENTS KEEP CURRENT, by their names in the page cache (src/web/lib/pagecache.ts).
 * Round 17 of wave 13w, and a decision: a drawing of the chat made again (from the chat page to another page
 * and back) asks only for those of these an event has marked changed since they were last read.
 * `circle` is the closed button's number, worked out from the contacts and the groups.
 *
 * NOT HERE, AND READ AGAIN AT EVERY NEW DRAWING: the presence dots, which also turn grey on the server's
 * clock with no event, and the list of projects, which no event names. A drawing that starts from the answer
 * kept for it draws those readings until its own come: the first row drawn from one asks for it again, so a
 * sleep the office began or ended on its clock is not left as the kept line (`readingOf`).
 */
const EVENTS_KEEP_CURRENT = ['participants', 'contacts', 'betweenAgents', 'groups', 'circle'] as const
type KeptList = (typeof EVENTS_KEEP_CURRENT)[number]
const cacheName = (list: KeptList): string => `chat.${list}`

/** The names the last event marked stale that were fresh before it, for the open panel to mark back. */
let markedByTheLastEvent: readonly string[] = []

/**
 * EVERY EVENT THE CHAT DRAWS MARKS WHAT IT MAY HAVE CHANGED, whether or not a panel holding it is drawn.
 * Registered when this module loads, so it is handed each event before any panel is. A reader not known
 * yet is marked for every list a message could move.
 */
hearAlways((event) => {
  const me = whoIsReading()
  const lists = new Set<string>(listsAnEventChanges(event, me === 'notKnownYet' ? null : me, null))
  if ((me === 'notKnownYet' || me === null) && event.name !== 'presence.changed' && event.name !== 'list.changed') {
    lists.add('contacts')
    lists.add('groups')
  }
  if (lists.has('contacts') || lists.has('groups')) lists.add('circle')
  markedByTheLastEvent = markStale(EVENTS_KEEP_CURRENT.filter((one) => lists.has(one)).map(cacheName))
}, CHAT_DRAWS)
whenEventsWereLost(nothingIsFresh)

export function readTheChatAgain(): void {
  window.dispatchEvent(new CustomEvent(READ_AGAIN))
}

/**
 * OPEN THE PANEL AT ONE WRITER NOBODY REGISTERED, from another page.
 *
 * It lives in lib/open-chat.ts beside the event it dispatches, because the right-click panel's
 * contact chooser now sends its readers there too and that file is the one both import. The
 * re-export below is the same binding, not a second copy.
 */
export { openTheChatAtUnregistered } from '../lib/open-chat.ts'


/**
 * THE COMPOSER GROWS UPWARD WITH WHAT IS TYPED, AND ENTER SENDS.
 *
 * The message box wraps its text (problem tFdHDJiQNVc8): when the
 * text is longer than the box, the box grows upward, rather than running on with only its last part
 * in view. Until then both composers were one-line inputs: a long
 * message scrolled sideways and only its tail was visible. This is a textarea that sets its own
 * height from its content, one line at first and at most eight, so the box grows upward inside the
 * panel while the writer can see everything written.
 *
 * WHICH PRESS SENDS IS THE PERSON'S OWN SETTING, and the one rule for it is `lib/send-key.ts`, shared with
 * every other message box. By default Enter makes a new line and Shift+Enter or Alt+Enter sends, and a
 * person who prefers the old way chooses "Enter sends". While an input method is
 * composing, Enter belongs to the input method and neither sends nor adds a line: the person may type
 * Chinese, and `isComposing` on the native event is the browser's word for that moment.
 */
/** A piece of the box's words to select, as Change it asks: `text` is the words it is in, so a box drawing other words selects nothing. */
interface APieceToSelect {
  text: string
  start: number
  end: number
}

function GrowingBox({
  value,
  placeholder,
  onChange,
  onSend,
  onCaret,
  onSelectWords,
  markedParts = [],
  flags = null,
  select = null,
}: {
  value: string
  placeholder: string
  onChange: (next: string) => void
  onSend: () => void
  onCaret?: (at: number) => void
  /** Where the selection is, so the flag's menu knows which words the person marked. */
  onSelectWords?: (from: number, to: number) => void
  /** The marked parts kept with this conversation, drawn over the words in their flags' colours. */
  markedParts?: readonly AMarkedPart[]
  /** The person's flags, for the colours and names the paint draws. */
  flags?: TheFlagsOfAPerson | null
  /** The piece Change it asks the box to select, once, or null. */
  select?: APieceToSelect | null
}): React.JSX.Element {
  const sendKey = useSendKey()
  const box = useRef<HTMLTextAreaElement | null>(null)
  /**
   * THE SMALLEST THE BOX MAY BE, because a person dragged it to that height. Null means nobody has.
   *
   * The box a person types in takes a drag on its top edge
   * too. The smallest and largest it may be were left to this code: they are the two the growing already uses, one line and eight.
   * Problem EDDFguLt9CF9.
   *
   * IT IS THE SMALLEST AND NOT THE LARGEST, which is criterion M46 and problem xxbNEYeTWD9i. It
   * held the box at exactly the dragged height until 5 September 2026, so typing past that height
   * scrolled the text instead of growing the box. The growing went missing: a
   * new line did not make the box taller, perhaps because the box had been dragged first.
   */
  const [floor, setFloor] = useState<number | null>(null)
  const draggingFrom = useRef<{ y: number; height: number } | null>(null)

  /**
   * SET THE BOX TO WHICHEVER IS TALLER, THE TEXT OR THE DRAGGED HEIGHT, and never past eight lines.
   *
   * The text is measured with the height taken off, so `scrollHeight` is what the words need rather
   * than what the box currently is. Scrolling is turned on only when the words need more room than
   * the box ends up with, which at eight lines is the only way that happens.
   *
   * THE ROW AROUND THE BOX KEEPS ITS HEIGHT WHILE THE BOX IS MEASURED. Reading `scrollHeight` lays
   * the page out with the box at one line. For that moment the row was as short as it is for one
   * line, the list above it was taller by as much, and the browser pulled a list at its end back to
   * that end. The chat read the pull as the reader moving up, and each later line the box grew
   * covered more of the newest message. Measured in wave 13y round 162, on the chat page at 1440:
   * the box grew to a second line and the list's end went from 3,108 to 3,121, and the next key
   * pulled the list back to 3,108. Held, the list keeps its height while the box is measured, and
   * nothing is pulled.
   */
  const fit = (el: HTMLTextAreaElement | null, least: number | null): void => {
    if (el === null) return
    const { most } = theLimits(el)
    const row = el.closest<HTMLElement>('.px-chat-write')
    if (row !== null) row.style.minHeight = `${String(row.offsetHeight)}px`
    el.style.height = 'auto'
    const forTheText = el.scrollHeight
    const height = Math.min(Math.max(forTheText, least ?? 0), most)
    el.style.height = `${String(height)}px`
    el.style.overflowY = forTheText > height ? 'auto' : 'hidden'
    if (row !== null) row.style.minHeight = ''
  }
  /**
   * BEFORE THE BROWSER PAINTS, NOT AFTER — which is what `useLayoutEffect` is for and what
   * `useEffect` here was not.
   *
   * A passive effect runs after the paint, so the text and the height reached the screen in two
   * different frames: for one frame the box held the new text at the old height. On sending, that
   * frame is the box still three lines tall with nothing in it. Measured on 6 September 2026, on
   * this component, three runs: the textarea's value was already the empty string while its height
   * was still 66px in one run of the three, and the height then settled within a fifth of a
   * millisecond. Problem `J-fXTM4wFagt`.
   *
   * A layout effect puts the height in the same commit as the text, so no frame can show one
   * without the other. The comment below has always claimed the box is never drawn at the old
   * height first, and this is what makes that true.
   */
  useLayoutEffect(() => {
    fit(box.current, floor)
  }, [value, floor])
  /**
   * THE BOX IS FITTED AGAIN WHEN ITS WIDTH CHANGES, because the same words need more lines in a
   * narrower box. The box spans the writing row, so its width changes whenever the chat's does: a
   * panel dragged wider, a window turned into the split, a phone turned on its side.
   *
   * The fit waits for the next frame. A height set inside the watcher's own call is a change the
   * watcher would have to report again in the same frame, and the browser reports that to the page
   * as an error instead.
   */
  useLayoutEffect(() => {
    const el = box.current
    if (el === null || typeof ResizeObserver === 'undefined') return
    let width = el.getBoundingClientRect().width
    let frame = 0
    const watcher = new ResizeObserver(() => {
      const now = el.getBoundingClientRect().width
      if (now === width) return
      width = now
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        fit(el, floor)
      })
    })
    watcher.observe(el)
    return () => {
      watcher.disconnect()
      cancelAnimationFrame(frame)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor])
  // THE PIECE THE KEY QUESTION SAW IS SELECTED WHEN THE PERSON PRESSES CHANGE IT, so they see which piece it was
  // (src/web/components/AKeyQuestion.tsx). Each press hands a new object, so a second press selects it again.
  useLayoutEffect(() => {
    const el = box.current
    if (el === null || select === null || select.text !== value) return
    el.focus()
    el.setSelectionRange(select.start, select.end)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [select])
  // AN EMPTIED BOX IS ONE LINE AGAIN, a follow-up to criterion M46: an emptied box
  // goes back to one line. The dragged floor
  // is for the message being written; the moment the text goes from something to nothing, the floor
  // goes with it, in the same render as the text (both states change in one press, so the box is
  // never drawn at the old floor first). Only that moment: a box that is empty when the edge is
  // dragged keeps its drag, otherwise nobody could ever drag an empty box.
  const takeTyped = (next: string): void => {
    if (next === '' && value !== '') setFloor(null)
    onChange(next)
  }

  const startDragging = (e: APointer<HTMLElement>): void => {
    const el = box.current
    if (el === null) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    draggingFrom.current = { y: e.clientY, height: el.getBoundingClientRect().height }
  }

  const keepDragging = (e: APointer<HTMLElement>): void => {
    const held = draggingFrom.current
    const el = box.current
    if (held === null || el === null) return
    // THE BOX SITS AT THE BOTTOM, so dragging its top edge upwards makes it taller. The same
    // subtraction the panel's own top edge makes, for the same reason.
    const { least, most } = theLimits(el)
    setFloor(Math.min(Math.max(held.height + (held.y - e.clientY), least), most))
  }

  const stopDragging = (e: APointer<HTMLElement>): void => {
    if (draggingFrom.current === null) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    draggingFrom.current = null
  }

  return (
    <div className="px-chat-box-holder">
      {/* MARKED WORDS ARE PAINTED OVER THE BOX, because a plain textarea cannot colour a run inside itself. The layer
          takes no pointer, and every character it does not mark is transparent, so the box beneath is what is read and
          typed in. */}
      {flags === null ? null : <MarkedWordsPaint body={value} parts={markedParts} flags={flags} />}
      {/* THE EDGE A PERSON DRAGS TO SET THE SMALLEST THE BOX MAY BE, and presses twice to hand that
          choice back so the box is the size its text needs again. */}
      <div
        className="px-chat-box-grip"
        role="separator"
        aria-label={CHAT_WORDS.composerHeight}
        title={CHAT_WORDS.composerHeight}
        onPointerDown={startDragging}
        onPointerMove={keepDragging}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onDoubleClick={() => {
          setFloor(null)
        }}
      />
      <textarea
        ref={box}
        className="px-chat-box"
        rows={1}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => {
          onCaret?.(e.currentTarget.selectionStart)
          onSelectWords?.(e.currentTarget.selectionStart, e.currentTarget.selectionEnd)
          takeTyped(e.target.value)
        }}
        onSelect={(e) => {
          const selection = window.getSelection()
          if (selection !== null && !selection.isCollapsed && selection.anchorNode !== null && !e.currentTarget.contains(selection.anchorNode)) return
          onCaret?.(e.currentTarget.selectionStart)
          onSelectWords?.(e.currentTarget.selectionStart, e.currentTarget.selectionEnd)
        }}
        onKeyUp={(e) => {
          onSelectWords?.(e.currentTarget.selectionStart, e.currentTarget.selectionEnd)
        }}
        onMouseUp={(e) => {
          onSelectWords?.(e.currentTarget.selectionStart, e.currentTarget.selectionEnd)
        }}
        onKeyDown={aSendKeyPress<HTMLTextAreaElement>(sendKey, onSend)}
      />
    </div>
  )
}

/**
 * THE SMALLEST AND LARGEST THE COMPOSER MAY BE, in one statement.
 *
 * One line and eight, plus the padding and the border the box draws around them. The growing and
 * the drag both ask this, so a height somebody drags to and a height the text grows to cannot end
 * up held to two different limits.
 */
function theLimits(el: HTMLTextAreaElement): { least: number; most: number } {
  const line = parseFloat(getComputedStyle(el).lineHeight) || 20
  const around = 10
  return { least: line + around, most: line * 8 + around }
}

// ---------------------------------------------------------------------------- M113: where a sent message stands

/**
 * HOW LONG A PRESS WAITS FOR THE SERVER'S ANSWER BEFORE IT STOPS WAITING. Criterion M113 names a
 * timeout; the number is chosen and stated here: 20 seconds. This server runs on the same machine
 * as the browser reading it and ordinarily answers in well under a second; 20 is generous room for
 * a machine under load (this project's own suite runs twelve browsers at once) without leaving a
 * person staring at a clock for a genuinely lost request. Past it the browser gives up on THIS
 * attempt. That does not mean the words never reached the server, only that nothing came back to
 * say so, so the entry says it does not know and the chat reads the conversation to find out
 * (problem KzLydNEm4HYX).
 */
const SEND_TIMEOUT_MS = 20_000

/**
 * Where one message stands between the press and the server's answer. Never a stored DeliveryMark.
 *
 * `not-known`: no answer came within the timeout, and no read of the conversation made since has
 * said whether the letter is there. `not-in-the-conversation`: no answer came, and a read of the
 * conversation made after the timeout does not hold the letter. A later read that holds it still
 * replaces either one with the stored row. Problem KzLydNEm4HYX.
 */
type PendingSendState = 'sending' | 'sent' | 'failed' | 'not-known' | 'not-in-the-conversation'

/**
 * A NEW ID FOR ONE PRESS OF SEND, stored on the message as `sendId`. Problem KzLydNEm4HYX. Random
 * bytes rather than `crypto.randomUUID`, which a page on the office's plain HTTP address does not
 * have.
 */
function aSendId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * ONE MESSAGE, FROM THE PRESS, BEFORE THE REAL ROW EXISTS TO DESCRIBE IT. Criterion M113.
 *
 * Everything needed to draw the bubble and to try the send again is carried on the entry itself
 * rather than read back off the compose box, because the box has already moved on to the next
 * thing the person is typing by the time a slow answer comes back.
 */
interface PendingSend {
  /** This browser's own id for the bubble, never sent to the server. It stays the same across Send again. */
  readonly id: string
  /**
   * THE ID SENT WITH THIS PRESS, stored on the message as `sendId`. New for every press and every
   * Send again. After a timeout the chat finds its own letter in the conversation by it.
   */
  readonly sendId: string
  /** When the wait for the answer was given up, by `Date.now()`. Null unless it was. */
  readonly timedOutAt: number | null
  readonly to: { kind: ParticipantKind; id: string }
  readonly body: string
  readonly pictures: readonly ImageBlock[]
  /** The quotes the bubble carries, taken from the page and shown above the words. */
  readonly quotes: readonly Context[]
  readonly quotePositions: readonly number[] | undefined
  readonly destination: string
  /** The mark the button held at the press, so Send again sends it with the same mark. Absent where none was offered. */
  readonly intent: IntentMark | undefined
  /** The person's own label the flag held at the press, so Send again sends it too. Absent where none was chosen. */
  readonly label: MessageLabel | undefined
  /** The runs of the words the press carried, so Send again carries them too and the bubble draws them. */
  readonly markedParts: readonly AMarkedPart[] | undefined
  /** The draft the words came from, so a refusal can put them and their marks back in that same box. */
  readonly draftKey: string | null
  /** The instruction the office would hand over for the mark; a pending bubble has none until the office answers. */
  readonly whatTheMarkAsks?: string
  readonly state: PendingSendState
  /** The real record id, once the server has answered. Null until then. */
  readonly recordId: string | null
  /** Why it failed, in the server's or the browser's own words. Null unless state is 'failed'. */
  readonly reason: string | null
  /**
   * THE SERVER'S SHORT REASON, when it sent one: "Pike is retired.". It follows criterion M113a and
   * a decision. Null on every other failure, which draws `reason` as M113
   * always has.
   */
  readonly shortReason: string | null
}

/**
 * WHERE ONE DRAWING OF THE CHAT SITS: beside the page at one seam, in the corner as it always was,
 * or as the chat page itself.
 *
 * A decision puts the chat in the sidebar and in the corner. Plan row C1
 * makes the sidebar's entry a page. Design D adds the split. All three are this one component
 * with the same contacts, groups and conversations, read through the same doors, so none can come
 * to show a conversation the others do not. What differs is only the frame: the split has the
 * seam, the corner has the circle and the size a person drags, and the page has neither and is
 * always open.
 */
type ChatWhere = 'corner' | 'split' | 'page'

/**
 * WHETHER THE CHAT PAGE IS ON SCREEN, so the corner does not draw a second copy of it.
 *
 * The second design draft leaves the corner off the chat page: the page is
 * the chat already. The page says it is showing through this store, and the corner reads it.
 */
let chatPagesShowing = 0
const chatPageWatchers = new Set<() => void>()
function watchTheChatPage(watcher: () => void): () => void {
  chatPageWatchers.add(watcher)
  return () => {
    chatPageWatchers.delete(watcher)
  }
}
function theChatPageIsShowing(): boolean {
  return chatPagesShowing > 0
}
function sayTheChatPageIs(showing: boolean): void {
  chatPagesShowing = Math.max(0, chatPagesShowing + (showing ? 1 : -1))
  for (const watcher of chatPageWatchers) watcher()
}

/**
 * WHAT THE CHAT LAST HELD, SO THE NEXT DRAWING OF IT STARTS FROM THAT AND NOT FROM NOTHING.
 *
 * Problem KyrGDY7xY6fG. The chat page and the corner are two drawings of one chat, and going from
 * one page to another puts one away and makes the other. Each started empty, so Home to the chat page
 * and back showed "Reading the contacts…" and "Reading this conversation…" every time. Measured on 27
 * September 2026 with tests/home-and-the-chat-page-keep-what-they-showed.test.ts: back on Home the
 * corner drew "Reading this conversation…", and back on the chat page it drew both lines.
 *
 * So every drawing writes here what it holds, and a new drawing starts from it, then reads everything
 * again and replaces it quietly (`readEverything` at mount). The open conversation is taken only when
 * it is the one with the contact the new drawing opens on. Nothing is taken when the project on
 * screen is not the one it was read in, because a contact list and the dots are one project's
 * answer.
 */
interface WhatTheChatHeld {
  project: string
  lists: HeldLists
  projects: readonly WorkspaceReading[]
}
/**
 * KEPT IN THE PAGE CACHE (src/web/lib/pagecache.ts) since round 17 of wave 13w, under the person or agent
 * reading and the project on screen, so it survives a reload and is forgotten when the writer changes.
 */
const CHAT_KEPT = 'chat.held'

/**
 * WHERE THE READER WAS IN EACH CONVERSATION, so coming back to one lands on the message they were reading, at the
 * height it was at. A conversation left at its newest message keeps no place, and comes back to its newest message.
 *
 * KEPT IN THIS TAB'S `sessionStorage`, for the person reading, in the project on screen, so it lasts the page's life
 * and a reload, and goes when the tab is closed. It is written at once, because a reload can come at once. Measured
 * in wave 13y round 166: kept in the page cache, which copies a change out 400 ms later, a reload straight after the
 * new-messages mark took the reader to the newest message came back to the place before it. A tab that refuses the
 * storage keeps the places for this page load only.
 *
 * The message is named by its id, with how far its top was below the list's top. The newest message then says whether
 * messages came since. When the message was sent tells a message above the pages held, which is read for, from one
 * that has gone.
 */
interface APlaceRead {
  message: string
  fromTheTop: number
  newest: string
  sentAt: string
}
const CHAT_PLACES = 'chat.places'
/** How many conversations keep a place. The one left longest ago is forgotten first. */
const PLACES_KEPT = 50
/** The places as this page load holds them, by where they are kept, read from the storage once. */
const placesHeld = new Map<string, Readonly<Record<string, APlaceRead>>>()

function whereThePlacesAreKept(): string {
  return `mole-office.${placeOf(CHAT_PLACES).key}`
}

function thePlacesRead(): Readonly<Record<string, APlaceRead>> {
  const kept = whereThePlacesAreKept()
  const held = placesHeld.get(kept)
  if (held !== undefined) return held
  let read: Readonly<Record<string, APlaceRead>> = {}
  try {
    const said: unknown = JSON.parse(window.sessionStorage.getItem(kept) ?? '{}')
    if (typeof said === 'object' && said !== null) read = said as Record<string, APlaceRead>
  } catch {
    // REFUSED OR NOT READABLE: this page load starts with no place kept, so each conversation opens at its newest message.
  }
  placesHeld.set(kept, read)
  return read
}

/** Keep where the reader is in one conversation, or forget it with null. */
function keepThePlaceRead(conversation: string, place: APlaceRead | null): void {
  const was = thePlacesRead()
  const before = was[conversation]
  if (place === null ? before === undefined : before?.message === place.message && before.fromTheTop === place.fromTheTop && before.newest === place.newest) return
  const now = Object.fromEntries(Object.entries(was).filter(([key]) => key !== conversation))
  if (place !== null) now[conversation] = place
  const keys = Object.keys(now)
  for (const key of keys.slice(0, Math.max(0, keys.length - PLACES_KEPT))) delete now[key]
  const kept = whereThePlacesAreKept()
  placesHeld.set(kept, now)
  try {
    window.sessionStorage.setItem(kept, JSON.stringify(now))
  } catch {
    // REFUSED: the place is held for this page load only.
  }
}

/**
 * HOW LONG AFTER THE LAST KEY PRESSED IN THE CONTACTS' FILTER BOX THE WORDS ARE ASKED OF THE DOOR. Typing a name is
 * then one read and not one per letter; the rows the panel holds are narrowed at once all the same.
 */
const FILTER_ASKS_AFTER_MS = 250

/**
 * HOW LONG THE ROW ABOVE THE LIST TAKES TO SHOW OR HIDE, AND A LITTLE MORE. While it does, the list under it changes
 * height, and a list scrolled to its foot is moved by that. Those moves are not the reader's, so they are not read as
 * a scroll up or down. The stylesheet's transition is shorter than this.
 */
const FIND_SETTLES_MS = 260

/** How far the list moves before the move counts as a scroll up or down, so a pixel of rounding does neither. */
const FIND_SCROLL_PX = 4

/**
 * HOW LONG AFTER THE LAST ANSWER TO ITS SEEN MARKS THE PANEL STOPS WAITING FOR THEIR EVENTS, and draws those that came.
 * The server announces a mark before it answers, so an event still missing a second later was lost with the stream, and
 * without this the events that did come would not be drawn until some other event arrived.
 */
const SEEN_MARKS_WAITED_FOR_MS = 1000

/** The circle an open panel draws: who reads the contact list and its unread counts. */
function circleOfTheContacts(list: ContactListHeld): TheCircle {
  return { me: list.me, unread: list.unread, workspaceId: list.workspaceId }
}

/**
 * THE SHORT REASON OF A REFUSAL WITH NO CODE, which the chat says instead of the door's sentence, as ErrorNote draws
 * one; null for any other failure. A door's sentence for an id nobody answers to quotes the id, and its reason says the
 * same without it. The read of a conversation and the reads of a pair between agents take it from here (wave 13y
 * rounds 93 and 94).
 */
function theShortReasonOf(err: unknown): string | null {
  const fault = faultOf(err)
  return fault !== null && fault.code === undefined ? fault.reason : null
}

/** THE CHAT IN THE CORNER OF EVERY PAGE, and nothing while the chat page is on screen. */
function ContactWaitLight({ element, status }: { element: HTMLElement; status: 'loading' | 'ready' | 'error' | 'gone' }) {
  const target = useRef<HTMLElement | null>(element)
  useLoadingLight(target, status, 2)
  return null
}

export function Chat() {
  const onThePage = useSyncExternalStore(watchTheChatPage, theChatPageIsShowing, theChatPageIsShowing)
  const split = useSyncExternalStore(watchTheSplit, theSplit, theSplit)
  if (onThePage) return null
  // ONE STORE SAYS WHERE THE CHAT IS. A browser that last had the panel open opens it in the same
  // corner, under the same word `yes`; the split is the new answer, and shut draws the circle.
  return <TheChat where={split.where === 'split' ? 'split' : 'corner'} />
}

/** THE CHAT AS A PAGE: the same drawing as the corner's, always open, filling the page. Plan row C1. */
export function ChatOnThePage() {
  useEffect(() => {
    sayTheChatPageIs(true)
    return () => {
      sayTheChatPageIs(false)
    }
  }, [])
  return <TheChat where="page" />
}

/**
 * THE CHAT PAGE ENDS AT THE WINDOW'S FOOT, AT EVERY WIDTH (wave 13y round 113, item 45). The stylesheet's height leaves
 * room for what is around the page at a desk: the page's padding and the corner button's room. Below that the shell
 * draws a bar across the top, whose height changes as its words wrap. So the page reached past the window there, and
 * once the window scrolled, the bar covered the name at the top of the conversation. The panel is measured instead:
 * what is above it, and what the boxes it sits in leave below it. It takes the rest of the window, and never less than
 * the stylesheet's smallest page, so a short window still scrolls.
 *
 * IT IS MEASURED AGAIN when the window changes size, when the page grows, and when anything above the panel changes
 * height, such as the bar's words wrapping. It is the page frame's ref, so it runs once the panel is drawn and stops
 * when the panel goes.
 */
function fitThePageToTheWindow(panel: HTMLElement): () => void {
  const fit = (): void => {
    let under = 0
    for (let box: HTMLElement | null = panel; box !== null && box !== document.body; box = box.parentElement) {
      const style = getComputedStyle(box)
      under += parseFloat(style.marginBottom)
      if (box !== panel) under += parseFloat(style.paddingBottom) + parseFloat(style.borderBottomWidth)
    }
    const above = panel.getBoundingClientRect().top + window.scrollY
    panel.style.setProperty('--px-chat-page-height', `${String(Math.floor(window.innerHeight - above - under))}px`)
  }
  fit()
  // IN THE NEXT FRAME, because a change of the panel's height inside the observer's own answer changes the page's size
  // in the same frame, and the browser reports that as an error.
  let frame = 0
  const fitSoon = (): void => {
    window.cancelAnimationFrame(frame)
    frame = window.requestAnimationFrame(fit)
  }
  const watch = new ResizeObserver(fitSoon)
  watch.observe(document.body)
  for (let box: Element | null = panel; box !== null && box !== document.body; box = box.parentElement) {
    for (let before = box.previousElementSibling; before !== null; before = before.previousElementSibling) watch.observe(before)
  }
  window.addEventListener('resize', fitSoon)
  return () => {
    window.cancelAnimationFrame(frame)
    watch.disconnect()
    window.removeEventListener('resize', fitSoon)
  }
}

/**
 * Where a list is: its `scrollTop`, and its end as `scrollHeight - clientHeight`, both read now. Read here alone, when
 * the chat puts a list somewhere and when a scroll is compared with where it put it.
 */
function puttingIt(list: HTMLElement): { top: number; end: number } {
  return { top: list.scrollTop, end: list.scrollHeight - list.clientHeight }
}

/**
 * How long a wheel turned or a key pressed in a list of messages counts as the reader's hand on it. Measured in wave
 * 13y round 163: the up arrow's smooth scroll took the list out of the bottom's 8 pixels 57 ms after the key, the
 * slowest of the wheel and the three keys measured. This is about four times that, for a slower frame.
 */
const THEIR_HAND_MS = 250

function TheChat({ where }: { where: ChatWhere }) {
  const onAPage = where === 'page'
  const { language } = useLanguage()
  const inspect = useInspect()
  /**
   * THE PROJECT, WATCHED — AND NOTHING HERE IS THROWN AWAY WHEN IT CHANGES.
   *
   * WHY WATCHING IS ENOUGH. Criterion M55 already made this panel the person's rather than the
   * project's: the contacts, the conversations and the counts are read across every project, and a
   * message written elsewhere carries the mark that says so (`InAnotherProject` below). So changing
   * project does not make one thing in this panel untrue. The one thing it changes is that mark —
   * "elsewhere" means somewhere other than where the reader now is — and this subscription is what
   * redraws it.
   *
   * WHY NOTHING IS CLEARED. `useProjectAsync` reads again what it holds because it is one project's
   * rows. Nothing here is. Clearing this panel on a switch is exactly the defect M61 is about. The
   * owner reported that the chat at the bottom right also flickered on a switch instead of staying the
   * same, and that any text in the chat box was simply cleared. Until
   * 6 September 2026 the whole shell was thrown away on a switch and this panel went with it,
   * taking the scroll position, the open conversation and whatever was half-typed in the composer.
   */
  const here = useSyncExternalStore(subscribeWorkspace, currentWorkspace, currentWorkspace)
  /**
   * WHERE THE CHAT IS, FROM THE ONE STORE (src/web/lib/chat-split.ts). The corner, the split and
   * the circle are three frames of this one drawing, so opening one closes the others, and a
   * browser that was last left in any of them opens in that one after a reload.
   */
  const split = useSyncExternalStore(watchTheSplit, theSplit, theSplit)
  const drawingTheSplit = where === 'split'
  const theSplitIsWide = useNarrow(THE_SPLIT_FROM)
  const splitWidth = widthInside(split.width, typeof window === 'undefined' ? 1440 : window.innerWidth)
  /**
   * WHETHER THE CHAT IS WIDE ENOUGH TO DRAW THE LISTS BESIDE THE CONVERSATION, measured on the chat itself whenever it
   * changes size: the seam or an edge dragged, the window filled, or the browser's window made wider. It is measured
   * before the chat is first painted, so a wide chat does not show one column first. The chat page draws its own two
   * panes and is not measured.
   *
   * A CHANGE IS DRAWN AT ONCE, in the frame the width changed, and not as ordinary state: that is drawn a frame later,
   * and the frame between showed the old count at the new width, two columns in a 332 px window with a conversation
   * 22 px wide. It is drawn at once only when the count changes, so a drag that stays on one side of the width costs
   * nothing.
   */
  const [wideForTwoColumns, setWideForTwoColumns] = useState(false)
  const measureForTwoColumns = useCallback((frame: HTMLElement): (() => void) => {
    const wideNow = (): boolean => frame.getBoundingClientRect().width >= TWO_COLUMNS_FROM
    let wide = wideNow()
    setWideForTwoColumns(wide)
    if (typeof ResizeObserver === 'undefined') return () => undefined
    const watch = new ResizeObserver(() => {
      const now = wideNow()
      if (now === wide) return
      wide = now
      flushSync(() => {
        setWideForTwoColumns(now)
      })
    })
    watch.observe(frame)
    return () => {
      watch.disconnect()
    }
  }, [])
  // THE PAGE IS ALWAYS OPEN. It has no circle and no seam, so nothing on it can close it.
  const open = onAPage || split.where !== 'closed'
  // OPENING NEVER MOVES AN OPEN CHAT. From shut it opens beside the page. A chat the person put in its
  // own window shows what it is asked to open there, and stays in its window.
  const setOpen = (next: boolean): void => {
    if (!onAPage) putTheChat(!next ? 'closed' : split.where === 'window' ? 'window' : 'split')
  }
  /**
   * THE PAGE'S ROOM, SAID FROM WHAT IS DRAWN. Only a split on a window wide enough to hold both
   * halves draws it: below that the open chat covers the screen, so the page must keep its whole
   * width underneath and the root is told no split is drawn.
   */
  useLayoutEffect(() => {
    if (!drawingTheSplit || !theSplitIsWide) {
      sayTheSplitIsDrawn(null)
      return
    }
    sayTheSplitIsDrawn(split.side, splitWidth)
  }, [drawingTheSplit, theSplitIsWide, split.side, splitWidth])
  useEffect(() => () => sayTheSplitIsDrawn(null), [])
  /**
   * WHERE THE PAGE WAS WHEN THE COVERING CHAT OPENED, so its back shape returns there. The place is
   * read from a settled scroll rather than from the instant of the press: a control that takes the
   * focus as it is pressed can nudge the page first, and the place the person left is the place the
   * page rested at before that nudge. A full-screen chat covers the page, so this is the only thing
   * that can bring the reader back to the part they were reading. The page may scroll in the window
   * or in its own box, and src/web/lib/page-scroll.ts says which.
   */
  // Only the first reading is ever kept, so it is the only one taken: the place is read off the page's styles.
  const [thePlaceAtTheStart] = useState(() => (typeof window === 'undefined' ? 0 : thePlaceOnThePage()))
  const thePlaceThePageRestedAt = useRef(thePlaceAtTheStart)
  const thePlaceToReturnTo = useRef<number | null>(null)
  useEffect(() => {
    thePlaceThePageRestedAt.current = thePlaceOnThePage()
    let settling = 0
    const settle = (): void => {
      window.clearTimeout(settling)
      settling = window.setTimeout(() => {
        thePlaceThePageRestedAt.current = thePlaceOnThePage()
      }, 150)
    }
    const stopHearingTheScroll = whenThePageScrolls(settle)
    return () => {
      window.clearTimeout(settling)
      stopHearingTheScroll()
    }
  }, [])
  if (drawingTheSplit && !theSplitIsWide && thePlaceToReturnTo.current === null) {
    thePlaceToReturnTo.current = thePlaceThePageRestedAt.current
  }
  const leaveTheCoveringChat = (): void => {
    const place = thePlaceToReturnTo.current
    thePlaceToReturnTo.current = null
    putTheChat('closed')
    if (place !== null) putThePageAt(place)
  }
  /**
   * WHETHER THE PANEL IS OPEN, FOR THE READS. A page asks only for what it draws, as option 2 of a decision
   * says. A closed panel draws the circle button and nothing else, so it reads who is reading
   * and the circle's number (`readCircleOnce`) and the reader's own registry row, and none of the lists or the open
   * conversation. The reads are callbacks made once, so they read this ref rather than `open`.
   */
  const openNow = useRef(open)
  openNow.current = open
  /** Whether the panel is filling the window. Criterion M104. */
  const [full, setFull] = useState(() => {
    const held = readStored(FULL_KEY)
    return held.ok && held.value === 'yes'
  })
  /**
   * WHETHER THE ONE CHOOSER FOR SUMMONING AN AGENT IS OPEN. Criterion M115.
   *
   * The panel's own header carries one New agent button and this is its open flag. The chooser it
   * opens is `StartANewAgentFromHere`, the same component the right-click menu draws, so the two
   * cannot become two ways of starting an agent.
   */
  const [summoning, setSummoning] = useState(false)
  const [talkingTo, setTalkingToNow] = useState<{ kind: ParticipantKind; id: string } | null>(rememberedContact)
  const pressedContact = useRef<HTMLElement | null>(null)
  const contactSequence = useRef(0)
  const preparedContact = useRef<string | null>(null)
  const [contactWait, setContactWait] = useState<{ sequence: number; element: HTMLElement; status: 'loading' | 'ready' | 'error' | 'gone' } | null>(null)
  /**
   * WHAT THE LAST DRAWING OF THE CHAT HELD, taken once when this one is made, or null because there
   * was none in this project. See `CHAT_KEPT`. The lists below start from it.
   */
  const [kept] = useState(() => {
    const held = keptAnswer<WhatTheChatHeld>(CHAT_KEPT)?.value
    return held !== undefined && held.project === here ? held : null
  })
  const [who, setWhoNow] = useState<ParticipantsForThePageReply | null>(kept?.lists.who ?? null)
  const layoutSaveInFlight = useRef(false)
  const [presence, setPresenceNow] = useState<PresenceOnTheWire[]>(kept?.lists.presence ?? [])
  const [contacts, setContactsNow] = useState<ContactListHeld | null>(kept?.lists.contacts ?? null)
  /**
   * WHO IS READING AND THE NUMBER ON THE CIRCLE, which is all the closed button draws.
   *
   * A closed panel reads it from GET /api/messages/circle. An open panel reads the contact list
   * instead, and `setContacts` below copies that list's `me` and `unread` here, so the button
   * draws from this one state whether the panel is open or closed. The server works out the circle's
   * `unread` and the contact list's `unread` with the same function, so the two agree.
   */
  const [circle, setCircleNow] = useState<TheCircle | null>(() =>
    kept?.lists.contacts != null ? circleOfTheContacts(kept.lists.contacts) : (kept?.lists.circle ?? null),
  )
  // THE OPEN CONVERSATION IS TAKEN ONLY WHEN IT IS WITH THE CONTACT THIS DRAWING OPENS ON. Any other
  // conversation's messages must never be drawn under this contact's name.
  const keptTalk =
    kept?.lists.talk != null && talkingTo !== null && participantKey(kept.lists.talk.them) === participantKey(talkingTo) ? kept.lists : null
  const [talk, setTalkNow] = useState<ConversationReply | null>(keptTalk?.talk ?? null)
  /**
   * THE OPEN AGENT'S PRESENCE, READ WITH `talk` AND STORED WITH IT, for the sleep line and the
   * stale-line mark. The header's dot takes its colour and word from `talk.status`, read in the
   * moment of `talk.answering` (wave 13y round 115), so the dot and the Cannot reach notice always
   * come from one answer. Null until the first such read lands, and for a conversation with a person.
   */
  const [talkPresence, setTalkPresenceNow] = useState<PresenceOnTheWire | null>(keptTalk?.talkPresence ?? null)
  /**
   * WHY THE LAST READ OF THE OPEN CONVERSATION FAILED, with the contact it was about, or null since one landed. Where
   * no conversation is held, the panel says this in place of the reading line, so a read that cannot succeed (the
   * server refuses a conversation with somebody neither registry holds) ends in a stated state, not in "Reading this
   * conversation…" for ever (wave 13y round 91).
   */
  const [talkUnread, setTalkUnread] = useState<{ key: string; why: string; reason: string | null } | null>(null)
  const [between, setBetweenNow] = useState<ShortBetweenAgentsReply | null>(kept?.lists.between ?? null)
  const betweenPages = useRef<AgentConversationPages | null>(null)
  const betweenProjectAsked = useRef<string | null | undefined>(undefined)
  const [betweenLoadingMore, setBetweenLoadingMore] = useState(false)
  /** Which of the three lists the tabs at the top are showing. Criterion M18. */
  const [list, setList] = useState<WhichList>('contacts')
  /**
   * THE TAB ON SCREEN, for the reads. The conversations between agents are read only while their tab is
   * the one showing: on an office of the owner's size that list was 1.4 MB, read with every open panel
   * while its tab was closed (round 19 of wave 13w).
   */
  const listNow = useRef(list)
  listNow.current = list
  /**
   * WHICH SIDE'S ARRANGEMENT IS OPEN, OR NULL BECAUSE NONE IS. Criterion M123.
   *
   * The Edit entry at a top-level heading opens the arrangement for that side alone — new group,
   * rename, move contacts — and the presses are drawn only while it is open. The panel starts 336
   * pixels wide, so a row carrying a move-up, a move-down and a group chooser beside the name and
   * the last line said would leave no room for any of them; and every one of them is a control for a
   * thing somebody does once, beside a list they read every day. The Arrange press that used to sit
   * above the list is gone; this is the state its two Edit entries share, and only one side is open
   * at a time.
   */
  const [arranging, setArranging] = useState<ContactSide | null>(null)
  /**
   * THE GROUPS TAB'S OWN FIRST LEVEL, AND ITS TWO PRESSES. Criterion M123. A
   * "default group" level is the first level in the groups tab, drawn the way the contacts are:
   * New group beside it and an Edit entry at the far right. The
   * first level is `Default group` — every group from every project sits under it — with New group beside
   * it and Edit at its right. Edit opens the arrangement it can actually perform: taking a member out
   * of a group. Adding one is the member chooser on the group page; renaming is not a door this
   * product has, so no press here pretends it is.
   */
  const [editingGroups, setEditingGroups] = useState(false)
  const [groupsWithUndo, setGroupsWithUndo] = useState<readonly string[]>([])
  const undoTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => { for (const timer of undoTimers.current) clearTimeout(timer) }, [])
  const keepGroupForUndo = (id: string): void => {
    if (!held.current.groups?.yours.includes(id)) return
    setGroupsWithUndo(before => [...new Set([...before, id])])
    undoTimers.current.push(setTimeout(() => setGroupsWithUndo(before => before.filter(one => one !== id)), CHAT_UNDO_MS))
  }
  /**
   * WHETHER THE GROUPS TAB'S FOLD IS OPEN. Criterion SC1 was amended on 24 September 2026.
   * It was widened the same day: the groups the reader is in that a person or an agent opened are open, and the
   * groups the office opened by itself and the groups the reader is not in wait under one heading until the reader
   * presses it. The state is the panel's own and starts closed at every load. This is the
   * secretary's reversible judgement (open question A4); M121 kept the contact folds on the server, and the owner
   * may later ask for this one to be remembered too.
   */
  const [foldOpen, setFoldOpen] = useState(false)
  const [namingAGroup, setNamingAGroup] = useState(false)
  const [aGroupName, setAGroupName] = useState('')
  const [groupFault, setGroupFault] = useState<string | null>(null)
  /**
   * THE WRITER NOBODY REGISTERED WHOSE MESSAGES ARE OPEN, or null because none is.
   *
   * This used to be a flag saying the reader was looking at "The board" — one section holding every
   * message whose writer answers to no registry row. That section is gone, and
   * each such writer now has a conversation of its own under the line it typed. Criterion M25.
   */
  const [withUnregistered, setWithUnregisteredNow] = useState<UnregisteredWriter | null>(null)
  const [fromUnregistered, setFromUnregisteredNow] = useState<UnregisteredReply | null>(null)
  /**
   * WHICH CONVERSATION BETWEEN TWO AGENTS IS OPEN, AND WHOSE VIEW IT IS BEING READ FROM.
   *
   * `asSide` NULL IS THE NEUTRAL VIEW, criterion M72. The
   * view used to switch only to one agent's viewpoint, with no neutral view showing the messages of
   * both sides. It is what a row opens in, because the person is a
   * third party to these conversations and taking one of their viewpoints is the special case
   * rather than the ordinary one. The two side presses stay beside it.
   */
  const [reading, setReadingNow] = useState<{ pair: string; asSide: string | null } | null>(null)
  const [asSide, setAsSide] = useState<AsSideReply | null>(null)
  const asSideNow = useRef(asSide)
  asSideNow.current = asSide
  // THE READING WHOSE READ WAS REFUSED, and the reason the panel says in its place (wave 13y round 95, item 26).
  const [pairRefused, setPairRefused] = useState<{ reading: { pair: string; asSide: string | null }; reason: string } | null>(null)
  /** The group the reader has open, or null because they are not in one. */
  const [inTheGroup, setInTheGroupNow] = useState<string | null>(null)
  /**
   * ONE MESSAGE THE PANEL WAS ASKED TO OPEN A GROUP AT, or null because the group was asked for on
   * its own. Criterion GM2: the line saying which group a forwarded reply came from opens that
   * group at that message, and this is the message still to be scrolled to once the group is read.
   */
  const [openAtMessage, setOpenAtMessage] = useState<string | null>(null)
  // A committed choice replaces the other kinds of conversation. A first contact read keeps the
  // previous view until its guarded read commits; a different choice cancels that pending read.
  // A successful first read selects the contact (clearing the wait and advancing the sequence), then
  // sets its ready light; the last state update wins, and that light's older sequence is only its key.
  function stopWaitingForAContact(): void {
    contactSequence.current += 1
    setContactWait(null)
  }
  function setTalkingTo(who: { kind: ParticipantKind; id: string } | null): void {
    if (who !== null) {
      stopWaitingForAContact()
      setInTheGroupNow(null)
      setWithUnregisteredNow(null)
      setReadingNow(null)
      setOpenAtMessage(null)
    }
    setTalkingToNow(who)
  }
  function setWithUnregistered(writer: UnregisteredWriter | null): void {
    if (writer !== null) {
      stopWaitingForAContact()
      setTalkingToNow(null)
      setInTheGroupNow(null)
      setReadingNow(null)
      setOpenAtMessage(null)
    }
    setWithUnregisteredNow(writer)
  }
  function setReading(choice: { pair: string; asSide: string | null } | null): void {
    if (choice !== null) {
      stopWaitingForAContact()
      setTalkingToNow(null)
      setInTheGroupNow(null)
      setWithUnregisteredNow(null)
      setOpenAtMessage(null)
    }
    setReadingNow(choice)
  }
  function setInTheGroup(group: string | null): void {
    if (group !== null) {
      stopWaitingForAContact()
      setTalkingToNow(null)
      setWithUnregisteredNow(null)
      setReadingNow(null)
      setOpenAtMessage(null)
    }
    setInTheGroupNow(group)
  }
  const [groups, setGroupsNow] = useState<ShortGroupsReply | null>(kept?.lists.groups ?? null)
  /**
   * WHERE EACH GROUP SITS IN THE GROUPS TAB. One reader of the one list, so the pinned category, the
   * default grouping and the fold below cannot disagree about which group belongs to which.
   * Criterion SC1. The default grouping and the fold are drawn from this and never filter the list
   * again.
   */
  const {
    pinned: everyPinnedGroup,
    yours: everyGroupTheyAreInThatStaysOpen,
    folded: everyFoldedGroup,
  } = whereEachGroupSits(groups?.groups ?? [], [...(groups?.yours ?? []), ...groupsWithUndo])
  /**
   * Every project this installation holds, for the mark that says which one a message was written
   * in. Criterion M55. Empty until the first read, and a message then carries no mark rather than
   * a project named by its id — a key is not a name.
   */
  const [projects, setProjects] = useState<readonly WorkspaceReading[]>(kept?.projects ?? [])
  /**
   * THE PROJECT THE ONE LIST IS FILTERED TO, OR NULL FOR EVERY PROJECT. A decision says: one list, each conversation
   * marked with its projects, filtered by project, every project by default. The viewer's
   * choice is kept in this browser and the list works without it (src/web/lib/projectmarks.ts).
   *
   * IT NARROWS THE ROWS AND NO COUNT. The number on each tab and on the circle is still every conversation's, because
   * what is unread does not stop being unread when the list is narrowed.
   */
  const [chosenProject, setChosenProject] = useState<string | null>(rememberedProjectChoice)
  const shownProject = theChoiceInForce(chosenProject, projects)
  /**
   * WHAT IS TYPED IN THE CONTACTS' FILTER BOX, criterion M124, and the words the list was last asked for. By the
   * owner's decision, the panel holds the first rows of the list and not all of it, so the filter cannot narrow only
   * the rows held. The rows held are narrowed as the person types, and the words are asked
   * of the door a moment after the typing stops, so a contact the panel has not read yet is found too.
   */
  const [typedInTheFilter, setTypedInTheFilter] = useState('')
  const [wordsAsked, setWordsAsked] = useState('')
  /**
   * WHETHER THE ROW HOLDING THE PROJECT AND THE FILTER IS SHOWN. Wave 13y round 113, item 45: hidden normally, shown by
   * a scroll up, hidden by a scroll down; and shown, whatever the scroll, while it narrows the list or has the
   * keyboard's focus. `findScrolledTo` is the scroll's half; the rest is worked out where the row is drawn.
   *
   * ONLY A SCROLL UP MADE AT THE VERY TOP OF THE LIST SHOWS IT. Wave 13y round 148, item 104: the owner's design of 30
   * October shows the row when the list is already at its top and the person scrolls up further. It had shown on any
   * scroll up.
   */
  const [findScrolledTo, setFindScrolledTo] = useState(false)
  const [findHasFocus, setFindHasFocus] = useState(false)
  const findScrolledNow = useRef(false)
  const findMovedAt = useRef(0)
  const listWasAt = useRef(0)
  const touchWasAt = useRef<number | null>(null)
  const showTheFind = (shown: boolean): void => {
    if (findScrolledNow.current === shown) return
    findScrolledNow.current = shown
    setFindScrolledTo(shown)
  }
  /** A list drawn again starts from where it is, so the first scroll in it is read against that. */
  const theListScrolls = useCallback((node: HTMLDivElement | null) => {
    if (node !== null) listWasAt.current = node.scrollTop
  }, [])
  useEffect(() => {
    const later = window.setTimeout(() => setWordsAsked(typedInTheFilter.trim()), FILTER_ASKS_AFTER_MS)
    return () => window.clearTimeout(later)
  }, [typedInTheFilter])
  /** What narrows the contact list now, for the reads, which are callbacks made once. */
  const narrowing = useRef<TheNarrowing>({ name: wordsAsked, project: shownProject })
  narrowing.current = { name: wordsAsked, project: shownProject }
  const thePinnedGroups = everyPinnedGroup.filter((one) => inTheChosenProject(one, shownProject))
  const theGroupsTheyAreInThatStayOpen = everyGroupTheyAreInThatStaysOpen.filter((one) => inTheChosenProject(one, shownProject))
  const theFoldedGroups = everyFoldedGroup.filter((one) => inTheChosenProject(one, shownProject))
  const [theGroup, setTheGroupNow] = useState<OneGroupReply | null>(null)
  /**
   * WHAT THE PANEL HOLDS, for the event handler, which applies an event to it rather than reading the
   * lists again (src/web/lib/chatdeltas.ts). Each list's setter below moves this at the same moment as
   * the state, so an event handled before the next render starts from what the last read or the last
   * event made, and not from the lists before them: a read that answered and then an event applied to
   * the older lists would put the older rows back.
   */
  const held = useRef<HeldLists>({ circle, who, presence, contacts, between, groups, talk, talkPresence, theGroup, unregistered: fromUnregistered })
  held.current = { circle, who, presence, contacts, between, groups, talk, talkPresence, theGroup, unregistered: fromUnregistered }
  // AND WHAT IT HOLDS IS WRITTEN WHERE THE NEXT DRAWING OF THE CHAT WILL START FROM. Problem KyrGDY7xY6fG.
  useEffect(() => {
    keepAnswer(CHAT_KEPT, {
      project: here,
      lists: { circle, who, presence, contacts, between, groups, talk, talkPresence, theGroup, unregistered: fromUnregistered },
      projects,
    } satisfies WhatTheChatHeld)
  }, [here, circle, who, presence, contacts, between, groups, talk, talkPresence, theGroup, fromUnregistered, projects])
  /**
   * WHETHER THE REGISTRY ON SCREEN WAS READ IN THIS PAGE'S LIFE, and is not only the copy kept from
   * before a reload. The button's picture waits for it (`circleFace`).
   */
  const [whoReadHere, setWhoReadHere] = useState(() => isFresh(cacheName('participants')))
  const setWho = (next: ParticipantsForThePageReply | null): void => {
    held.current = { ...held.current, who: next }
    setWhoNow(next)
    if (next !== null) setWhoReadHere(true)
  }
  /**
   * WHETHER THE READINGS HELD ARE STILL THE ONES KEPT FOR THIS DRAWING, and not ones this drawing has read. A drawing
   * that starts from the kept answer (`CHAT_KEPT`) shows those readings until its own come, and the first row that
   * draws one asks for it again (`readingOf`): the office can begin or end a resident's sleep on its clock, so a kept
   * sleep line is old with no event this page heard. Once a read lands, the readings are this drawing's own.
   */
  const thePresenceIsKept = useRef((kept?.lists.presence?.length ?? 0) > 0)
  const setPresence = (next: PresenceOnTheWire[]): void => {
    thePresenceIsKept.current = false
    held.current = { ...held.current, presence: next }
    setPresenceNow(next)
  }
  /**
   * THE DOTS ARE READ FOR THE ROWS DRAWN, AND NOT FOR EVERYBODY. Round 9 of wave 13x: on an office of the live size
   * everybody's presence was 418 KB and 124 ms of the server's time on every page, for a panel that draws a few dozen
   * dots.
   *
   * `readingOf` below is what every dot in the panel is drawn from, so it is the one place that knows which dots are
   * on the screen. It writes down each participant it is asked about (`dotsDrawn`, begun again at each drawing of the
   * panel). One it holds no reading for is read, together with the others asked about in the same drawing, by
   * `GET /api/presence?of=`, once in each project (`dotsAskedFor`). A read of the presence again, after an event or a
   * move to another project, reads the dots drawn and keeps only those.
   */
  const dotsDrawn = useRef(new Map<string, { kind: ParticipantKind; id: string }>())
  dotsDrawn.current = new Map()
  const dotsAskedFor = useRef({ project: here, keys: new Set<string>() })
  const dotsToRead = useRef<Map<string, { kind: ParticipantKind; id: string }> | null>(null)
  const aDotIsDrawn = (who: { kind: ParticipantKind; id: string }, read: boolean): void => {
    const key = participantKey(who)
    dotsDrawn.current.set(key, who)
    if (read) return
    const project = currentWorkspace()
    if (dotsAskedFor.current.project !== project) dotsAskedFor.current = { project, keys: new Set() }
    if (dotsAskedFor.current.keys.has(key)) return
    dotsAskedFor.current.keys.add(key)
    if (dotsToRead.current === null) {
      dotsToRead.current = new Map()
      // AFTER THIS DRAWING, so every dot it draws is asked for in one read.
      setTimeout(() => {
        const asked = [...(dotsToRead.current ?? new Map()).values()]
        dotsToRead.current = null
        void theDotsOf(asked).then(
          (answers) => {
            let list = held.current.presence ?? []
            for (const one of answers) list = presenceWithOne(list, one)
            setPresence(list)
          },
          (err: unknown) => setFault(errorMessage(err)),
        )
      }, 0)
    }
    dotsToRead.current.set(key, who)
  }
  /**
   * The dots of these participants, in the project on screen, or none where the read answered for another one. The door
   * says which project it answered for (`workspaceId`). A read started before the page moved to another project answers
   * for the old one, and drawing it would show dots worked out somewhere else.
   */
  const theDotsOf = async (whos: readonly { kind: ParticipantKind; id: string }[]): Promise<PresenceOnTheWire[]> => {
    const project = currentWorkspace()
    const answers = await Promise.all(
      Array.from({ length: Math.ceil(whos.length / DOTS_IN_ONE_READ) }, (_, i) => api.presenceOf(whos.slice(i * DOTS_IN_ONE_READ, (i + 1) * DOTS_IN_ONE_READ))),
    )
    if (project !== currentWorkspace() || answers.some((one) => one.workspaceId !== project)) return []
    return answers.flatMap((one) => one.presence)
  }
  /**
   * The presence read again: the dots drawn, read in the project on screen, and nothing else kept. With no dot drawn,
   * `forget` drops what is held, because it was read for another project, and `keep` keeps it for the next drawing.
   */
  const readTheDotsDrawn = async (whenNoneIsDrawn: 'keep' | 'forget'): Promise<void> => {
    const whos = [...dotsDrawn.current.values()]
    const project = currentWorkspace()
    dotsAskedFor.current = { project, keys: new Set(whos.map((one) => participantKey(one))) }
    if (whos.length === 0) {
      if (whenNoneIsDrawn === 'forget') setPresence([])
      return
    }
    const answers = await theDotsOf(whos)
    if (project === currentWorkspace()) setPresence(answers)
  }
  const setContacts = (next: ContactListHeld | null): void => {
    // THE CIRCLE FOLLOWS THE LIST IN THE SAME TASK, and so in the same drawing. An effect copied it after the list was
    // drawn until wave 13y round 85, which drew the panel a second time for every change to the list.
    const circleNow = next === null ? held.current.circle : circleOfTheContacts(next)
    held.current = { ...held.current, contacts: next, circle: circleNow }
    setContactsNow(next)
    setCircleNow(circleNow)
  }
  /**
   * THE CONTACT LIST READ FROM ITS FIRST ROW, under what narrows it now: as many rows as the panel holds, so the person's
   * place in the list is kept (src/web/lib/the-contact-list-held.ts). The panel opening, an event and a change to the
   * arrangement all read the list this way. It is never the page's shared read, because what it asks depends on how
   * far this panel has been scrolled.
   *
   * ON THE BETWEEN AGENTS TAB, AFTER THAT LIST'S FIRST PAGE. The server answers one read at a time, in the order the
   * reads reach it, and the chat opens on the Contacts tab, so a person who pressed Between agents at once found that
   * list waiting behind the opening read of this one. On that tab this list draws only the Contacts tab's number and
   * says who is reading. So the first page of that tab takes back the reads of this list that have not answered
   * (`readBetweenWhenReady`), and a read asked while that page is out waits for it. A read taken back is asked again,
   * and its caller is handed that answer, never a fault. Until it answers, the Contacts tab draws no number. A read
   * with a signal is never joined to the same read already out (`moleOfficeRequest` in api.ts), so two callers at once
   * ask the server twice.
   */
  const contactListReadsOut = useRef(new Set<AbortController>())
  const betweenFirstPageOut = useRef<{ answered: Promise<void>; letGo: () => void } | null>(null)
  const readTheContactListFromTheTop = async (): Promise<ContactListPage> => {
    for (;;) {
      while (betweenFirstPageOut.current !== null) await betweenFirstPageOut.current.answered
      const asked = new AbortController()
      contactListReadsOut.current.add(asked)
      try {
        return await stamped(api.contactList(theReadFromTheTop(held.current.contacts, narrowing.current), asked.signal))
      } catch (err: unknown) {
        if (!asked.signal.aborted) throw err
      } finally {
        contactListReadsOut.current.delete(asked)
      }
    }
  }
  /** A page read from the first row becomes what the panel holds, unless the narrowing changed while it was on its way. */
  const holdTheContactList = (page: ContactListPage): void => {
    theReaderIs(page.me)
    if (!readUnder(page, narrowing.current)) return
    setContacts(theContactListAsHeld(page))
    markFreshFrom([cacheName('contacts'), cacheName('circle')], page)
  }
  const setCircle = (next: TheCircle | null): void => {
    held.current = { ...held.current, circle: next }
    setCircleNow(next)
  }
  const setTalk = (next: ConversationReply | null): void => {
    held.current = { ...held.current, talk: next }
    // WHAT IS KEPT FOR THE NEXT ENTRY FOLLOWS WHAT IS DRAWN, so a mark or a message an event brought is
    // kept as well. Where the newest page came from and whether older ones remain are left as they were.
    if (next !== null) {
      const kept = heldConversation(participantKey(next.them))
      if (kept !== null) holdConversation(participantKey(next.them), { ...kept, reply: next })
    }
    setTalkNow(next)
  }
  const setTalkPresence = (next: PresenceOnTheWire | null): void => {
    held.current = { ...held.current, talkPresence: next }
    setTalkPresenceNow(next)
  }
  const setBetween = (next: ShortBetweenAgentsReply | null): void => {
    if (next !== null && betweenPages.current !== null) {
      betweenPages.current = { ...betweenPages.current, reply: { ...betweenPages.current.reply, ...next } }
    }
    held.current = { ...held.current, between: next }
    setBetweenNow(next)
  }
  const setFromUnregistered = (next: UnregisteredReply | null): void => {
    held.current = { ...held.current, unregistered: next }
    setFromUnregisteredNow(next)
  }
  const setGroups = (next: ShortGroupsReply | null): void => {
    held.current = { ...held.current, groups: next }
    setGroupsNow(next)
  }
  const setTheGroup = (next: OneGroupReply | null): void => {
    held.current = { ...held.current, theGroup: next }
    setTheGroupNow(next)
  }
  /**
   * WHAT HAS BEEN TYPED AND NOT SENT, ONE DRAFT PER CONVERSATION. Criterion M98.
   *
   * The owner reported on 9 September 2026 that what was typed in the
   * conversation with one agent stayed in the box when another agent's conversation was opened: there
   * was no draft kept for each conversation. This used to be one string — `const [typed, setTyped] =
   * useState('')` — so every conversation in the panel drew the same box. Opening another contact
   * showed the sentence written for the first one, and Send would have sent it to the wrong reader.
   *
   * IT IS A MAP AND THE BOX IS DERIVED FROM IT. The alternative was to keep one string and save it
   * on every change of conversation, which is the same fact in two places: the string and the map
   * would then both hold an opinion about the open conversation's draft, and one lost keystroke is
   * a person's own words gone.
   *
   * AND IT IS READ BACK ONCE, the first time a panel asks (`draftsNow`). A browser that refuses
   * session storage is said out loud rather than losing the words silently — `draftFault` is what
   * the composer draws.
   *
   * THE PANEL DOES NOT HOLD THE MAP ITSELF. It lives outside the panel (`writeADraft` above), the box
   * reads its own draft through `TheBox`, and the panel reads only the fault and the rows' copy, so a
   * key press draws the box and nothing else. Problem VovNhzVWkNOl.
   */
  const draftFault = useSyncExternalStore(watchTheDrafts, () => draftsNow().fault ?? draftsNow().quoteFault, () => draftsNow().fault ?? draftsNow().quoteFault)
  const drafts = useSyncExternalStore(watchTheDrafts, () => draftsNow().forTheRows, () => draftsNow().forTheRows)
  /**
   * THE PROJECT A MESSAGE IS SENT IN, decided here and nowhere else: the project the page that opened
   * this conversation asked for, or else the project on screen. A decision removed the chooser that
   * let a person pick another one in the chat.
   */
  const [sendWorkspace, setSendWorkspace] = useState<string | null>(null)
  const destination = sendWorkspace ?? here
  /**
   * WHICH CONVERSATION THE BOX BELONGS TO RIGHT NOW, in the order the panel draws them.
   *
   * It is null in the two places with no box: the contact list, and a conversation between two
   * agents, which the reader watches and cannot write in.
   */
  const whichConversation: WhichChatConversation | null =
    inTheGroup !== null
      ? { what: 'group', id: inTheGroup }
      : withUnregistered !== null
        ? { what: 'unregistered', key: unregisteredKey(withUnregistered) }
        : reading !== null
          ? null
          : talkingTo !== null
            ? { what: 'contact', who: talkingTo }
            : null
  const draftHereKey = whichConversation === null ? null : chatDraftKey(whichConversation)
  /**
   * WHAT IS IN THE BOX, which is this conversation's own draft and nobody else's. It is read when it
   * is needed, at a press, and drawn by `TheBox`; the panel does not redraw when it changes.
   */
  const typedNow = (): string => draftOf(draftHereKey)
  // THE BOX MOVED TO ANOTHER CONVERSATION OR AWAY, so the rows are brought up to date before the
  // list is painted. See `rowsFollowNow`.
  useLayoutEffect(() => {
    rowsFollowNow()
  }, [draftHereKey])
  const setTyped = (next: string): void => {
    if (draftHereKey === null) return
    writeADraft(draftHereKey, next)
  }
  /**
   * WHAT IS WAITING UNSENT IN ONE ROW'S CONVERSATION, or null because nothing is. Criterion M99.
   *
   * The row draws a pencil and the draft's first words where this answers. It reads the same map the
   * composer writes and spells the key with the same function, so a row and a box cannot come to two
   * answers about one conversation. It reads the rows' copy, which follows the box when the typing
   * pauses (`ROWS_FOLLOW_AFTER_MS`).
   */
  const draftOnARow = (line: ShortContactLine): string | null => {
    const key =
      line.who !== null
        ? chatDraftKey({ what: 'contact', who: line.who })
        : line.unregistered !== null
          ? chatDraftKey({ what: 'unregistered', key: unregisteredKey(line.unregistered) })
          : null
    if (key === null) return null
    const held = drafts[key]
    return held === undefined || held === '' ? null : held
  }
  /**
   * THE PICTURE ON ITS WAY INTO THE NEXT MESSAGE, or none. Criterion M65.
   *
   * ONE FOR THE WHOLE PANEL AND NOT ONE PER CONVERSATION, which is the same choice the typed words
   * make: `typed` is one box here too. A picture chosen and then carried into somebody else's
   * conversation is the fault to watch for, and it is the reason `send` clears this the moment the
   * message goes.
   */
  const picture = usePictureToSend()
  const keptQuotes = useSyncExternalStore(watchTheDrafts, () => quotesInDraft(draftHereKey), () => quotesInDraft(draftHereKey))
  /** THE MARKED PARTS KEPT WITH THIS CONVERSATION'S DRAFT, so opening another conversation and coming back keeps them. */
  const keptParts = useSyncExternalStore(watchTheDrafts, () => partsInDraft(draftHereKey), () => partsInDraft(draftHereKey))
  const partsFault = useSyncExternalStore(watchTheDrafts, () => draftsNow().partsFault, () => draftsNow().partsFault)
  /** Where the plain box's selection was when the person last made one, so choosing a flag knows what to mark. */
  const wordsSelectedInTheBox = useRef<{ from: number; to: number }>({ from: 0, to: 0 })
  const quoteCaret = useRef<QuoteCaret>({ at: 0, quotesBefore: 0 })
  const selectedQuote = useRef<ReturnType<typeof pointedAt> | null>(null)
  const [pickingQuote, setPickingQuote] = useState(false)
  const pointMode = usePointMode()
  const quotePickingPlace = useRef({ where, frame: split.where, side: split.side, workspace: here })
  useEffect(() => {
    const was = quotePickingPlace.current
    quotePickingPlace.current = { where, frame: split.where, side: split.side, workspace: here }
    if (pickingQuote && (was.where !== where || was.frame !== split.where || was.side !== split.side || was.workspace !== here)) {
      stopShowing()
      setPickingQuote(false)
    }
  }, [where, split.where, split.side, here, pickingQuote])
  useLayoutEffect(() => {
    quoteCaret.current = { at: draftOf(draftHereKey).length, quotesBefore: quotesInDraft(draftHereKey).length }
    wordsSelectedInTheBox.current = { from: 0, to: 0 }
    setDroppedMarks([])
    setMarksTakenOff(null)
  }, [draftHereKey])

  const putQuoteInTheDraft = (pointed: ReturnType<typeof pointedAt>): void => {
    if (draftHereKey === null) return
    const current = quotesInDraft(draftHereKey)
    const at = Math.min(Math.max(quoteCaret.current.at, 0), draftOf(draftHereKey).length)
    const before = Math.min(Math.max(quoteCaret.current.quotesBefore, 0), current.length)
    // A caret between two quotes at the same text position distinguishes their order.
    let index = current.findIndex((quote, n) => quote.at > at || (quote.at === at && n >= before))
    if (index < 0) index = current.length
    const quote: DraftQuote = { id: crypto.randomUUID(), context: pointed.context, about: pointed.about, at }
    writeDraftQuotes(draftHereKey, [...current.slice(0, index), quote, ...current.slice(index)])
    quoteCaret.current = { at, quotesBefore: index + 1 }
  }
  /**
   * Take the words selected on the page, before the press moves the focus and the selection goes.
   *
   * WORDS OF A STORED TEXT AND MOLE OFFICE'S OWN WORDS ARE BOTH KEPT. Home draws mostly Mole Office's own words, which no
   * record stores, so they come back as a quote of the words themselves and not as a place in a stored text. The press
   * used to keep only words placed in a stored text, so a selection on Home did nothing. A selection whose words
   * `wordsNamedBy` cannot name, one that runs across two stored texts, is still not kept.
   */
  const quoteTheSelectedWords = (): ReturnType<typeof pointedAt> | null => {
    const selection = window.getSelection()
    if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return null
    const pointed = pointedAt(selection.getRangeAt(0).startContainer, selection)
    return wordsNamedBy(pointed.context) === null ? null : pointed
  }
  /** The quote at this place in the kept list comes out, and the words stay exactly as they were. */
  const takeTheQuoteOut = (id: string): void => {
    const current = quotesInDraft(draftHereKey)
    const index = current.findIndex((quote) => quote.id === id)
    if (index < 0) return
    if (quoteCaret.current.quotesBefore > index) quoteCaret.current = { ...quoteCaret.current, quotesBefore: quoteCaret.current.quotesBefore - 1 }
    writeDraftQuotes(draftHereKey, current.filter((quote) => quote.id !== id))
  }
  useEffect(() => {
    if (pickingQuote && pointMode.state === 'off') setPickingQuote(false)
  }, [pickingQuote, pointMode.state])
  useEffect(() => {
    if (!pickingQuote) return
    let started: { x: number; y: number; pointerType: string } | null = null
    const down = (event: PointerEvent): void => { started = { x: event.clientX, y: event.clientY, pointerType: event.pointerType } }
    const click = (event: MouseEvent): void => {
      const found = addressableAt(event.target as Node)
      const moved = started === null ? null : Math.max(Math.abs(event.clientX - started.x), Math.abs(event.clientY - started.y))
      const pointerType = started?.pointerType
      started = null
      if (!pressChoosesTheSubject(true, found?.element ?? null, moved, pointerType)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      putQuoteInTheDraft(pointedAt(event.target as Node, null))
      stopShowing()
      setPickingQuote(false)
    }
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      stopShowing()
      setPickingQuote(false)
    }
    const leavePage = (): void => {
      stopShowing()
      setPickingQuote(false)
    }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('click', click, true)
    window.addEventListener('keydown', key, true)
    window.addEventListener('hashchange', leavePage)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('click', click, true)
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('hashchange', leavePage)
      stopShowing()
    }
    // The conversation is fixed for the duration of one picking gesture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickingQuote, draftHereKey])
  // WHAT LOOKS LIKE A KEY IS ASKED ABOUT ONCE, BEFORE A SEND. The question is in
  // src/web/components/AKeyQuestion.tsx.
  const keyQuestion = useAKeyQuestion(draftHereKey)
  /**
   * THE MARK ON THE FLAG LEFT OF SEND, which the next message carries. It goes back to "none" at every send, so a
   * "just ask" chosen once never quietly holds back the message after it.
   */
  const [intent, setIntent] = useState<IntentMark>('none')
  /**
   * OR A LABEL OF THE PERSON'S OWN, chosen on the same flag in place of a mark. Choosing one sets the mark back to "none",
   * and choosing a mark takes the label off, so the flag shows one choice. It too goes back to none at every send.
   */
  const [label, setLabel] = useState<MessageLabel | null>(null)
  /** The parts a typed change took out of the draft, said under the box until the next change or send. */
  const [droppedMarks, setDroppedMarks] = useState<readonly ADroppedPart[]>([])
  /** A whole-message flag that took the marks off the words, said under the box until the next change or send. */
  const [marksTakenOff, setMarksTakenOff] = useState<string | null>(null)
  const [pieceToSelect, setPieceToSelect] = useState<APieceToSelect | null>(null)
  /** Change it: the piece the question saw is selected in the box, when it is in the words and not a picture's name. */
  const selectTheKey = (): void => {
    const text = typedNow()
    const found = whereAMessageHoldsAKey([{ where: 'body', text }])
    const start = found === null ? -1 : text.indexOf(found.seen.piece)
    if (found !== null && start >= 0) setPieceToSelect({ text, start, end: start + found.seen.piece.length })
  }
  /**
   * WHETHER THIS SEND WAITS FOR THE KEY QUESTION, and if it does, what Send anyway will send: these words and these very
   * pictures, held at the asking. Found by the check in message SxOEtUS4QV5B: the pictures are one row for the whole
   * panel, so a picture added or taken out in another conversation changes this draft while its question waits. Send
   * anyway then finds the draft changed, sends nothing and says what changed (src/web/components/AKeyQuestion.tsx), and
   * the newer draft stays unsent.
   */
  const askedAboutAKey = (words: string, these: readonly PictureChosen[], sendAnyway: (held: WhatTheQuestionHeld) => void): boolean => {
    const held: WhatTheQuestionHeld = { words, pictures: these, intent, label }
    const about = { body: words, pictureNames: these.map((one) => one.file.name) }
    const howItChanged = (): HowTheDraftChanged | null => {
      const now = picture.chosenNow()
      const words = typedNow().trim() !== held.words
      const pictures = now.length !== held.pictures.length || !now.every((one, i) => one.key === held.pictures[i]?.key)
      return words || pictures ? { words, pictures, picturesNow: now.length, picturesHeld: held.pictures.length } : null
    }
    return keyQuestion.stopsTheSend(about, () => sendAnyway(held), howItChanged)
  }
  /**
   * WHETHER A PRESS MAY SEND NOW, for the Send button and the send key alike. The button was disabled while a picture's
   * upload ran, but the send key did not ask and sent anyway. One rule, so they cannot disagree.
   * A group's send is still going from its press until the group message is stored or the send fails (problem
   * SO3kM_TLlKaR): the upload ends before the message is stored, and in that gap the box and the row still hold what the
   * send carries, so a second press sent it twice.
   */
  const [groupSendGoingIn, setGroupSendGoingIn] = useState<string | null>(null)
  const canSendNow = (words: string): boolean =>
    !(talkingTo !== null && isMoleOffice(talkingTo)) && words.trim() !== '' && !picture.sending && !(inTheGroup !== null && groupSendGoingIn === inTheGroup)
  /**
   * The words a person types close the question, so Send anyway never sends other words than it was asked about.
   *
   * TYPING MOVES THE MARKS WITH THE WORDS. A part wholly before or after the change keeps its flag and moves by the
   * change's length; a part the change touches is dropped, and every dropped part is said under the box with its words
   * and its flag. The one reader of that arithmetic is `markedPartsAfterATypedChange`.
   */
  const typeInTheBox = (next: string): void => {
    keyQuestion.close()
    const before = typedNow()
    if (next !== before) {
      const held = partsInDraft(draftHereKey)
      if (held.length > 0) {
        const moved = markedPartsAfterATypedChange(before, next, held)
        writeDraftParts(draftHereKey, moved.kept)
        setDroppedMarks(moved.dropped)
      } else if (droppedMarks.length > 0) {
        setDroppedMarks([])
      }
      if (marksTakenOff !== null) setMarksTakenOff(null)
    }
    setTyped(next)
  }
  /**
   * MESSAGES BETWEEN THE PRESS AND THE SERVER'S ANSWER, criterion M113. After a send, the clock
   * mark used to appear only once the message had
   * reached the server, and nothing at all showed to the sender while the server received it and
   * answered. Words sent on a bad connection could be swallowed with no sign they were ever tried.
   *
   * THIS IS A BROWSER-ONLY LIST AND NEVER A DELIVERY MARK. A `DeliveryMark` (queued, delivered,
   * seen — shared/messages.ts) is a row that exists once the server has written the message; one of
   * these exists from the press, before any such row does, which is exactly the gap to be
   * filled. Once the server answers, the real row takes over: `sendingReconciled` below drops
   * the entry here the moment the row it stands for shows up in the fetched conversation, so a
   * message is never drawn twice.
   */
  const [pendingSends, setPendingSends] = useState<readonly PendingSend[]>([])
  /** One id per press, so two messages sent quickly are two rows and neither overwrites the other. */
  const pendingSendCounter = useRef(0)
  const [fault, setFault] = useState<string | null>(null)
  const [changingState, setChangingState] = useState(false)
  /** Which review is collecting, so the press below sends through the same door the column uses. */
  const review = useReview()
  /** True while the three presence choices are offered under the dot. Criterion M20. */
  const [stateTyped, setStateTyped] = useState('')
  /** True while the reader is writing the line on the agent whose conversation is open. Criterion M21. */
  const [changingTheirState, setChangingTheirState] = useState(false)
  const [theirStateTyped, setTheirStateTyped] = useState('')
  /**
   * WORDS TYPED INTO A STATUS EDITOR THAT A CLICK OUTSIDE CLOSED, offered again when it opens. A click
   * outside may be a slip, so it does not throw away what was typed; Escape and the cross do, as they
   * always did. That is the secretary's rule of wave 13y round 80. The agent's draft names the agent it
   * was typed for, so it is never offered under another name. Neither is kept across a reload.
   */
  const [stateDraft, setStateDraft] = useState<string | null>(null)
  const [theirStateDraft, setTheirStateDraft] = useState<{ who: string; words: string } | null>(null)
  const stateEditor = useRef<HTMLDivElement | null>(null)
  const theirStateEditor = useRef<HTMLDivElement | null>(null)
  /**
   * THE LIST OF MESSAGES ON SCREEN, so the panel can tell where the reader is looking.
   *
   * One ref for all four conversations, because only one of them is mounted at a time. It is the
   * element that scrolls: `.px-chat-said` carries `overflow-y: auto` and the panel around it does
   * not.
   */
  const theList = useRef<HTMLOListElement | null>(null)
  /**
   * THE PLACE BEING READ IN THAT LIST. Criterion M101, and the owner's rule of wave 13y round 148,
   * item 108: the place being read stays where it is on the screen, whatever changes size.
   *
   * AT THE VERY BOTTOM IT IS THE NEWEST MESSAGE, so new messages come into view. Anywhere else it is
   * the row across the middle of the list, with where that row's top and the list's two edges were
   * in the window.
   *
   * A REF AND NOT A STATE, because nothing on the screen is drawn from it and a render on every
   * scroll event would be a render on every scroll event. What IS drawn is `newMessagesBelow`
   * below, which changes rarely.
   *
   * IT STARTS AT THE NEWEST. A list with nothing in it, and a list shorter than the panel, are both
   * at their own bottom, and a conversation just opened is put at its newest message.
   */
  const thePlace = useRef<'the newest' | { row: Element; rowTop: number; top: number; bottom: number }>('the newest')
  /**
   * WHERE THE CHAT ITSELF LAST PUT THE LIST, or where the reader's own scroll left it, and where
   * the list's end was then. The list still there means the reader has not moved
   * it since. `puttingIt` is the one place both are read.
   */
  const whereWePutIt = useRef<{ top: number; end: number } | null>(null)
  /**
   * THE READER'S HAND ON THE LIST: whether the scroll bar is pressed, whether a finger is on the
   * list, and when the wheel or a key last moved it or the bar or the finger was let go. A scroll
   * read while it is there is the reader's own.
   */
  const theirHand = useRef({ pressed: false, touched: false, at: Number.NEGATIVE_INFINITY })
  /**
   * MESSAGES ARRIVED WHILE THE READER WAS ABOVE THE BOTTOM. Criterion M101.
   *
   * The owner reported on 9 September 2026 that the panel sometimes jumped to
   * the bottom on its own, in the middle of reading something further up. The panel used to scroll to the end whenever the conversation was read
   * again, which is every few seconds, so reading anything above the fold was impossible. It stays
   * where the reader put it now, and this is what says there is something new under them.
   */
  const [newMessagesBelow, setNewMessagesBelow] = useState(false)
  /** How many messages were drawn last time, so an arrival can be told from a redraw. */
  const drawnBefore = useRef<string | null>(null)
  /** Which conversation is on screen, as `conversationOnScreen` below says, for the scroll handler. */
  const conversationOnScreenNow = useRef<string | null>(null)
  /**
   * THE PLACE TO COME BACK TO in the conversation just opened. See `CHAT_PLACES`. `row` is null until the message it
   * names is drawn and put back, and then it is that message's row, held where it was put until the list is moved by
   * anything else. Null when there is none.
   */
  const placeToComeBackTo = useRef<{ conversation: string; place: APlaceRead; row: Element | null } | null>(null)
  /** The messages of the conversation on screen, as `saidOnScreen` below says, for the scroll handler. */
  const saidOnScreenNow = useRef<readonly PoolEntry[]>([])
  /**
   * EVERY MESSAGE THIS PAGE HAS ALREADY SAID IT READ.
   *
   * It exists so the saying happens once. Marking is safe to repeat — a mark never moves backwards
   * — but the effect below re-runs whenever the contacts are read again, and without this it would
   * ask again every time and never settle.
   */
  const alreadySaidIReadIt = useRef<Set<string>>(new Set())
  const [readMarksFailed, setReadMarksFailed] = useState<ReadonlySet<string>>(() => new Set())
  /**
   * THE MESSAGES THIS PANEL HAS SAID IT READ AND WHOSE EVENT HAS NOT COME BACK YET, and the events that have.
   *
   * Each mark comes back as its own `delivery.changed`. Opening a conversation with 25 unread messages drew the panel
   * once for each of them (wave 13y round 85). Such an event is held until every mark the panel is waiting for has come
   * back or has answered that it moved nothing, and then they are applied in the order they came and drawn once. Any
   * other event is applied after them, at once, so nothing else waits.
   */
  const seenMarksOut = useRef<Set<string>>(new Set())
  const seenMarksBack = useRef<ChannelEvent[]>([])
  const seenMarksGivenUp = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(seenMarksGivenUp.current), [])

  // HOW BIG THE PANEL IS, WHICH IS THE PERSON'S ANSWER AND NOT THE CONTENT'S. The panel used to
  // change size with its content; it has a fixed size whose width and height the person
  // can change freely. Criterion M17.
  const [size, setSize] = useState<PanelSize>(rememberedSize)
  const [dragging, setDragging] = useState<Edge | 'move' | null>(null)
  const dragFrom = useRef<{ edge: Edge; x: number; y: number; from: PanelSize } | null>(null)
  // THE SEAM'S OWN DRAG. It is not the corner's: the seam moves the line between the page and the
  // chat, and the corner's grips change the floating panel's size. Neither can run while the other
  // is drawn, because only one of the two frames is drawn at a time.
  const [seamDragging, setSeamDragging] = useState(false)
  const seamFrom = useRef<{ x: number; width: number } | null>(null)
  // ON A PHONE THE PANEL IS THE WHOLE WIDTH AND THERE IS NOTHING TO DRAG. The handles are not drawn
  // at all rather than drawn and disabled: a handle that cannot be used is a control a reader tries.
  const narrow = useNarrow(`(max-width: ${THE_WHOLE_SCREEN_BELOW})`)

  const roomOnScreen = (): { width: number; height: number } =>
    typeof window === 'undefined'
      ? { width: SIZE_TO_START_WITH.width + ROOM_LEFT.width, height: SIZE_TO_START_WITH.height + ROOM_LEFT.height }
      : { width: window.innerWidth, height: window.innerHeight }

  /**
   * WHERE THE PANEL SITS. Wave 13y round 113, item 45: the chat can be moved freely, and since round 166 a plain drag
   * of its top row moves it, with no hold first. Null is the corner, where the stylesheet puts it.
   *
   * Nothing moves on a phone, while the panel fills the window, or on the chat page, because there the panel has no
   * corner to leave. A smaller window pulls the place back inside it and keeps it so, as it does the size.
   */
  const [place, setPlace] = useState<PanelPlace | null>(() => {
    const kept = rememberedPlace()
    return kept === null ? null : placeHeldInside(kept, sizeHeldInside(rememberedSize(), roomOnScreen()), roomOnScreen())
  })
  const moveFrom = useRef<{ x: number; y: number; from: PanelPlace } | null>(null)
  const stopFollowingThePress = useRef<(() => void) | null>(null)
  const sizeNow = useRef(size)
  sizeNow.current = size
  const placeNow = useRef(place)
  placeNow.current = place
  const mayMove = open && !onAPage && !narrow && !full
  useEffect(() => {
    if (!mayMove) stopFollowingThePress.current?.()
  }, [mayMove])
  useEffect(() => () => stopFollowingThePress.current?.(), [])

  /** Where the panel sits now, measured, so a move from the corner starts where the stylesheet drew it. */
  const placeOnScreen = (panel: Element): PanelPlace => {
    const at = panel.getBoundingClientRect()
    const room = roomOnScreen()
    return { right: room.width - at.right, bottom: room.height - at.bottom }
  }

  const startMoving = (x: number, y: number, row: Element): void => {
    const panel = row.closest('.px-chat')
    if (panel === null) return
    moveFrom.current = { x, y, from: placeNow.current ?? placeOnScreen(panel) }
    setDragging('move')
  }

  /**
   * A PRESS ON THE TOP ROW THAT TRAVELS MOVES THE PANEL AT ONCE, and one that does not travel stays a press. So a
   * press that starts on one of the row's buttons and goes nowhere is that button's, and a press that starts there
   * and is dragged moves the panel, and the button's click that would follow is dropped. The pointer is followed on
   * the window, so a quick drag that leaves the row is still followed.
   */
  const pressTheTopRow = (e: APointer<HTMLElement>): void => {
    if (!mayMove || e.button !== 0) return
    stopFollowingThePress.current?.()
    const row = e.currentTarget
    const { pointerId, clientX: x, clientY: y } = e
    // A PRESS ON NO BUTTON SELECTS NOTHING AND TAKES NO FOCUS, as before; a press on a button keeps both.
    if ((e.target as Element).closest('button') === null) e.preventDefault()
    let moved = false
    const follow = (ev: PointerEvent): void => {
      if (ev.pointerId !== pointerId) return
      if (!moved) {
        if (Math.hypot(ev.clientX - x, ev.clientY - y) < A_PRESS_BECOMES_A_MOVE_PX) return
        moved = true
        startMoving(x, y, row)
        if (row.isConnected) row.setPointerCapture(pointerId)
      }
      const from = moveFrom.current
      if (from === null) return
      // THE PANEL IS PLACED BY ITS RIGHT AND BOTTOM EDGES, so a pointer moved right or down takes from both.
      setPlace(
        placeHeldInside(
          { right: from.from.right - (ev.clientX - from.x), bottom: from.from.bottom - (ev.clientY - from.y) },
          sizeNow.current,
          roomOnScreen(),
        ),
      )
    }
    const dropTheClick = (ev: MouseEvent): void => {
      ev.preventDefault()
      ev.stopPropagation()
    }
    const letGo = (ev: PointerEvent): void => {
      if (ev.pointerId !== pointerId) return
      stop()
      if (!moved) return
      // THE CLICK THAT ENDS A MOVE IS NOT A PRESS. It comes in the same turn as the pointer's release, so it is
      // dropped until the next turn and no longer.
      window.addEventListener('click', dropTheClick, true)
      window.setTimeout(() => {
        window.removeEventListener('click', dropTheClick, true)
      }, 0)
    }
    const stop = (): void => {
      window.removeEventListener('pointermove', follow)
      window.removeEventListener('pointerup', letGo)
      window.removeEventListener('pointercancel', letGo)
      stopFollowingThePress.current = null
      if (moveFrom.current === null) return
      moveFrom.current = null
      setDragging(null)
    }
    window.addEventListener('pointermove', follow)
    window.addEventListener('pointerup', letGo)
    window.addEventListener('pointercancel', letGo)
    stopFollowingThePress.current = stop
  }

  // THE PLACE IS REMEMBERED, and the corner is remembered as nothing.
  useEffect(() => {
    if (onAPage) return
    writeStored(PLACE_KEY, place === null ? '' : `${String(place.right)}x${String(place.bottom)}`)
  }, [place, onAPage])

  const startDragging = (edge: Edge) => (e: APointer<HTMLElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragFrom.current = { edge, x: e.clientX, y: e.clientY, from: size }
    setDragging(edge)
  }

  const keepDragging = (e: APointer<HTMLElement>): void => {
    const held = dragFrom.current
    if (held === null) return
    // THE PANEL IS PINNED TO THE BOTTOM RIGHT, so dragging the left edge leftwards makes it wider
    // and dragging the top edge upwards makes it taller. Both are the drag distance subtracted.
    const width = held.edge === 'top' ? held.from.width : held.from.width + (held.x - e.clientX)
    const height = held.edge === 'left' ? held.from.height : held.from.height + (held.y - e.clientY)
    setSize(sizeHeldInside({ width, height }, roomOnScreen(), placeNow.current))
  }

  const stopDragging = (e: APointer<HTMLElement>): void => {
    if (dragFrom.current === null) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    dragFrom.current = null
    setDragging(null)
  }

  /**
   * THE SEAM IS DRAGGED TO CHANGE THE CHAT'S WIDTH, held inside what both halves need. A press on a
   * shape is the shape's press and never starts the drag, and the drag is read from where it began
   * so it cannot drift when the page's own width moves under it.
   */
  const startSeamDragging = (e: APointer<HTMLDivElement>): void => {
    if (!drawingTheSplit || !theSplitIsWide || e.button !== 0 || (e.target as Element).closest('button') !== null) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    seamFrom.current = { x: e.clientX, width: splitWidth }
    setSeamDragging(true)
  }

  const keepSeamDragging = (e: APointer<HTMLDivElement>): void => {
    const from = seamFrom.current
    if (from === null) return
    const moved = split.side === 'right' ? from.x - e.clientX : e.clientX - from.x
    keepTheWidth(from.width + moved, window.innerWidth)
  }

  const stopSeamDragging = (e: APointer<HTMLDivElement>): void => {
    if (seamFrom.current === null) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    seamFrom.current = null
    setSeamDragging(false)
  }

  /**
   * A DOUBLE-CLICK GIVES THE PAGE ITS READING WIDTH. The width is worked out from the two measured
   * widths rather than copied: the page is as wide as the window less the sidebar and the chat, so
   * the chat's new width is its old one plus what the page is over the reading width. That holds
   * whatever the window is and however wide the folded sidebar is.
   */
  const giveThePageItsReadingWidth = (): void => {
    if (!drawingTheSplit || !theSplitIsWide) return
    const page = document.querySelector<HTMLElement>('#main')
    if (page === null) return
    const style = getComputedStyle(page)
    const pageWidth = page.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    const probe = document.createElement('div')
    probe.style.cssText = 'position:absolute;visibility:hidden;width:var(--measure-read)'
    document.body.append(probe)
    const readingWidth = probe.getBoundingClientRect().width
    probe.remove()
    keepTheWidth(splitWidth + (pageWidth - readingWidth), window.innerWidth)
  }

  // WHAT WAS DRAGGED TO IS REMEMBERED. A browser that refuses storage still resizes; it just does
  // not remember, and `writeStored` says which of the two happened without throwing at the panel.
  useEffect(() => {
    if (onAPage) return
    writeStored(SIZE_KEY, `${String(size.width)}x${String(size.height)}`)
  }, [size, onAPage])

  // AND A WINDOW THAT GOT SMALLER TAKES THE PANEL WITH IT, so a size dragged on a wide monitor
  // cannot leave the handles off the screen on a narrow one. A moved panel is pulled back inside it too: its size is
  // held first, then its place by that size, so it is moved before it is shrunk.
  useEffect(() => {
    const fit = (): void => {
      const room = roomOnScreen()
      const sized = sizeHeldInside(sizeNow.current, room)
      const placed = placeNow.current === null ? null : placeHeldInside(placeNow.current, sized, room)
      setSize(sizeHeldInside(sized, room, placed))
      setPlace(placed)
    }
    window.addEventListener('resize', fit)
    return () => {
      window.removeEventListener('resize', fit)
    }
  }, [])

  /**
   * A READ THAT WAS ALREADY OUT WHEN AN EVENT MOVED ITS LIST IS MADE AGAIN.
   *
   * A read started before a write can answer after the event about that write was applied, and its
   * older answer would then replace the change. So each list read here is counted while it is out, an
   * event that moves a list with a read out marks it, and when that read answers it is made once more.
   * The second read started after the write, so its answer holds it.
   */
  const readsOut = useRef(new Map<ChatList, number>())
  const movedWhileOut = useRef(new Set<ChatList>())
  const readAgainAfter = useRef<(lists: ReadonlySet<ChatList>) => void>(() => undefined)
  const counted = useCallback(<T,>(list: ChatList, read: Promise<T>): Promise<T> => {
    readsOut.current.set(list, (readsOut.current.get(list) ?? 0) + 1)
    const settle = (): void => {
      const left = (readsOut.current.get(list) ?? 1) - 1
      if (left <= 0) readsOut.current.delete(list)
      else readsOut.current.set(list, left)
      if (left <= 0 && movedWhileOut.current.has(list)) {
        movedWhileOut.current.delete(list)
        readAgainAfter.current(new Set([list]))
      }
    }
    return read.then(
      (value) => {
        settle()
        return value
      },
      (err: unknown) => {
        settle()
        throw err
      },
    )
  }, [])

  /** Keep repeated requests for the expensive list together, and never start one in a hidden view. */
  const betweenReadIsMounted = useRef(false)
  const betweenRead = useRef({
    pendingFirst: false,
    pendingNext: false,
    refresh: null as { project: string | null; target: number; pages: AgentConversationPages | null } | null,
    inFlight: false,
    lastFinished: -Infinity,
    timer: null as ReturnType<typeof setTimeout> | null,
  })
  const readBetweenWhenReady = useCallback((which: 'first' | 'next' | 'resume' = 'first') => {
    const state = betweenRead.current
    if (which === 'first') state.pendingFirst = true
    if (which === 'next') state.pendingNext = true
    const read = (): void => {
      if (!betweenReadIsMounted.current || (!state.pendingFirst && !state.pendingNext && state.refresh === null) || state.inFlight || !openNow.current || listNow.current !== 'between' || document.visibilityState !== 'visible') return
      // Leave the server a gap even when the last read took longer than the interval.
      const wait = state.lastFinished + 5_000 - performance.now()
      if (wait > 0) {
        if (state.timer === null) state.timer = setTimeout(() => { state.timer = null; read() }, wait)
        return
      }
      const project = narrowing.current.project
      if (state.refresh !== null && state.refresh.project !== project) state.refresh = null
      if (state.refresh === null && state.pendingFirst) {
        const previous = betweenPages.current?.project === project ? betweenPages.current : null
        const target = Math.max(25, (previous?.reply.conversations.length ?? 0) + (state.pendingNext ? 25 : 0))
        state.pendingFirst = false
        state.pendingNext = false
        state.refresh = { project, target, pages: null }
      }
      const refresh = state.refresh
      const cursor = refresh !== null ? refresh.pages?.next ?? null : betweenPages.current?.project === project ? betweenPages.current.next : null
      if (refresh === null) {
        state.pendingNext = false
        if (cursor === null) { setBetweenLoadingMore(false); return }
      }
      // THE FIRST PAGE OF A TAB WITH NO ROWS GOES BEFORE THE CONTACT LIST: see `readTheContactListFromTheTop`.
      let firstPage: { answered: Promise<void>; letGo: () => void } | null = null
      if (cursor === null && betweenPages.current === null) {
        let answer = (): void => undefined
        const gate = {
          answered: new Promise<void>((resolve) => { answer = resolve }),
          letGo: () => { if (betweenFirstPageOut.current === gate) betweenFirstPageOut.current = null; answer() },
        }
        betweenFirstPageOut.current = firstPage = gate
        for (const asked of contactListReadsOut.current) asked.abort()
      }
      state.inFlight = true
      void counted('betweenAgents', stamped(api.agentConversationPage(project, cursor))).then(
        (pairs) => {
          if (!betweenReadIsMounted.current || narrowing.current.project !== project) return
          if (refresh !== null) {
            if (state.refresh !== refresh) return
            const pages = cursor === null
              ? firstBetweenAgentPage(project, pairs)
              : refresh.pages === null ? null : nextBetweenAgentPage(refresh.pages, project, cursor, pairs)
            if (pages === null) { state.refresh = null; return }
            refresh.pages = pages
            if (pages.reply.mayRead && pages.reply.conversations.length < refresh.target && pages.next !== null) return
            state.refresh = null
            betweenPages.current = pages
            setBetween(pages.reply)
            markFreshFrom([cacheName('betweenAgents')], pairs)
            return
          }
          const previous = betweenPages.current
          const pages = previous === null ? null : nextBetweenAgentPage(previous, project, cursor!, pairs)
          if (pages === null || pages === previous) return
          betweenPages.current = pages
          setBetween(pages.reply)
          markFreshFrom([cacheName('betweenAgents')], pairs)
        },
        (err: unknown) => {
          if (state.refresh === refresh) state.refresh = null
          if (betweenReadIsMounted.current) setFault(errorMessage(err))
        },
      ).finally(() => {
        firstPage?.letGo()
        state.inFlight = false
        state.lastFinished = performance.now()
        if (betweenReadIsMounted.current && !state.pendingNext && state.refresh === null) setBetweenLoadingMore(false)
        if (state.pendingFirst || state.pendingNext || state.refresh !== null) read()
      })
    }
    read()
  }, [counted])
  useEffect(() => {
    betweenReadIsMounted.current = true
    const shown = (): void => {
      if (document.visibilityState === 'visible' && (betweenRead.current.pendingFirst || betweenRead.current.pendingNext || betweenRead.current.refresh !== null)) readBetweenWhenReady('resume')
    }
    document.addEventListener('visibilitychange', shown)
    return () => {
      betweenReadIsMounted.current = false
      document.removeEventListener('visibilitychange', shown)
      if (betweenRead.current.timer !== null) clearTimeout(betweenRead.current.timer)
      betweenRead.current.timer = null
    }
  }, [readBetweenWhenReady])

  /**
   * `fresh` IS HOW A CALLER THAT HAS JUST CHANGED SOMETHING ASKS FOR NEW ANSWERS. The mount uses
   * the page's shared reads (`false`), so a fresh home load asks each door once. An event or a
   * write asks `.again()`, because the answer this page holds was read before the write. Concurrent
   * callers of `.again()` join one request, so a burst still costs one.
   */
  const readEverything = useCallback(async (fresh = true, onlyWhatChanged = false) => {
    // `onlyWhatChanged`: A DRAWING MADE AGAIN FROM WHAT THE LAST ONE HELD asks only for the lists an event
    // has marked changed since they were read (`EVENTS_KEEP_CURRENT`). Round 17 of wave 13w.
    //
    // AND THE NAMES, WHEN THIS DRAWING HOLDS NONE. Wave 13y round 159. The mark is the page's: it says the
    // names were read in this page's life, and not that this drawing holds them. When the names and the
    // list of projects answer in one turn, the chat page is drawn in the same render as the corner that
    // read the names, and it starts from what the corner kept before they came. It was told the names
    // were current, never read them, and its heading had no name to draw.
    const needs = (list: KeptList): boolean =>
      !onlyWhatChanged || !isFresh(cacheName(list)) || (list === 'participants' && held.current.who === null)
    // CLOSED, ONLY WHAT THE BUTTON DRAWS: the reader's own registry row, for the picture and for how the number
    // is drawn, and the number itself with who is reading. The registries are the page's shared read,
    // which the emergency and offer panels make on every page as well.
    if (!openNow.current) {
      try {
        const [registries, drawn] = await Promise.all([
          needs('participants') ? (fresh ? readTheParticipantsOnce.again() : readTheParticipantsOnce()) : null,
          needs('circle') ? (fresh ? readCircleOnce.again() : readCircleOnce()) : null,
        ])
        if (registries !== null) {
          setWho(registries)
          markFreshFrom([cacheName('participants')], registries)
        }
        if (drawn !== null) {
          setCircle(drawn)
          theReaderIs(drawn.me)
          markFreshFrom([cacheName('circle')], drawn)
        }
        setFault(null)
      } catch (err: unknown) {
        setFault(errorMessage(err))
      }
      return
    }
    try {
      // AND THE PROJECTS, because a conversation now spans them. Criterion M55: the contacts and
      // the messages are the person's, whichever project is open, so a message may have been
      // written in another one and the mark under it says which — by the project's NAME, which is
      // a fact only this list holds. Read here with the other five rather than per message.
      //
      // THE REGISTRIES, THE CONTACTS, THE GROUPS AND THE PROJECTS GO THROUGH THE SHARED READS
      // (src/web/lib/oneread.ts, re-exported by chatlists.ts), so the panels mounted on every page
      // ask once between them, and the frame and Home ask the same question of the same answer.
      // Each successful read can draw its list even when another door refuses its own read.
      const setFrom = <T,>(read: Promise<T> | null, set: (value: T) => void): Promise<void> =>
        read === null ? Promise.resolve() : read.then(set)
      if (listNow.current === 'between' && needs('betweenAgents')) readBetweenWhenReady()
      const answers = await Promise.allSettled([
        setFrom(needs('participants') ? (fresh ? readTheParticipantsOnce.again() : readTheParticipantsOnce()) : null, (registries) => {
          setWho(registries)
          markFreshFrom([cacheName('participants')], registries)
        }),
        readTheDotsDrawn('keep'),
        setFrom(needs('contacts') || needs('circle') ? readTheContactListFromTheTop() : null, holdTheContactList),
        setFrom(needs('groups') ? (fresh ? readGroupsOnce.again() : readGroupsOnce()) : null, (teams) => {
          setGroups(teams)
          markFreshFrom([cacheName('groups')], teams)
        }),
        setFrom(fresh ? readWorkspacesOnce.again() : readWorkspacesOnce(), (projects) => setProjects(projects.workspaces)),
      ])
      const refused = answers.filter((answer): answer is PromiseRejectedResult => answer.status === 'rejected')
      setFault(refused.length === 0 ? null : refused.map(({ reason }) => theShortReasonOf(reason) ?? errorMessage(reason)).join('\n'))
    } catch (err: unknown) {
      setFault(theShortReasonOf(err) ?? errorMessage(err))
    }
  }, [readBetweenWhenReady])

  /**
   * READ THE CONTACTS AGAIN, AND NOTHING ELSE.
   *
   * `readEverything` above asks five routes; arranging the list changes one of them. A press that
   * moved a contact and then re-read the presence of everybody would be four requests nobody asked
   * for, on a panel that redraws while somebody is dragging things around.
   */
  const readTheContacts = useCallback(async () => {
    try {
      holdTheContactList(await readTheContactListFromTheTop())
      setFault(null)
    } catch (err: unknown) {
      setFault(errorMessage(err))
    }
  }, [])

  /** Make a group from the Groups tab, with the person as its first member. Criterion M123. */
  const makeAGroup = useCallback(async () => {
    setGroupFault(null)
    try {
      const mine = contacts?.me
      await api.openAGroup(aGroupName, 'the person opened it from the chat', mine === undefined ? [] : [
        { who: { kind: mine.kind, id: mine.id }, because: 'they opened it' },
      ])
      setNamingAGroup(false)
      setAGroupName('')
      await readEverything()
    } catch (err: unknown) {
      setGroupFault(errorMessage(err))
    }
  }, [aGroupName, contacts, readEverything])

  const talkRequest = useRef(0)
  /** How many reads of a conversation are out now, so the beat never starts a second one. */
  const talkReadsOut = useRef(0)
  /**
   * WHEN THE READ THAT `talk` HOLDS WAS STARTED, by `Date.now()`. A timed-out send is said to be
   * missing only by a read started after the timeout. Problem KzLydNEm4HYX.
   */
  const talkReadStartedAt = useRef(0)
  /** The beat that reads the open conversation with an agent again. Problem msjrx1epgeBt. */
  const talkBeat = useRef<MachineReadClock | null>(null)
  const openTalk = useRef({key:talkingTo === null ? null : participantKey(talkingTo), project:destination})
  openTalk.current = {key:talkingTo === null ? null : participantKey(talkingTo), project:destination}
  useEffect(() => {
    contactSequence.current += 1
    setContactWait(null)
    return () => { contactSequence.current += 1 }
  }, [open, destination])
  /**
   * READ WHAT HAS BEEN SAID, WITHOUT TYING THIS CALLBACK TO THE PROJECT ON SCREEN. Problem sM59NEsuJa8g.
   *
   * THE DEFECT THIS CLOSES. This used to close over `destination` — the project a message would be
   * sent in, which is the project on screen unless the reader chose another — so choosing another
   * project gave this callback a new identity. The effect below watches the callback, so a project
   * switch made it run `setTalk(null)` and read the conversation again. The reader saw the open
   * conversation empty and come back, and a list they had scrolled up in was thrown to the bottom
   * by the empty frame in between. Switching project is not a reason to touch the open
   * conversation: the chat is the person's and holds what was said in every project (criterion
   * M55), so the conversation on screen stays exactly where it is, and nothing on it says the
   * conversation belongs to one project.
   *
   * WHAT REPLACES THE CLOSURE. The project is read from `openTalk` when the read is made, the same
   * ref the guard already reads. A read that starts after a project change asks about the project
   * the reader is now in, while a read already in flight is proved to belong to the conversation
   * and the project it was started for before it may draw anything.
   */
  const readTheTalk = useCallback(async (them: { kind: ParticipantKind; id: string }) => {
    const project = openTalk.current.project
    if (openTalk.current.key !== participantKey(them)) return
    const number = ++talkRequest.current
    const startedAt = Date.now()
    talkReadsOut.current += 1
    try {
      // WITH AN AGENT, ITS PRESENCE IS READ AT THE SAME TIME AND IN THE SAME PROJECT, and both are
      // stored together or neither is. The agent's status, which colours the dot and gives the personal
      // words and the work line, comes in the conversation's own answer, read at home in the same moment
      // as the Cannot reach notice (`talk.status`). The chat makes no status read of its own, so no
      // status answer can land apart from the notice it is drawn beside (wave 13y round 115).
      //
      // ONLY ONE PAGE IS ASKED FOR: the newest page on a first entry, and afterwards only what came after
      // the newest message held, with what changed among the held ones (src/web/lib/conversationpages.ts).
      const before = heldConversation(participantKey(them))
      const [value, theirs] = await Promise.all([
        api.conversationWith(them.kind, them.id, project, whatToAskFor(before)),
        them.kind === 'agent' && !isMoleOffice(them) ? api.presenceOfOne(them.kind, them.id, project) : Promise.resolve(null),
      ])
      const stillThisRead = (): boolean =>
        number === talkRequest.current && openTalk.current.key === participantKey(them) && openTalk.current.project === project
      if (!stillThisRead()) return
      // A MESSAGE THAT JOINED AMONG THE HELD ONES IS DRAWN BY READING THE NEWEST PAGE AGAIN, in this same
      // read, because what was held has no place for it (`aMessageJoinedTheHeldOnes`). Wave 13y round 145.
      const held = heldConversation(participantKey(them))
      const newest = aMessageJoinedTheHeldOnes(held, value) ? await api.conversationWith(them.kind, them.id, project, whatToAskFor(null)) : null
      if (!stillThisRead()) return
      talkReadStartedAt.current = startedAt
      const next = newest === null ? afterANewerRead(held, value) : afterANewerRead(null, newest)
      holdConversation(participantKey(them), next)
      setTalk(next.reply)
      setTalkPresence(theirs === null ? null : theirs.presence)
      setFault(null)
      setTalkUnread(null)
    } catch (err: unknown) {
      if (number !== talkRequest.current || openTalk.current.key !== participantKey(them) || openTalk.current.project !== project) return
      // A REFUSAL WITH A SHORT REASON AND NO CODE IS SAID BY ITS REASON (wave 13y round 93).
      const reason = theShortReasonOf(err)
      setTalkUnread({ key: participantKey(them), why: errorMessage(err), reason })
      setFault(reason ?? errorMessage(err))
    } finally {
      // THE BEAT COUNTS FROM HERE, whichever read this was: a press, an event, a focus or the beat.
      talkReadsOut.current -= 1
      talkBeat.current?.settled()
    }
  }, [])



  useEffect(() => {
    // THE MOUNT USES THE SHARED READS, so a fresh page asks each door once however many panels are
    // mounted and however many times StrictMode runs this effect.
    //
    // A DRAWING THAT STARTED FROM WHAT THE LAST ONE HELD ASKS AFRESH. It is already showing what the
    // last drawing showed, and the shared reads may be older than that, because an event or a read
    // made while a panel was open changes what that drawing holds and not what every shared read
    // holds. Problem KyrGDY7xY6fG.
    //
    // THIS IS ALSO WHAT TELLS THE CORNER BUTTON THAT A CONVERSATION WAS READ. Problem Dh8uuCXTay1x,
    // measured on 27 September 2026 with tests/opening-a-conversation-clears-its-unread-dot.test.ts:
    // a conversation opened on the chat page cleared the dots on the page, but back on Home the
    // closed corner drew "1" again. The page's panel is open, so after marking the message seen it
    // read the contact list again, and not the circle's own read (`readCircleOnce`). The corner,
    // made again on Home, asked that shared read and got its answer from before the conversation
    // was opened. Now the corner starts from the page's count and asks the circle afresh.
    //
    // AND ONLY WHAT AN EVENT HAS CHANGED SINCE IT WAS READ, round 17 of wave 13w: a list read in this
    // page's life that no event has named since is current, because events change it where it is held.
    // A drawing started from what was kept before a reload has nothing fresh and asks for everything.
    void readEverything(kept !== null, kept !== null)
  }, [readEverything, kept])

  // NOTHING IS READ AGAIN WHEN THE READER COMES BACK TO THE TAB, FOCUSES THE WINDOW OR MOVES TO ANOTHER
  // PAGE, since 26 September 2026. A hidden tab keeps the stream and is handed
  // what it missed, in order, when it is shown (src/web/lib/channel.ts), and events now carry the
  // change, so what this panel holds is as current as the events. A change of page changes no list:
  // the chat is the person's across pages and projects.
  //
  // WHAT IS READ AGAIN IS EVERYTHING, ONCE, WHEN EVENTS WERE LOST: the server said it had forgotten
  // some, the server restarted, or a tab hidden for a long time was handed more than it keeps. And the
  // lists a setting this panel draws depends on, when that setting has just been changed (criterion
  // M32, `readTheChatAgain` above).
  //
  // WHO IS ANSWERING AS AN AGENT IS THE ONE EXCEPTION. Since wave 13w round 26 a write that changes it announces
  // `answering.changed`, but a change from time alone does not: a hold that went quiet, a wait that ran out. The server
  // looks for those once a minute (src/server/lib/answering-told.ts). So while a conversation with an agent is open it
  // is read again when the page is shown again and when the window regains focus, which draws such a change at once
  // for a reader who has just come back. Nothing else is read on those.
  useEffect(() => {
    const theOpenAgent = (): void => {
      // A CLOSED PANEL DRAWS NO CONVERSATION, so it reads none. Opening it reads it (see below).
      if (document.visibilityState === 'visible' && talkingTo !== null && talkingTo.kind === 'agent' && openNow.current) {
        void readTheTalk(talkingTo)
      }
    }
    document.addEventListener('visibilitychange', theOpenAgent)
    window.addEventListener('focus', theOpenAgent)
    return () => {
      document.removeEventListener('visibilitychange', theOpenAgent)
      window.removeEventListener('focus', theOpenAgent)
    }
  }, [readTheTalk, talkingTo])

  const theOpenOneForTheLoss = useRef<(() => Promise<unknown>) | null>(null)
  useEffect(() => {
    const now = (): void => {
      void readEverything()
    }
    window.addEventListener(READ_AGAIN, now)
    const stopListening = whenEventsWereLost(() => {
      // WHAT WAS KEPT OF EACH CONVERSATION MAY HAVE MISSED A CHANGE, so it is read afresh, a page at a time.
      forgetEveryConversation()
      void readEverything()
      const open = theOpenOneForTheLoss.current
      if (open !== null) void open()
    })
    return () => {
      window.removeEventListener(READ_AGAIN, now)
      stopListening()
    }
  }, [readEverything])

  /**
   * AND AT A BEAT, WHILE A CONVERSATION WITH AN AGENT IS OPEN THAT WAS READ IN ANOTHER PROJECT. Problem msjrx1epgeBt.
   *
   * In the project the page watches, `answering.changed` says when the agent starts or stops answering, and the beat
   * asks nothing (`THE_TALKS_BEAT_MS` above says why it is kept for another project). The clock is the one this app
   * uses for an automatic read (src/web/lib/oneclock.ts): thirty seconds after the last read of the conversation
   * settled, only while the page is visible, and never while a read is out. `readTheTalk` reads the agent's presence
   * in the same read, so the dot and the banner change together. Task gVBpHNHP8oEP.
   */
  useEffect(() => {
    // ONLY WHILE THE PANEL IS OPEN, because only then is the conversation drawn.
    if (!open) return
    if (talkingTo === null || talkingTo.kind !== 'agent') return
    const them = talkingTo
    const beat = aMachineReadClock({
      everyMs: THE_TALKS_BEAT_MS,
      inFlight: () => talkReadsOut.current > 0,
      read: () => {
        if (openTalk.current.project !== currentWorkspace()) void readTheTalk(them)
        else beat.settled()
      },
    })
    talkBeat.current = beat
    beat.arm()
    return () => {
      if (talkBeat.current === beat) talkBeat.current = null
      beat.stop()
    }
  }, [open, talkingTo, readTheTalk])

  /**
   * WHETHER THE PRESS TO START A NEW AGENT WOULD CARRY ANYTHING FOR THE OPEN AGENT. Problem hqbovBMnTu-z.
   *
   * Asked only while nobody is answering as that agent, which is when the Cannot reach line is drawn.
   * The server answers with the press's own reading. It is asked again when a message to the agent, or
   * a mark or sentence on its row, changes, which is what can change the answer. Null until it is
   * answered, or when the read failed; the press is then drawn as before, and pressing it says when
   * nothing is waiting.
   */
  const [pressWouldCarry, setPressWouldCarry] = useState<{ key: string; carries: boolean } | null>(null)
  const nobodyAnswers = talkingTo !== null && !isMoleOffice(talkingTo) && talkingTo.kind === 'agent' && talk?.answering?.how === 'nobody'
  const whatThePressReads =
    !nobodyAnswers || talk === null || talkingTo === null
      ? null
      : JSON.stringify(talk.messages.map((one) => [one.id, one.deliveries.filter((row) => sameParticipant(row.to, talkingTo)).map((row) => [row.mark, row.because])]))
  useEffect(() => {
    if (whatThePressReads === null || talkingTo === null) return
    const key = participantKey(talkingTo)
    let current = true
    api.wouldThePressCarry(talkingTo.id, destination).then(
      (reply) => {
        if (current) setPressWouldCarry({ key, carries: reply.wouldCarry })
      },
      () => {
        if (current) setPressWouldCarry(null)
      },
    )
    return () => {
      current = false
    }
  }, [whatThePressReads, talkingTo, destination])

  /**
   * A DIFFERENT CONVERSATION EMPTIES THE LIST; A DIFFERENT PROJECT DOES NOT.
   *
   * `readTheTalk` is stable now (see above), so this effect runs when the reader OPENS another
   * conversation and never merely because the project changed. That is what keeps a project switch
   * from refreshing the chat: the list is not emptied, so its scroll and the open conversation stay
   * where they were. Moving from one contact to another still empties it first, because the first
   * one's messages must never be drawn under the second one's name, not even for a frame.
   */
  useEffect(() => {
    // THE CONVERSATION IN HAND IS KEPT WHEN IT IS ALREADY THIS CONTACT'S, which is the case only when
    // this drawing started from what the last one held (see `kept`). It is read again below and
    // replaced quietly. Problem KyrGDY7xY6fG.
    const inHand = held.current.talk
    if (inHand === null || talkingTo === null || participantKey(inHand.them) !== participantKey(talkingTo)) {
      // A CONVERSATION READ BEFORE IS DRAWN AT ONCE from what was kept, and only what is newer is asked
      // for below. One never read starts empty. Problem 8_cP0E-745e5.
      setTalk(talkingTo === null ? null : (heldConversation(participantKey(talkingTo))?.reply ?? null))
      setTalkPresence(null)
    } else if (heldConversation(participantKey(inHand.them)) === null) {
      // AND IT IS HELD AS THE READS THAT MADE IT LEFT IT, so the read below asks only for what came after
      // its newest message and adds that to the rows on screen. Read as a first entry, the newest page
      // would replace those rows, and a reader who had scrolled up into them would be put back at the
      // bottom.
      holdConversation(participantKey(inHand.them), afterANewerRead(null, inHand))
    }
    if (talkingTo === null) {
      talkRequest.current++
      return
    }
    if (preparedContact.current === participantKey(talkingTo)) {
      preparedContact.current = null
      return
    }
    // A CLOSED PANEL READS IT WHEN IT OPENS, not now: the conversation it remembers is not drawn.
    if (openNow.current) void readTheTalk(talkingTo)
    return () => { talkRequest.current++ }
  }, [talkingTo, readTheTalk])

  /**
   * A CHANGE OF PROJECT READS THE PROJECT'S OWN LIST AGAIN, IN PLACE. Problem sM59NEsuJa8g.
   *
   * The contact rows are read for the project on screen, so a reader who moves must be shown the
   * new project's answer. Before criterion M61 the whole shell was thrown away and every read
   * happened again; the panel stays mounted now, so the read is asked for here. It is asked IN
   * PLACE: the rows already drawn are left on screen until the new answer arrives, and the open
   * conversation, its scroll and the draft are not touched, because none of them belongs to the
   * project — see `readTheTalk` above.
   *
   * IT ASKS FOR THE CONTACT LIST ALONE, and not `readEverything`. That function also reads the
   * registries and the list of projects, which are the installation's and not one project's
   * (`src/web/lib/oneread.ts`), so a project change is not a reason to ask for them again.
   * `tests/workspace-switch.test.ts` holds the list of projects open across a switch to prove it is
   * not asked for.
   */
  const readFor = useRef(here)
  useEffect(() => {
    if (readFor.current === here) return
    readFor.current = here
    // A CLOSED PANEL DRAWS NO CONTACT ROWS. The circle counts every project, so a project change does
    // not move it, and opening the panel reads the rows.
    if (!openNow.current) return
    void readTheContacts()
    // AND THE DOTS DRAWN, WHICH ARE ONE PROJECT'S. A dot is worked out in the project the page
    // is reading (a run of an agent in one project makes it green there and not in another), so the
    // list read for the project the page left is not the answer for the one it is in. Until events
    // carried the change, the stream reopened for the new project announced every page opening and
    // the panel read the presence on that; since 26 September 2026 nothing is announced when nothing
    // changed, so the move itself reads it. Problem found on 26 September 2026: the secretaries' dots
    // hollow in Default's reading while the page had moved to another project, where the door said
    // one of the secretaries was green.
    void readTheDotsDrawn('forget').catch((err: unknown) => {
      setFault(errorMessage(err))
    })
  }, [here, readTheContacts])

  const unregisteredOpen = withUnregistered === null ? null : unregisteredKey(withUnregistered)
  const readTheUnregistered = useCallback(async () => {
    const asked = withUnregistered
    if (asked === null) {
      setFromUnregistered(null)
      return
    }
    void api
      .messagesFromUnregistered(unregisteredKey(asked))
      .then(setFromUnregistered)
      .catch((err: unknown) => {
        setFault(errorMessage(err))
      })
  }, [withUnregistered])
  useEffect(() => {
    if (unregisteredOpen === null) {
      setFromUnregistered(null)
      return
    }
    void readTheUnregistered()
  }, [unregisteredOpen, readTheUnregistered])

  const readTheGroup = useCallback(async (id: string) => {
    try {
      setTheGroup(await api.oneGroup(id))
      setFault(null)
    } catch (err: unknown) {
      setFault(errorMessage(err))
    }
  }, [])

  useEffect(() => {
    if (inTheGroup === null) {
      setTheGroup(null)
      return
    }
    // A CLOSED PANEL DRAWS NO GROUP. Opening it reads the contact list, which runs this again.
    if (!openNow.current) return
    void readTheGroup(inTheGroup)
  }, [inTheGroup, readTheGroup, contacts])

  /**
   * OPENING THE PANEL READS WHAT IT DRAWS. It follows option 2 of a decision.
   *
   * While it was closed it read only the circle, so on opening it reads every list and the
   * conversation it has open. The mount has already read for the state the panel started in, so this
   * acts only when `open` changes. An open group is read by the effect above when the contact list
   * lands; a conversation with a contact and one with a writer nobody registered are read here.
   * Closing reads nothing: the circle keeps the number the contact list last gave it.
   */
  const openBefore = useRef(open)
  useEffect(() => {
    if (openBefore.current === open) return
    openBefore.current = open
    if (!open) return
    void readEverything()
    if (talkingTo !== null) void readTheTalk(talkingTo)
    else if (withUnregistered !== null) void readTheUnregistered()
  }, [open, readEverything, readTheTalk, readTheUnregistered, talkingTo, withUnregistered])

  // Read on opening the tab, and resume a read deferred while this view was hidden.
  useEffect(() => {
    if (!open || list !== 'between') {
      // A contact-list read waiting for this tab's first page goes at once when the tab is left or the panel closes.
      betweenFirstPageOut.current?.letGo()
      return
    }
    if (betweenProjectAsked.current !== shownProject) {
      betweenProjectAsked.current = shownProject
      betweenPages.current = null
      betweenRead.current.pendingNext = false
      betweenRead.current.refresh = null
      setBetween(null)
      readBetweenWhenReady()
    } else if (betweenRead.current.pendingFirst || betweenRead.current.pendingNext || betweenRead.current.refresh !== null) readBetweenWhenReady('resume')
    else if (!betweenRead.current.inFlight && (between === null || !isFresh(cacheName('betweenAgents')))) readBetweenWhenReady()
  }, [open, list, between, shownProject, readBetweenWhenReady])

// WHAT ARRIVES ON THE CHANNEL, rather than asking again on a timer.
  //
  // AN EVENT CARRIES THE CHANGE AND IS APPLIED TO WHAT THIS PANEL HOLDS (`applyAnEvent` in
  // src/web/lib/chatdeltas.ts, since 26 September 2026). A list is read only when an event cannot be
  // applied to it; `listsAnEventChanges` in chatlists.ts still says which lists such an event could
  // change, and the reads of one burst are gathered into one read a quarter of a second later
  // (`useAfterTheBurst`). `Forced` and `Leading` skip a message that cannot enter their pool and read
  // the same doors through the same shared reads.
  //
  // A WRONG CHANGE HERE IS SILENT — a count that never falls and no red says so. That is why
  // tests/applied-events-equal-a-fresh-read.test.ts applies real events to real lists and compares
  // them with a fresh read, and why the not-known-yet case reads rather than applies: the page is
  // still opening, so nobody can say who is reading.
  const meHere = useRef<{ kind: ParticipantKind; id: string } | null>(null)
  meHere.current = contacts?.me ?? circle?.me ?? null
  const theOpenOne = useRef<TheOpenOne>(null)
  theOpenOne.current =
    talkingTo !== null
      ? { what: 'contact', them: talkingTo }
      : inTheGroup !== null
        ? { what: 'group', id: inTheGroup }
        : withUnregistered !== null
          ? { what: 'unregistered' }
          : null

  /**
   * THE NEXT PAGE OF THE CONTACT LIST, when the end of the rows drawn is scrolled into view.
   * It starts after the rows held, under the narrowing they were read with, and nothing is asked while
   * the narrowing has changed and its read is still on the way, or while one page is already being read.
   */
  const readingTheNextContacts = useRef(false)
  const readTheNextContacts = useCallback(() => {
    const now = held.current.contacts
    if (now === null || now.left === 0 || readingTheNextContacts.current || !readUnder(now, narrowing.current)) return
    readingTheNextContacts.current = true
    const { name, project } = narrowing.current
    void counted('contacts', stamped(api.contactList({ offset: theRowsOnTopHeld(now), name, project })))
      .then(
        (page) => {
          const still = held.current.contacts
          if (still === null || !readUnder(page, narrowing.current) || !readUnder(still, narrowing.current)) return
          setContacts(withTheNextPage(still, page))
          setFault(null)
        },
        (err: unknown) => {
          setFault(errorMessage(err))
        },
      )
      .finally(() => {
        readingTheNextContacts.current = false
      })
  }, [counted])

  /**
   * THE LIST READ AGAIN FROM ITS FIRST ROW WHEN WHAT NARROWS IT CHANGES: the words asked of the filter box, or the
   * project chosen above the list. A closed panel holds no list and reads none. A list kept from the last drawing under
   * another narrowing is read again the same way.
   */
  useEffect(() => {
    if (!open || contacts === null || readUnder(contacts, { name: wordsAsked, project: shownProject })) return
    void readTheContacts()
  }, [open, contacts, wordsAsked, shownProject, readTheContacts])

  const readTheLists = useCallback(
    (lists: ReadonlySet<ChatList>) => {
      // CLOSED, THE CIRCLE IS THE ONLY THING DRAWN. It is added up from the contact rows and the
      // groups, so it is read when an event may have moved either, and the reader's own row when the
      // registries moved. Nothing else is read until the panel opens.
      if (!openNow.current) {
        if (lists.has('participants')) {
          void readTheParticipantsOnce.again().then((registries) => {
            setWho(registries)
            markFreshFrom([cacheName('participants')], registries)
          }, (err: unknown) => {
            setFault(errorMessage(err))
          })
        }
        if (lists.has('contacts') || lists.has('groups')) {
          void counted('contacts', readCircleOnce.again()).then(
            (drawn) => {
              setCircle(drawn)
              markFreshFrom([cacheName('circle')], drawn)
              theReaderIs(drawn.me)
              setFault(null)
            },
            (err: unknown) => {
              setFault(errorMessage(err))
            },
          )
        }
        return
      }
      const reads: Promise<unknown>[] = []
      try {
        if (lists.has('participants')) {
          reads.push(counted('participants', readTheParticipantsOnce.again()).then((registries) => {
            setWho(registries)
            markFreshFrom([cacheName('participants')], registries)
          }))
        }
        if (lists.has('presence')) {
          reads.push(counted('presence', readTheDotsDrawn('keep')))
        }
        // THE CONTACTS AND THE GROUPS ARE ASKED AFRESH, NOT THROUGH THE SHARED READ. Until wave 13y round
        // 80 `.again()` joined any read already on its way, and a read that started before the write this
        // event is about answered with the rows from before it. It joins only a read begun after the last
        // change marked now (oneread.ts), and these two still ask for themselves.
        if (lists.has('contacts')) {
          reads.push(counted('contacts', readTheContactListFromTheTop()).then(holdTheContactList))
        }
        // NOT WHILE ITS TAB IS CLOSED. The event has marked it stale, and pressing the tab reads it then.
        if (lists.has('betweenAgents') && listNow.current === 'between') {
          readBetweenWhenReady()
        }
        if (lists.has('groups')) {
          reads.push(counted('groups', stamped(api.groupsForThePage())).then((teams) => {
            setGroups(teams)
            markFreshFrom([cacheName('groups')], teams)
          }))
        }
        // A DOT CHANGED, AND THE OPEN AGENT'S DOT IS READ WITH ITS CONVERSATION (see `talkPresence`),
        // so the conversation is read too, and the header's dot and its notice change together.
        const open = theOpenOne.current
        const theOpenAgentsDot = lists.has('presence') && open?.what === 'contact' && open.them.kind === 'agent'
        if (lists.has('theOpenConversation') || theOpenAgentsDot) {
          if (open === null) {
            // Nothing is open: the counts above are the whole of what an event can move.
          } else if (open.what === 'contact') {
            reads.push(counted('theOpenConversation', readTheTalk(open.them)))
          } else if (open.what === 'group') {
            reads.push(counted('theOpenConversation', readTheGroup(open.id)))
          } else {
            reads.push(counted('theOpenConversation', readTheUnregistered()))
          }
        }
      } catch (err: unknown) {
        setFault(errorMessage(err))
        return
      }
      void Promise.all(reads).then(
        () => {
          setFault(null)
        },
        (err: unknown) => {
          setFault(errorMessage(err))
        },
      )
    },
    [readTheTalk, readTheGroup, readTheUnregistered, counted, readBetweenWhenReady],
  )

  const readAfterTheBurst = useAfterTheBurst(readTheLists)
  readAgainAfter.current = readAfterTheBurst

  useEffect(() => {
    const tagsChanged = () => readAfterTheBurst(new Set<ChatList>(['contacts']))
    window.addEventListener(PERSONAL_AGENT_TAGS_CHANGED, tagsChanged)
    return () => window.removeEventListener(PERSONAL_AGENT_TAGS_CHANGED, tagsChanged)
  }, [readAfterTheBurst])

  /**
   * THE OPEN CONVERSATION BETWEEN TWO AGENTS, READ AGAIN WHEN A MESSAGE IN IT ARRIVES. It answers
   * problem 0g-GBzZAkfEk. While the reader has such a conversation open, its new messages appear without
   * a reload, in the corner and on the chat page alike.
   *
   * It is read through the same door that opened it, from the same side, so the answer is the one a
   * reload would draw, and that read records that the reader has seen it, as opening it does. The between-
   * agents list is read after it, so the grey count for this conversation falls with it. An answer
   * for a conversation or a side the reader has since left is dropped.
   */
  const readingNow = useRef(reading)
  readingNow.current = reading
  const refusedNow = useRef(pairRefused)
  refusedNow.current = pairRefused
  const readTheOpenPairAgain = useCallback((): Promise<void> => {
    const was = readingNow.current
    if (was === null || !openNow.current) return Promise.resolve()
    // A PAIR WHOSE READ WAS REFUSED IS NOT READ AGAIN. The panel holds nothing of it to bring up to date and says the
    // reason once, and the press back leads to a fresh read (wave 13y round 95, item 26).
    if (refusedNow.current?.reading === was) return Promise.resolve()
    const held = asSideNow.current
    const newest = held?.messages.at(-1)
    const oldest = held?.messages[0]
    const asked = newest !== undefined && oldest !== undefined && held?.page != null
      ? { limit: 50, after: newest.id, since: held.page.readAt, ...(held.page.olderRemain ? { from: oldest.id } : {}) }
      : { limit: 50 }
    return api.conversationBetween(was.pair, was.asSide, asked).then(
      (said) => {
        const now = readingNow.current
        if (now === null || now.pair !== was.pair || now.asSide !== was.asSide) return
        setAsSide((previous) => {
          if (previous === null || said.page?.continuesFromTheCursor !== true) return said
          const gone = new Set(said.page.gone)
          const changed = new Map(said.page.changed.map((one) => [one.id, one]))
          const kept = previous.messages.filter((one) => !gone.has(one.id)).map((one) => changed.get(one.id) ?? one)
          const there = new Set(kept.map((one) => one.id))
          return {
            ...said,
            readBefore: previous.readBefore,
            messages: [...kept, ...said.messages.filter((one) => !there.has(one.id))],
            page: { ...said.page, olderRemain: previous.page?.olderRemain ?? false },
          }
        })
        readAfterTheBurst(new Set<ChatList>(['betweenAgents']))
      },
      (err: unknown) => {
        // A FAILURE FOR A CONVERSATION OR A SIDE THE READER HAS SINCE LEFT IS DROPPED as well, or it is drawn as a notice
        // over the conversation open now (wave 13y round 129, item 67).
        const now = readingNow.current
        if (now === null || now.pair !== was.pair || now.asSide !== was.asSide) return
        setFault(theShortReasonOf(err) ?? errorMessage(err))
      },
    )
  }, [readAfterTheBurst])

  /**
   * WHAT THE PANEL HOLDS, for the handler below, which applies an event to it rather than reading the
   * lists again. It is moved at the same moment as the state, so a second event handled before the
   * next render starts from what the first one made and not from the lists before it.
   */
  // THE OPEN CONVERSATION, READ AGAIN WHEN EVENTS WERE LOST. Set here, beside the reads it names.
  theOpenOneForTheLoss.current = () => {
    const open = theOpenOne.current
    // A CONVERSATION BETWEEN TWO AGENTS may have missed a message too. Problem 0g-GBzZAkfEk.
    const thePair = readTheOpenPairAgain()
    // A CLOSED PANEL READS ITS CONVERSATION WHEN IT OPENS (draw's rule), not now.
    if (open === null || !openNow.current) return thePair
    if (open.what === 'contact') return Promise.all([thePair, readTheTalk(open.them)])
    if (open.what === 'group') return Promise.all([thePair, readTheGroup(open.id)])
    return Promise.all([thePair, readTheUnregistered()])
  }

  /**
   * AN EVENT IS APPLIED TO WHAT THE PANEL HOLDS (src/web/lib/chatdeltas.ts), and only what it cannot be
   * applied to is read, coalesced into one read per burst.
   *
   * THE READER NOT KNOWN YET. Until this panel's first contacts read answers, nobody can say who is
   * reading, and nothing can be applied for them: `applyAnEvent` then asks for what the event could
   * change, and the lists that are about the reader, exactly as the handler did before events carried
   * anything.
   *
   * THE LISTS ARE NOT DRAWN HERE. `applyTheEvents` below draws once for every event it applies.
   */
  const applyOneEvent = useCallback(
    (event: ChannelEvent) => {
      const me = whoIsReading() === 'notKnownYet' ? null : meHere.current
      const applied = applyAnEvent(held.current, event, me, theOpenOne.current, {
        project: currentWorkspace(),
        talkProject: openTalk.current.project,
        panelOpen: openNow.current,
      })
      held.current = applied.held
      for (const list of applied.touched) if (readsOut.current.has(list)) movedWhileOut.current.add(list)
      if (applied.reads.size > 0) readAfterTheBurst(applied.reads)
      // AN OPEN PANEL HAS JUST BROUGHT UP TO DATE WHAT IT DID NOT HAVE TO READ: those lists stay current
      // in the page cache. A closed panel holds no lists to change, so what it was handed stays marked.
      if (openNow.current) {
        const readsNames = new Set([...applied.reads].map((one) => `chat.${one}`))
        if (applied.reads.has('contacts') || applied.reads.has('groups')) readsNames.add(cacheName('circle'))
        markFresh(markedByTheLastEvent.filter((one) => !readsNames.has(one)))
      }
      // A PARTICIPANT THIS PAGE HAS NEVER SEEN is read by itself, not the whole registry. The door for
      // one answers 404 for an id nobody holds; the registry is then read, which says the same.
      for (const one of applied.readParticipants) {
        void moleOfficeRequest<{ participant: ParticipantOnTheWire }>(
          ['/api/participants', encodeURIComponent(one.kind), encodeURIComponent(one.id)].join('/'),
        ).then(
          (answer) => {
            const names = held.current.who
            if (names === null) return
            const next = namesWithOne(names, answer.participant)
            held.current = { ...held.current, who: next }
            setWho(next)
          },
          () => {
            readAfterTheBurst(new Set<ChatList>(['participants']))
          },
        )
      }
      // A PRESENCE THE EVENT DID NOT CARRY is read for that one participant.
      for (const one of applied.readPresenceOf) {
        void api.presenceOfOne(one.kind, one.id).then(
          (answer) => {
            // READ FOR ANOTHER PROJECT than the one on screen now: not this page's dot any more.
            if ((answer as { workspaceId?: string }).workspaceId !== undefined && (answer as { workspaceId?: string }).workspaceId !== currentWorkspace()) return
            const list = held.current.presence ?? []
            const next = presenceWithOne(list, answer.presence)
            held.current = { ...held.current, presence: next }
            setPresence(next)
            // A DOT THAT MOVES A CONTACT ROW reads the contacts again, as `applyAnEvent` does for a dot an event carried.
            if (aDotMovesAContactRow(held.current.contacts, answer.presence)) readAfterTheBurst(new Set<ChatList>(['contacts']))
            const open = theOpenOne.current
            if (open !== null && open.what === 'contact' && open.them.kind === one.kind && open.them.id === one.id) {
              readAfterTheBurst(new Set<ChatList>(['theOpenConversation']))
            }
          },
          (err: unknown) => {
            setFault(errorMessage(err))
          },
        )
      }
      // A MESSAGE TO THIS READER ADDED TO THE OPEN CONVERSATION has reached them, which is what reading
      // the conversation used to record. It is recorded the same way, through the mark door.
      for (const id of applied.markDelivered) {
        void api.markMessage(id, 'delivered').catch((err: unknown) => {
          setFault(errorMessage(err))
        })
      }
      // A NEW MESSAGE IN THE OPEN CONVERSATION BETWEEN TWO AGENTS. The server names every such
      // conversation the message is in (`agentPairs`). When it could not say (`lists` null or absent),
      // the conversation is read, the way every other list is read when an event cannot be applied.
      const pairOpen = readingNow.current
      if (event.name === 'message.new' && pairOpen !== null) {
        const inIt =
          event.lists === null || event.lists === undefined
            ? true
            : event.lists.agentPairs.some((between) => thePairKey(between) === pairOpen.pair)
        if (inIt) void readTheOpenPairAgain()
      }
    },
    [readAfterTheBurst, readTheTalk, readTheGroup, readTheUnregistered, readTheOpenPairAgain],
  )
  /** THE EVENTS APPLIED IN THE ORDER THEY CAME, and every list they moved drawn, in one task and so in one drawing. */
  const applyTheEvents = useCallback(
    (events: readonly ChannelEvent[]) => {
      if (events.length === 0) return
      const before = held.current
      for (const event of events) applyOneEvent(event)
      const after = held.current
      if (after.circle !== before.circle) setCircle(after.circle)
      if (after.who !== before.who) setWho(after.who)
      if (after.presence !== before.presence && after.presence !== null) setPresence(after.presence)
      if (after.contacts !== before.contacts) setContacts(after.contacts)
      if (after.between !== before.between) setBetween(after.between)
      if (after.groups !== before.groups) setGroups(after.groups)
      if (after.talk !== before.talk) setTalk(after.talk)
      if (after.talkPresence !== before.talkPresence) setTalkPresence(after.talkPresence)
      if (after.theGroup !== before.theGroup) setTheGroup(after.theGroup)
      if (after.unregistered !== before.unregistered) setFromUnregistered(after.unregistered)
    },
    [applyOneEvent],
  )
  /** The panel stops waiting for these seen marks, and once it waits for none the events that came back are drawn. */
  const stopWaitingFor = (ids: Iterable<string>): void => {
    for (const id of ids) seenMarksOut.current.delete(id)
    if (seenMarksOut.current.size === 0) applyTheEvents(seenMarksBack.current.splice(0))
  }
  const heard = useCallback(
    (event: ChannelEvent) => {
      const me = whoIsReading() === 'notKnownYet' ? null : meHere.current
      const ownSeenMark =
        event.name === 'delivery.changed' &&
        event.mark === 'seen' &&
        me !== null &&
        sameParticipant(event.to, me) &&
        event.messageIds.length > 0 &&
        event.messageIds.every((id) => seenMarksOut.current.has(id))
      if (ownSeenMark) {
        seenMarksBack.current.push(event)
        stopWaitingFor(event.messageIds)
        return
      }
      applyTheEvents([...seenMarksBack.current.splice(0), event])
    },
    [applyTheEvents],
  )
  // THE EVENTS THIS PANEL DRAWS. A tab is handed only the events one of its panels draws.
  const channel = useChannel(heard, CHAT_DRAWS)

  /**
   * THE CHAT'S OWN NOTICES, DRAWN AS BANNERS AT THE TOP OF THE PANEL.
   *
   * A decision, taken on a message, says every notice the chat shows about its own state is a
   * banner at the top, the way the cannot-reach notice is, and nothing is drawn under the composer
   * that changes where the composer sits. The
   * words and the condition each one is drawn under are unchanged; only the place moved. A notice
   * is keyed by what it is about, not by its sentence, so a fault whose words change keeps its
   * place and a notice that goes and comes back counts as new.
   */
  const notices = useMemo(() => {
    const held: { key: string; text: string }[] = []
    if (draftFault !== null) held.push({ key: 'drafts', text: CHAT_WORDS.draftsMayBeLost(draftFault) })
    if (fault !== null) held.push({ key: 'fault', text: fault })
    if (!channel.open && channel.says !== null) held.push({ key: 'channel', text: channel.says })
    return held
  }, [draftFault, fault, channel.open, channel.says, language, useWordGeneration()])

  /**
   * WHICH NOTICE IS NEWEST, so two showing at once stack with the newer one above. The order is
   * kept as the notices appear and forgets a notice that has gone, so one that comes back is new
   * again. A notice not yet in the order is drawn on top, which is what "newest on top" means on
   * the frame it first appears.
   */
  const [noticeOrder, setNoticeOrder] = useState<readonly string[]>([])
  useEffect(() => {
    setNoticeOrder((was) => {
      const here = notices.map((one) => one.key)
      const kept = was.filter((key) => here.includes(key))
      const added = here.filter((key) => !kept.includes(key))
      if (added.length === 0 && kept.length === was.length) return was
      return [...kept, ...added]
    })
  }, [notices])
  const noticesNewestFirst = useMemo(() => {
    const rank = (key: string): number => {
      const at = noticeOrder.indexOf(key)
      return at === -1 ? Number.MAX_SAFE_INTEGER : at
    }
    return [...notices].sort((a, b) => rank(b.key) - rank(a.key))
  }, [notices, noticeOrder])

  useEffect(() => {
    if (reading === null) {
      setAsSide(null)
      return
    }
    // AN ANSWER FOR A READING THE PERSON HAS SINCE LEFT IS NOT DRAWN (wave 13y round 129, item 67). It came after the
    // conversation opened next, and drew its messages, or its refusal, over that one. The lists are still read again,
    // since the read recorded that the reader has seen it.
    let left = false
    void api
      .conversationBetween(reading.pair, reading.asSide)
      .then(async (said) => {
        if (!left) setAsSide(said)
        // AND THE LISTS ARE READ AGAIN, SO BOTH COUNTS FALL. Criterion M71. The owner reported that
        // opening a conversation did not make the bubble counts above fall. The read above is what
        // records that the reader has read this
        // conversation, and it always did; nothing asked for the list again afterwards, so the
        // number on the tab and the bold on the row were both answers from before the read.
        await readEverything()
      })
      .catch((err: unknown) => {
        // A SIDE NOBODY ANSWERS TO IS SAID BY THE DOOR'S SHORT REASON, which quotes no id (wave 13y round 94). The panel
        // says it in place of the pair, so it is not a notice as well (wave 13y round 95).
        if (left) return
        setPairRefused({ reading, reason: theShortReasonOf(err) ?? errorMessage(err) })
      })
    return () => {
      left = true
    }
  }, [reading, readEverything])

  const pairOlderOut = useRef(false)
  const readOlderPair = (): void => {
    const was = readingNow.current
    const held = asSideNow.current
    const oldest = held?.messages[0]
    if (was === null || held?.page?.olderRemain !== true || oldest === undefined || pairOlderOut.current) return
    pairOlderOut.current = true
    void api.conversationBetween(was.pair, was.asSide, { limit: 50, before: oldest.id }).then((older) => {
      const now = readingNow.current
      if (now === null || now.pair !== was.pair || now.asSide !== was.asSide || older.page?.continuesFromTheCursor !== true) return
      setAsSide((previous) => {
        if (previous === null || previous.messages[0]?.id !== oldest.id || previous.page == null || older.page == null) return previous
        const there = new Set(previous.messages.map((one) => one.id))
        return { ...previous, messages: [...older.messages.filter((one) => !there.has(one.id)), ...previous.messages], page: { ...previous.page, olderRemain: older.page.olderRemain } }
      })
    }, (err: unknown) => setFault(theShortReasonOf(err) ?? errorMessage(err))).finally(() => { pairOlderOut.current = false })
  }

  // ESCAPE CLOSES IT. One press, from anywhere on the page, because a panel that covers the corner
  // of every screen has to be dismissible without hunting for a button.
  // NOT AN ESCAPE SOMETHING INSIDE HAS ALREADY TAKEN. A menu in the panel (the flag's) closes itself on Escape
  // and says so with preventDefault; closing the whole panel too lost the person's place (found in wave 13n round 50).
  useEffect(() => {
    if (!open || onAPage) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !e.defaultPrevented) leaveTheCoveringChat()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onAPage])

  // ANOTHER PAGE ASKING FOR ONE CONTACT OR ONE GROUP. `openTheChatAt` and `openTheChatAtGroup`
  // above are the only things that send this.
  useEffect(() => {
    const openAt = (e: Event): void => {
      const detail = (e as CustomEvent<string | { key: string; workspaceId?: string; message?: string }>).detail
      const key = typeof detail === 'string' ? detail : detail.key
      setSendWorkspace(typeof detail === 'string' ? null : (detail.workspaceId ?? null))
      // A GROUP IS ASKED FOR FIRST, because its key is the one with a prefix and neither a
      // participant key nor an unregistered key can carry that prefix. By criterion E2, a
      // message's own page offers one press onto the group it belongs to.
      // A message id beside it is where the group is opened, criterion GM2's forwarded reply.
      const group = groupFromOpenKey(key)
      if (group !== null) {
        setTalkingTo(null)
        setWithUnregistered(null)
        setReading(null)
        setInTheGroup(group)
        setOpenAtMessage(typeof detail === 'string' ? null : (detail.message ?? null))
        setOpen(true)
        return
      }
      // A WRITER NOBODY REGISTERED IS ASKED FOR NEXT, because its key is the other one with a
      // prefix. Criterion M27.
      const writer = unregisteredFromKey(key)
      const who = writer === null ? participantFromKey(key) : null
      if (writer === null && who === null) return
      setInTheGroup(null)
      setOpenAtMessage(null)
      setReading(null)
      setWithUnregistered(writer)
      setTalkingTo(who)
      setOpen(true)
    }
    window.addEventListener(OPEN_AT, openAt)
    return () => {
      window.removeEventListener(OPEN_AT, openAt)
    }
  }, [])

  useEffect(() => {
    if (talkingTo === null) writeStored(WITH_KEY, '')
    else writeStored(WITH_KEY, participantKey(talkingTo))
  }, [talkingTo])

  /**
   * THE CONVERSATION FOLLOWS TO THE AGENT THE PRESS JUST MADE. Criterion M88, problem T-BOMReZU_Lg.
   *
   * The press answers with the new agent's handle. A conversation is addressed by the registry id,
   * so the registries are read again and the one live agent bearing that handle is opened. When no
   * live agent, or more than one, bears it, nothing is opened, and the press shows the server's
   * words instead.
   */
  const openTheNewAgent = async (handle: string): Promise<boolean> => {
    const registries = await readTheParticipantsOnce.again()
    setWho(registries)
    const bearing = registries.agents.filter((one) => one.handle === handle && one.retired !== true)
    const made = bearing.length === 1 ? bearing[0] : undefined
    if (made === undefined) return false
    setTalkingTo({ kind: 'agent', id: made.id })
    return true
  }

  // AND WHETHER IT WAS FILLING THE WINDOW. Criterion M104.
  useEffect(() => {
    if (onAPage) return
    writeStored(FULL_KEY, full ? 'yes' : 'no')
  }, [full, onAPage])

  /**
   * PUT THE NEWEST MESSAGE ON SCREEN, and say the reader is at the bottom because they now are.
   *
   * It sets `scrollTop` on the list itself rather than calling `scrollIntoView` on an anchor at the
   * end of it. The anchor worked in the two conversations that had one and not in the other two,
   * and it could move the page around the panel as well as the list inside it.
   */
  const goToTheNewest = useCallback((): void => {
    const list = theList.current
    if (list !== null) list.scrollTop = list.scrollHeight
    whereWePutIt.current = list === null ? null : puttingIt(list)
    thePlace.current = 'the newest'
    setNewMessagesBelow(false)
  }, [])

  /**
   * READ THE PLACE BEING READ from the list as it is drawn now.
   *
   * EIGHT PIXELS IS THE BOTTOM. A list scrolled to its end can sit a fraction of a pixel short of
   * it, and a reader who has nudged it by three pixels has not gone anywhere. The same eight the
   * panel's own tests measure the bottom with.
   */
  const readThePlace = useCallback((list: HTMLElement): void => {
    thePlace.current = 'the newest'
    if (list.scrollHeight - list.clientHeight - list.scrollTop <= 8) return
    const box = list.getBoundingClientRect()
    const middle = box.top + box.height / 2
    for (const row of list.children) {
      const its = row.getBoundingClientRect()
      if (its.bottom < middle) continue
      thePlace.current = { row, rowTop: its.top, top: box.top, bottom: box.bottom }
      return
    }
  }, [])

  /**
   * PUT THE PLACE BEING READ BACK WHERE IT WAS ON THE SCREEN, after something in the list or the
   * list itself changed size. A row no longer in the list has gone with what it said, so the place
   * is read again where the list is.
   *
   * THE ROW KEEPS ITS DISTANCE FROM THE EDGE OF THE LIST THAT STAYED WHERE IT WAS, which keeps it
   * still on the screen. Neither grip of the corner panel moves the bottom edge. The mark saying new
   * messages are below sits under the list and moves only the bottom edge. When both edges moved, the
   * window changed size and the panel went with its bottom corner, so the row keeps its distance from
   * the bottom edge.
   */
  const keepThePlace = useCallback(
    (list: HTMLElement): void => {
      const place = thePlace.current
      if (place === 'the newest') {
        list.scrollTop = list.scrollHeight
        whereWePutIt.current = puttingIt(list)
        return
      }
      if (place.row.parentElement !== list) {
        readThePlace(list)
        return
      }
      const box = list.getBoundingClientRect()
      const wanted = Math.abs(box.top - place.top) < 0.5 ? place.rowTop : place.rowTop + box.bottom - place.bottom
      const moved = place.row.getBoundingClientRect().top - wanted
      if (Math.abs(moved) >= 0.5) {
        list.scrollTop += moved
        whereWePutIt.current = puttingIt(list)
      }
      // A LIST AT ITS END CANNOT PUT THE ROW THERE, when less is left below it than the room below its place. The place
      // stays where the reader left it, so the row goes back there once the room is there again.
      thePlace.current = { row: place.row, rowTop: wanted, top: box.top, bottom: box.bottom }
    },
    [readThePlace],
  )

  /**
   * WHERE THE READER IS LOOKING, read on every scroll the reader makes. A list still where the chat
   * put it has not been moved by the reader, so the chat's own moves are not read.
   *
   * NOR ARE THE BROWSER'S. When what the list holds gets shorter, the browser pulls the list back to
   * its new end, and that fires a scroll as the reader's would. The list can then no longer reach
   * where the chat put it, so the place is kept instead of read. Measured in wave 13y round 148: while
   * the width was dragged out, each step made the rows shorter before the place was kept, and the pull
   * read as the reader going to the bottom.
   *
   * THE LIST'S END NOW IS COMPARED WITH ITS END THEN, as well as with where the chat put it.
   * `scrollHeight` and `clientHeight` are whole pixels, while `scrollTop` lands on a pixel of the
   * screen. On a screen scaled to 125 %, those are four fifths of a page's pixel apart, so a list at
   * its end can read up to a pixel past `scrollHeight - clientHeight`. Every scroll the reader made
   * from there read as the browser's pull, and was put back at the newest message. Measured in wave
   * 13y round 162, after the person was added to a group, at 1440 by 1000: at its end the list read
   * `scrollTop` 6,816 against 6,815, and each step of the wheel and of a drag of the bar was put back
   * in the same frame. The end read when the chat put the list there is read in whole pixels too, so
   * only a list that got shorter than both is the browser's pull.
   *
   * AT THE NEWEST MESSAGE, A LIST WHOSE END HAS MOVED SINCE THE CHAT PUT IT THERE is not read either,
   * unless the reader's hand is on it. The browser pulls the list back at the moment something reads
   * its size, and the scroll that pull fires waits for the next frame. When the list grew again before
   * that frame, it was no longer shorter than where the chat put it, and the pull read as the reader
   * moving up. Measured in wave 13y round 162, on the chat page at 1440 by 1000, in 3 of 48 openings.
   * In two of them the chat put the list at 5,728, the list got 20 pixels shorter and was pulled to
   * 5,708, and its end was 6,220 when the scroll was read. In all three the place was read 512 pixels
   * above the end, and the list was held away from its end from then on, with the newest message
   * below its foot.
   *
   * THE READER'S OWN SCROLL IN THE SAME FRAME IS READ, because a pull comes with no wheel, key, press
   * or touch at all. Measured in wave 13y round 163: the browser fires a scroll in a frame and the chat
   * reads it there, before that frame's layout says a row changed size. A scroll up from the newest
   * message by the wheel, by a drag of the bar, or by a finger drawn down the list, in the frame in
   * which the newest row grew 300 pixels, was put back at the newest message every time. So was a
   * scroll by the wheel as a new message came in, 4 times in 48. While the hand is there, a pull is
   * read as the reader's too. A scroll that comes with none of them, as when the browser finds words
   * on the page, is still taken for a pull.
   *
   * A READER'S OWN SCROLL TO THE NEWEST MESSAGE IS KEPT AS WHERE THE LIST WAS PUT, so the next pull
   * is told from the reader as well. Measured in wave 13y round 163: after the wheel went up and back
   * to the very bottom, nothing said where the list had been put, and a pull 512 pixels away from
   * its end was read as the reader, in 4 of 4 tries.
   */
  const readWhereTheyAreLooking = (): void => {
    const list = theList.current
    if (list === null) return
    const put = whereWePutIt.current
    const now = puttingIt(list)
    const hand = theirHand.current
    const theirs = hand.pressed || hand.touched || performance.now() - hand.at < THEIR_HAND_MS
    // A browser pull after a size change must not replace the reader's saved place.
    if ((!theirs && thePlace.current !== 'the newest' && put !== null && now.end !== put.end) ||
      (put !== null && (now.end < Math.min(put.top, put.end) - 0.5 || (thePlace.current === 'the newest' && now.end !== put.end && !theirs)))) keepThePlace(list)
    else if (put === null || now.top !== put.top) {
      const wasThere = thePlace.current === 'the newest'
      readThePlace(list)
      whereWePutIt.current = puttingIt(list)
      // ARRIVING AT THE BOTTOM TAKES THE MARK AWAY, because the reader has now seen what it was about.
      if (thePlace.current === 'the newest' && !wasThere) setNewMessagesBelow(false)
      keepWhereTheyAre(theirs)
    }
    // NEAR THE TOP OF A CONVERSATION WITH A CONTACT, THE PAGE BEFORE IS READ. Problem 8_cP0E-745e5.
    if (list.scrollTop <= NEAR_THE_TOP && list.scrollHeight > list.clientHeight) readTheOlderPage()
  }

  /**
   * WHAT TELLS THE READER'S HAND ON THE LIST, measured in wave 13y round 163 in the browser the tests
   * start. A wheel turned comes in the frame of the scroll it makes. A key pressed with the focus
   * on a link in the list starts its smooth scroll a frame later; the up arrow, Page Up and Home were
   * measured, and any key counts, because one that does not scroll the list holds the hand for
   * `THEIR_HAND_MS` at most. A press on the scroll bar is a press on the list itself, about 15 ms
   * before its first scroll, and nothing else is told until it is let go, wherever that is. A finger
   * is told by touch alone: as a pointer it is cancelled before the list scrolls.
   */
  const letGoOfTheList = (): void => {
    theirHand.current = { pressed: false, touched: false, at: performance.now() }
  }

  /**
   * KEEP WHERE THE READER IS NOW, so coming back to this conversation lands there. See `CHAT_PLACES`. The place kept
   * is the first message from the row being read down, with how far its top is below the list's top. At the newest
   * message nothing is kept.
   *
   * A PLACE NOT YET DRAWN AGAIN IS NOT REPLACED unless the reader's hand moved the list. Until it is drawn the list is
   * at its newest message, and that is not where the reader left it. Once it is put back, a move of the list by
   * anything else ends the hold on it.
   */
  const keepWhereTheyAre = (theirs: boolean): void => {
    const list = theList.current
    const conversation = conversationOnScreenNow.current
    if (list === null || conversation === null) return
    if (placeToComeBackTo.current !== null) {
      if (placeToComeBackTo.current.row === null && !theirs) return
      placeToComeBackTo.current = null
    }
    const place = thePlace.current
    if (place === 'the newest') {
      keepThePlaceRead(conversation, null)
      return
    }
    const said = saidOnScreenNow.current
    for (let row: Element | null = place.row; row !== null; row = row.nextElementSibling) {
      const message = theMessageInTheRow(row)
      const sent = message === null ? undefined : said.find((one) => one.id === message)
      if (message === null || sent === undefined) continue
      const fromTheTop = Math.round(row.getBoundingClientRect().top - list.getBoundingClientRect().top)
      keepThePlaceRead(conversation, { message, fromTheTop, newest: said.at(-1)?.id ?? '', sentAt: sent.sentAt })
      return
    }
  }
  const theirHandOnTheList = {
    onWheel: (e: React.WheelEvent<HTMLElement>): void => {
      if (e.deltaY !== 0) theirHand.current.at = performance.now()
    },
    onKeyDown: (): void => {
      theirHand.current.at = performance.now()
    },
    onPointerDown: (e: APointer<HTMLElement>): void => {
      if (e.target !== e.currentTarget || e.pointerType === 'touch') return
      theirHand.current.pressed = true
      window.addEventListener('pointerup', letGoOfTheList, { capture: true, once: true })
    },
    onTouchStart: (): void => {
      theirHand.current.touched = true
    },
    onTouchEnd: (e: React.TouchEvent<HTMLElement>): void => {
      if (e.touches.length === 0) letGoOfTheList()
    },
    onTouchCancel: (e: React.TouchEvent<HTMLElement>): void => {
      if (e.touches.length === 0) letGoOfTheList()
    },
  }

  /** Whether a read of an older page is out now, so a scroll starts at most one. */
  const olderReadOut = useRef(false)
  /**
   * HOW MANY MESSAGES OLDER PAGES PUT ABOVE THE ONES DRAWN WHEN THIS CONVERSATION OPENED. `drawnNow`
   * leaves them out of its count, so an older page is never taken for a new message below.
   */
  const olderAdded = useRef(0)

  /**
   * READ THE PAGE JUST OLDER THAN THE OLDEST MESSAGE HELD, and put it above, keeping the reader where
   * they were. Only in a conversation with a contact, which is the one read a page at a time. It says
   * whether a read is out, so a place above the pages held can wait for it.
   */
  const readTheOlderPage = (): boolean => {
    const open = theOpenOne.current
    if (olderReadOut.current) return true
    if (open === null || open.what !== 'contact' || !(conversationOnScreenNow.current ?? '').startsWith('contact:')) return false
    const them = open.them
    const key = participantKey(them)
    const asked = whatToAskForOlder(heldConversation(key))
    if (asked === null) return false
    olderReadOut.current = true
    const project = openTalk.current.project
    api
      .conversationWith(them.kind, them.id, project, asked)
      .then(
        (value) => {
          const kept = heldConversation(key)
          if (openTalk.current.key !== key || kept === null) return
          const next = afterAnOlderRead(kept, value)
          if (next === kept) return
          olderAdded.current += next.reply.messages.length - kept.reply.messages.length
          holdConversation(key, next)
          setTalk(next.reply)
        },
        (err: unknown) => {
          setFault(errorMessage(err))
        },
      )
      .finally(() => {
        olderReadOut.current = false
      })
    return true
  }

  /**
   * WHICH CONVERSATION IS ON SCREEN, as one string, so a change of conversation can be watched.
   *
   * It is not `whichConversation` above: that one is null in the two places with no composer, and
   * the reader's place has to be kept in those as well.
   */
  const conversationOnScreen: string | null =
    inTheGroup !== null
      ? `group:${inTheGroup}`
      : withUnregistered !== null
        ? unregisteredKey(withUnregistered)
        : reading !== null
          ? `between:${reading.pair}:${reading.asSide ?? ''}`
          : talkingTo !== null
            ? `contact:${participantKey(talkingTo)}`
            : null

  // A DELIBERATE MOVE PUTS THE NEWEST MESSAGE ON SCREEN: the panel opening, another conversation
  // being opened, or the chat changing frame. Criterion M58. The owner reported that after opening a
  // conversation, closing the panel with the button at the bottom right and opening it again moved
  // the chat to the earliest message. The panel is `{open ? <aside…> : null}`, so pressing the circle
  // throws the scrolled list away and pressing it again builds a fresh one, which starts at the
  // OLDEST message.
  //
  // THE FRAME IS WATCHED FOR THE SAME REASON. The split draws the lists inside a pane of its own and
  // the window draws them directly, so going from one to the other builds a new list even while the
  // panel stays open and the conversation stays the same. Without the frame in the list below, that
  // new list was left at its first message: reopening through the sidebar put the split at its newest
  // (0 short of the end), and the seam's own-window press then left the corner list at 0 of 5409.
  //
  // WHAT IS NOT HERE IS THE CONVERSATION BEING READ AGAIN. It used to be — the effect watched `talk`
  // and `theGroup`, which are fresh objects on every poll — so the list jumped to the end every few
  // seconds wherever the reader was. That is criterion M101 and the owner's report of 9 September 2026.
  //
  // WHERE THE READER LEFT THIS CONVERSATION ABOVE ITS NEWEST MESSAGE, the effect after the arrivals
  // below then puts that place back on screen. See `CHAT_PLACES`.
  conversationOnScreenNow.current = conversationOnScreen
  useEffect(() => {
    drawnBefore.current = null
    olderAdded.current = 0
    goToTheNewest()
    const place = !open || conversationOnScreen === null ? undefined : thePlacesRead()[conversationOnScreen]
    placeToComeBackTo.current = place === undefined || conversationOnScreen === null ? null : { conversation: conversationOnScreen, place, row: null }
  }, [open, conversationOnScreen, where, goToTheNewest])

  /**
   * WHAT IS DRAWN IN THE LIST RIGHT NOW: how many messages, and which is last.
   *
   * The count alone would miss an edit that makes the list taller, and the last id alone would miss
   * a message arriving before one already drawn. Neither changes when the same conversation is read
   * again, which is the whole point: a redraw must not move the reader.
   */
  const saidOnScreen: readonly PoolEntry[] =
    inTheGroup !== null
      ? (theGroup?.messages ?? [])
      : withUnregistered !== null
        ? (fromUnregistered?.messages ?? [])
        : reading !== null
          ? (asSide?.messages ?? [])
          : (talk?.messages ?? [])
  saidOnScreenNow.current = saidOnScreen
  const drawnNow = ((): string => {
    // AN OLDER PAGE PUT ABOVE IS NOT COUNTED, so it is never taken for a message arriving below.
    const olderAbove = inTheGroup === null && withUnregistered === null && reading === null ? olderAdded.current : 0
    return `${String(saidOnScreen.length - olderAbove)}:${saidOnScreen.at(-1)?.id ?? ''}`
  })()

  // The first answer is history, not an arrival. Only new rows after the last row already drawn
  // rise; older pages inserted above and the reader's own sends stay still.
  const seenForArrival = useRef<{conversation:string; ids:Set<string>}|null>(null)
  const sendsWhoseTickAppeared = useRef(new Set<string>())
  useLayoutEffect(() => {
    const waiting = new Set(pendingSends.filter(one => one.state === 'sending' || one.state === 'sent').map(one => one.sendId))
    for (const row of theList.current?.querySelectorAll<HTMLElement>(':scope > li[data-sent-press]') ?? []) {
      const press = row.dataset.sentPress
      if (press === undefined || !waiting.has(press) || sendsWhoseTickAppeared.current.has(press)) continue
      const tick = row.querySelector<HTMLElement>('.px-chat-mark[data-shape="tick"]')
      if (tick === null) continue
      sendsWhoseTickAppeared.current.add(press)
      tick.classList.add('px-chat-stored-tick-arrival')
    }
  }, [talk, pendingSends, conversationOnScreen])
  useLayoutEffect(() => {
    if (!open || conversationOnScreen === null) { seenForArrival.current = null; return }
    const reply = inTheGroup !== null ? theGroup : withUnregistered !== null ? fromUnregistered : reading !== null ? asSide : talk
    if (reply === null) { seenForArrival.current = null; return }
    const messages = reply.messages
    const prior = seenForArrival.current
    if (prior?.conversation === conversationOnScreen) {
      let last = -1
      for (let i = messages.length - 1; i >= 0; i -= 1) if (prior.ids.has(messages[i]!.id)) { last = i; break }
      const from = prior.ids.size === 0 ? 0 : last < 0 ? messages.length : last + 1
      const arriving = new Set(messages.slice(from).filter(one => !prior.ids.has(one.id)).map(one => one.id))
      for (const row of theList.current?.querySelectorAll<HTMLElement>(':scope > li[data-mine="no"]') ?? []) {
        const id = theMessageInTheRow(row)
        if (id !== null && arriving.has(id)) row.classList.add('px-chat-arrival')
      }
    }
    seenForArrival.current = {conversation:conversationOnScreen, ids:new Set(messages.map(one => one.id))}
  }, [open, conversationOnScreen, inTheGroup, withUnregistered, reading, theGroup, fromUnregistered, asSide, talk])

  // MESSAGES ARRIVING. The list follows them only while the reader is at the bottom; a reader who
  // has scrolled up stays where they are, and the mark says there is something new below them.
  useEffect(() => {
    const first = drawnBefore.current === null
    const changed = !first && drawnBefore.current !== drawnNow
    drawnBefore.current = drawnNow
    if (thePlace.current === 'the newest') goToTheNewest()
    else if (changed) setNewMessagesBelow(true)
  }, [drawnNow, goToTheNewest])

  /** Put the row of a place come back to at its height below the list's top, and say that is where the list was put. */
  const putTheRowBack = useCallback((list: HTMLElement, row: Element, fromTheTop: number): void => {
    const box = list.getBoundingClientRect()
    list.scrollTop += row.getBoundingClientRect().top - (box.top + fromTheTop)
    whereWePutIt.current = puttingIt(list)
    thePlace.current = { row, rowTop: row.getBoundingClientRect().top, top: box.top, bottom: box.bottom }
  }, [])

  // COMING BACK TO A CONVERSATION PUTS THE MESSAGE THE READER WAS READING WHERE IT WAS, once that message is drawn.
  // See `CHAT_PLACES`. It runs after the arrivals above, which hold the list at its newest message until then. A
  // message older than every message held is read for, a page at a time. One that is not there when nothing older is
  // left to read has gone, and the list stays at its newest message. Messages that came since are below, and the mark
  // says so.
  useEffect(() => {
    const waiting = placeToComeBackTo.current
    if (waiting === null) return
    if (!open || waiting.conversation !== conversationOnScreen || openAtMessage !== null) {
      placeToComeBackTo.current = null
      return
    }
    const list = theList.current
    if (waiting.row !== null || list === null || saidOnScreen.length === 0) return
    const { place } = waiting
    const row = [...list.children].find((one) => theMessageInTheRow(one) === place.message)
    if (row === undefined) {
      const oldest = saidOnScreen[0]
      const above = oldest !== undefined && Date.parse(place.sentAt) <= Date.parse(oldest.sentAt)
      if (!above || !readTheOlderPage()) placeToComeBackTo.current = null
      return
    }
    putTheRowBack(list, row, place.fromTheTop)
    placeToComeBackTo.current = { ...waiting, row }
    if (saidOnScreen.at(-1)?.id !== place.newest) setNewMessagesBelow(true)
  })

  // THE PLACE BEING READ STAYS WHERE IT IS ON THE SCREEN WHEN ANYTHING CHANGES SIZE: a row as its
  // pictures and the names of the records it links to land, rows put in above or below, and the list
  // itself as the panel is dragged or the window changes. Each is put back before the frame is painted.
  //
  // At the newest message this keeps the newest in view. Measured on 26 September 2026: the rows can
  // first draw at about half their height, the list goes to the newest, and then the rows grow.
  //
  // Above it, the list used to keep its top still, and so it moved what the reader saw. Measured in
  // wave 13y round 148, item 108: a picture's loading box is taller than the picture, so a reader who
  // had just scrolled up was put back at the bottom when the pictures landed; the names of linked
  // records landing moved the row being read about 1,150 pixels; dragging the width put the reader
  // at the bottom.
  //
  // A ROW PUT IN IS WATCHED FROM ITS FIRST FRAME: its first size is reported before that frame is
  // painted, and that is where the place is kept when an older page is put above.
  //
  // THE FRAME IS WATCHED as well, for the reason the scroll to the newest message watches it: going
  // from beside the page to the chat's own window builds a new list, and a watcher left on the old
  // list keeps no place in the new one. Measured in wave 13y round 157: after the seam's own-window
  // press, dragging the window's grip while scrolled up moved the row being read by thousands of
  // pixels.
  //
  // A PLACE COME BACK TO IS HELD AT ITS HEIGHT BELOW THE LIST'S TOP until the list is moved by anything else. The
  // place kept below follows the list's bottom whenever the list's top moves. Measured in wave 13y round 166: after a
  // reload, without the hold, the message being read ended 52 pixels lower than where it was put back.
  useEffect(() => {
    const list = theList.current
    if (list === null || typeof ResizeObserver === 'undefined') return
    const sizes = new ResizeObserver(() => {
      const held = placeToComeBackTo.current
      if (held !== null && held.row !== null && held.row.parentElement === list) putTheRowBack(list, held.row, held.place.fromTheTop)
      else keepThePlace(list)
    })
    sizes.observe(list)
    for (const row of list.children) sizes.observe(row)
    const rows = new MutationObserver((changes) => {
      for (const change of changes) for (const row of change.addedNodes) if (row instanceof Element) sizes.observe(row)
    })
    rows.observe(list, { childList: true })
    return () => {
      sizes.disconnect()
      rows.disconnect()
    }
  }, [open, conversationOnScreen, where, drawnNow, keepThePlace, putTheRowBack])

  /**
   * PUT ONE MESSAGE ON SCREEN, when the panel was asked to open a group at it. Criterion GM2.
   *
   * It runs after the group has been read, so the row is in the list when the scroll is asked for,
   * and it runs after the effect above, so the move wins over a jump to the newest line. The request
   * is then cleared: the panel's periodic re-read of the group would otherwise drag the reader back
   * to the same message every few seconds.
   */
  useEffect(() => {
    if (openAtMessage === null || inTheGroup === null || theGroup === null) return
    const list = theList.current
    if (list === null) return
    const row = list.querySelector(`[data-message-id="${openAtMessage}"]`)
    if (row instanceof HTMLElement) {
      row.scrollIntoView({ block: 'center' })
      readThePlace(list)
    }
    setOpenAtMessage(null)
  }, [openAtMessage, inTheGroup, theGroup, readThePlace])

  /**
   * WHAT EVERY LIST OF MESSAGES IN THIS PANEL IS, written once.
   *
   * Four conversations draw one of these and only one is mounted at a time, so they share the ref,
   * the scroll handler and what tells the reader's hand. Four copies of these attributes would be
   * four chances for one of them to stop keeping the reader's place.
   */
  const theMessageList = { className: 'px-chat-said', ref: theList, onScroll: readWhereTheyAreLooking, ...theirHandOnTheList }

  /** The mark saying new messages are below, and the press that goes to them. Criterion M101. */
  const newBelowMark =
    !newMessagesBelow ? null : (
      <button
        type="button"
        className="px-chat-new-below"
        onClick={() => {
          // THE READER WENT TO THE NEWEST MESSAGE, so this conversation keeps no place to come back to.
          placeToComeBackTo.current = null
          if (conversationOnScreen !== null) keepThePlaceRead(conversationOnScreen, null)
          goToTheNewest()
        }}
      >
        {CHAT_WORDS.newMessagesBelow}
      </button>
    )

  const everybody = useMemo(() => {
    const out = new Map<string, ParticipantForThePage>()
    for (const one of who?.people ?? []) out.set(participantKey({ kind: 'person', id: one.id }), one)
    for (const one of who?.agents ?? []) out.set(participantKey({ kind: 'agent', id: one.id }), one)
    return out
  }, [who])
  /** The same participants in the shape the one reader of a stored sender reads, each agent with its own record. */
  const known: KnownParticipant[] = useMemo(
    () => [
      ...(who?.people ?? []).map((one) => ({ who: { kind: 'person' as const, id: one.id }, name: one.name, handle: one.handle })),
      ...(who?.agents ?? []).map((one) => ({ who: { kind: 'agent' as const, id: one.id }, name: one.name, handle: one.handle, record: one.record })),
    ],
    [who],
  )
  /**
   * WHO SENT A MESSAGE, AS THIS PAGE HAS THEM, or undefined because nobody here answers to the stored sender. It is read
   * as every stored sender is (`theAgentAStoredSenderNames`, wave 13y round 86): the registry id, then the agent's own
   * record, then the one agent with that handle. The panel matched the registry id only, so a message stored under a
   * handle or a record was drawn with no picture and no name.
   */
  const theSenderOf = (sentBy: ParticipantRef | null): ParticipantForThePage | undefined => {
    const answers = sentBy === null ? null : theAgentAStoredSenderNames(sentBy, known)
    return answers === null ? undefined : everybody.get(participantKey(answers))
  }

  // WHO IS READING: the contact list says so when the panel has read it, and the circle's read says
  // so while the panel is closed. Both are the same answer from the same resolver on the server.
  const me = contacts?.me ?? circle?.me ?? null
  // THE ONE MESSAGE THAT SAYS UNDER IT WHAT HAPPENS NEXT, criterion M86 (`theNewestWaitingMessage`).
  const newestWaiting = theNewestWaitingMessage(talk?.messages ?? [], me, talkingTo)
  /**
   * WHETHER THIS READER IS OFFERED THE MARK BESIDE SEND AND "MARK BROKEN": the person only, because the mark is theirs and
   * the server refuses it from anybody else. Anybody else's messages carry no mark at all.
   */
  const offersAMark = me?.kind === 'person'
  const myself = me === null ? undefined : everybody.get(participantKey(me))
  // THE PERSON'S WHOLE LIST OF FLAGS, from their two stored values, read through the one builder the Settings panel
  // reads them through too. A reply reading somebody else's message does not draw their flag for them.
  const myFlags = theFlagsOf(myself?.shippedFlags ?? null, myself?.chatLabels ?? [])
  /** The person's word for a dropped part's flag, from the list the menu draws. */
  const theNameOfAPart = (part: AMarkedPart): string => {
    if (part.intent !== undefined) return theFlagFor(part.intent, myFlags)?.name ?? ''
    if (part.label !== undefined) return theFlagForLabel(part.label, myFlags)?.name ?? part.label.text
    return ''
  }
  /** One flag in the shape a marked part stores: an asking mark, or the label's own word and colour. */
  const theFlagOfTheMenu = (flag: AFlagOfThePersons): { intent?: AnIntentThatAsks; label?: MessageLabel } => (
    flag.kind === 'shipped'
      ? { intent: flag.id as AnIntentThatAsks }
      : flag.kind === 'own'
        ? { label: { text: flag.name, colour: flag.colour } }
        : {}
  )
  // THE FLAG THE NEXT MESSAGE CARRIES: a shipped mark, an own label, or 'No mark'. One value, so the button, the menu,
  // the bubble and the press cannot disagree about which flag is on.
  const chosenFlag = label === null
    ? (myFlags.all.find((one) => one.kind === 'shipped' && one.id === intent) ?? myFlags.noMark)
    : (myFlags.own.find((one) => one.name === label.text) ?? {
        id: `label:${label.text.toLocaleLowerCase()}`,
        kind: 'own' as const,
        name: label.text,
        description: null,
        instruction: null,
        shortWord: label.text,
        colour: label.colour,
        wordsColour: label.colour,
      })
  const roomForTwoColumns = onAPage ? !narrow : wideForTwoColumns
  const twoColumns = roomForTwoColumns && myself?.chatLayout !== 'one'
  const changeTheLayout = async (): Promise<void> => {
    if (me?.kind !== 'person' || layoutSaveInFlight.current) return
    layoutSaveInFlight.current = true
    try {
      await api.changeParticipant(me.kind, me.id, { chatLayout: twoColumns ? 'one' : 'two' })
      readTheParticipantsOnce.written()
      setWho(await readTheParticipantsOnce.again())
    } catch (error: unknown) {
      setFault(errorMessage(error))
    } finally {
      layoutSaveInFlight.current = false
    }
  }
  const layoutPress = me?.kind !== 'person' || !roomForTwoColumns ? null : (
    <AShapePress className="px-chat-layout-toggle" words={twoColumns ? t('chat.layout.single') : t('chat.layout.sideBySide')} onPress={() => { void changeTheLayout() }}>
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <rect x="2" y="3" width="16" height="14" rx="1" />
        {twoColumns ? null : <path d="M8 3v14" />}
      </svg>
    </AShapePress>
  )
  /** The flag stands just left of Send in the row of presses, at every width. Its list ends with the person's own labels. */
  const theSelector = offersAMark ? (
    <IntentSelector
      chosen={chosenFlag}
      flags={myFlags}
      onOpen={() => {
        const active = document.activeElement
        if (active instanceof HTMLTextAreaElement && active.closest('.px-chat-write') !== null) {
          wordsSelectedInTheBox.current = { from: active.selectionStart, to: active.selectionEnd }
        }
      }}
      onChoose={(flag) => {
        // WORDS SELECTED IN THE BOX ARE MARKED, and a flag chosen with nothing selected marks the whole message as
        // before. A message carries parts or one whole flag, never both, so marking words takes the whole flag off.
        const held = wordsSelectedInTheBox.current
        const words = typedNow()
        const hasAChosenRun = held.to > held.from && words.slice(held.from, held.to).trim() !== ''
        if (hasAChosenRun) {
          if (flag.kind === 'none') {
            writeDraftParts(draftHereKey, unmarkedOverTheChosenWords(words, held.from, held.to, partsInDraft(draftHereKey)))
          } else {
            const next = markedPartsOverTheChosenWords(words, held.from, held.to, partsInDraft(draftHereKey), theFlagOfTheMenu(flag), () => crypto.randomUUID())
            if (next !== null) writeDraftParts(draftHereKey, next)
          }
          setIntent('none')
          setLabel(null)
          setDroppedMarks([])
          setMarksTakenOff(null)
          return
        }
        if (partsInDraft(draftHereKey).length > 0 && flag.kind !== 'none') {
          writeDraftParts(draftHereKey, [])
          setDroppedMarks([])
          setMarksTakenOff(flag.name)
        } else {
          setMarksTakenOff(null)
        }
        if (flag.kind === 'shipped') {
          setIntent(flag.id as IntentMark)
          setLabel(null)
        } else if (flag.kind === 'own') {
          setIntent('none')
          setLabel({ text: flag.name, colour: flag.colour })
        } else {
          setIntent('none')
          setLabel(null)
        }
      }}
    />
  ) : null
  /**
   * WHAT HAPPENED TO A MARK WHILE THE PERSON WROTE: a part the typing touched, a whole flag that took the parts' place,
   * or a browser that could not keep the marks with the draft. Said under the box, where the person is looking.
   */
  const theMarkNotes = droppedMarks.length === 0 && marksTakenOff === null && partsFault === null ? null : (
    <div className="px-chat-mark-notes">
      {droppedMarks.map((one, at) => (
        <p key={`${String(one.part.from)}:${String(at)}`} className="px-chat-dropped-mark">
          {t(one.why === 'moved' ? 'chat.partDroppedMoved' : 'chat.partDroppedGone', { quote: one.part.quote, name: theNameOfAPart(one.part) })}
        </p>
      ))}
      {marksTakenOff === null ? null : <p className="px-chat-marks-taken-off">{t('chat.marksTakenOff', { name: marksTakenOff })}</p>}
      {partsFault === null ? null : <p className="px-chat-marks-not-kept">{partsFault}</p>}
    </div>
  )
  /**
   * A MESSAGE'S "FROM" LINE, WITH "MARK BROKEN" JUST LEFT OF IT where the press is drawn. That is where the press was asked
   * for, nearer the mark on the message above. The two are one piece of the foot: a foot too narrow for
   * one line moves them to the next line together, and never ends one line with the press and begins the next with the
   * "from" line.
   */
  const theFromLineOf = (messages: readonly PoolEntry[], one: PoolEntry): ReactNode => {
    const marked = offersAMark ? theMarkedMessageItAnswers(messages, messages.findIndex((message) => message.id === one.id)) : null
    if (marked === null) return <WrittenFrom said={one} />
    return <FromBesideTheMark key={`${one.id}:${marked.id}`} said={one} marked={marked} flagName={theMarksName(marked.intent, myFlags)} />
  }
  /** Whether the reader has written a status, which is what gives it a line of its own. */
  const hasAState = aStateIsWritten(myself?.state)
  /** Open the reader's status editor, from the line or from the pencil drawn where there is no line. */
  const startEditingMyState = (): void => {
    setStateTyped(stateDraft ?? myself?.state ?? '')
    setChangingState(true)
  }
  /** The reading held for one participant, asking for nothing. */
  const theReadingHeld = (ref: { kind: ParticipantKind; id: string }): PresenceOnTheWire | undefined =>
    presence.find((one) => one.who.kind === ref.kind && one.who.id === ref.id)
  /** The reading a dot drawn now is drawn from: the one held, and one read for it where none is (`aDotIsDrawn`). */
  const readingOf = (ref: { kind: ParticipantKind; id: string }): PresenceOnTheWire | undefined => {
    const found = theReadingHeld(ref)
    // A KEPT READING IS SHOWN ONLY UNTIL ITS OWN READ COMES. It was read before this drawing, and a resident's sleep
    // can have begun or ended since with no event this page heard.
    aDotIsDrawn(ref, found !== undefined && !thePresenceIsKept.current)
    return found
  }

  // THE READER'S OWN COLOUR AND OWN ANSWER, BOTH FROM THE SERVER. `choice` is null until the first read
  // comes back and null for anybody the server will not tell, and the default is what the control
  // then shows — the same word `PRESENCE_BEFORE_ANYBODY_CHOOSES` means everywhere else.
  // ASKED WHERE THE CONTROL IS DRAWN, in the open panel, so a closed panel reads no dot.
  const myChoice = (): PresenceChoice => (me === null ? undefined : readingOf(me))?.choice ?? PRESENCE_BEFORE_ANYBODY_CHOOSES

  /**
   * WHETHER THE TAB ON SCREEN HAS ROWS BUT NONE IN THE CHOSEN PROJECT, so the list says so rather than standing empty.
   * A list not read yet, or empty under every project, says what it said before. The panel holds only the first rows
   * of the contacts, so for them it is the door's own counts, once the list has been read under the project chosen.
   */
  const theListIsEmptyUnderTheChoice =
    shownProject !== null &&
    (list === 'contacts'
      ? contacts !== null && contacts.project === shownProject && contacts.total > 0 && contacts.inTheProject === 0
      : list === 'groups'
        ? groups !== null && groups.groups.length > 0 && !groups.groups.some((one) => inTheChosenProject(one, shownProject))
        : between !== null && between.mayRead === true && between.conversations.length > 0 &&
          !between.conversations.some((one) => inTheChosenProject(one, shownProject)))

  /**
   * THE NUMBER ON EACH TAB, AND EACH TAB COUNTS ITS OWN KIND OF THING. Criterion M32 asks
   * that, once the panel is open, a bubble beside Contacts show the total of messages, Groups show the
   * number of unread groups, and Between agents, where anything is unread, show a grey bubble with
   * the unread count.
   *
   * Contacts counts MESSAGES. Groups counts GROUPS — one per group holding anything unread, not one
   * per message in it.
   *
   * BETWEEN AGENTS HAS NO NUMBER ON ITS TAB. What agents say to each other is not pushed to the person as new; it is
   * there when the person opens it. Each row under the tab still says what is new in that
   * conversation. Agreed with wave 13n, whose panel this is.
   *
   * THE TWO ADD UP TO THE CIRCLE. The groups' number is added up from the rows the panel itself draws,
   * and the circle is the server adding the same two lists from the same rows, so the only way they
   * could disagree is for the server to hand down rows it did not count — which
   * `tests/an-unread-count-falls-when-the-person-reads-it.test.ts` is what fails on. Problem LZXb_D1SxvNg.
   *
   * THE CONTACTS' NUMBER IS THE DOOR'S OWN SUM OVER EVERY ROW (`unread.messages`), and no longer a sum over the rows
   * held: the panel holds the first rows of the list and not all of it. The events code moves
   * it with the rows it moves (src/web/lib/chatdeltas.ts).
   */
  const unreadOnTab: Readonly<Record<Exclude<WhichList, 'between'>, number>> = {
    contacts: contacts?.unread.messages ?? 0,
    // ONLY THE GROUPS THE READER IS IN. `groups.groups` is every group in the project, because a person may
    // read one they are not in; `groups.yours` is the ones they are in. The circle counts only the
    // second, so counting the first here would put a number on the tab that the circle does not
    // have — the same fault this count exists to fix, pointing the other way.
    groups: (groups?.groups ?? []).filter(
      (one) => (groups?.yours ?? []).includes(one.id) && one.unread > 0,
    ).length,
  }

  /**
   * THE COMMENTS IN THIS CONVERSATION THAT NOBODY HAS SENT YET.
   *
   * A comment is a message with a pointer, and one written during a review has no delivery rows
   * until the review is sent. Since criterion M28 those are drawn here, so the press that sends them
   * belongs here too. It is the reader's own comments only: sending somebody else's would be this
   * panel acting for them.
   */
  const unsentHere = useMemo(
    () =>
      (talk?.messages ?? []).filter(
        (one) =>
          one.notSentYet &&
          one.target !== null &&
          me !== null &&
          one.sentBy !== null &&
          one.sentBy.kind === me.kind &&
          one.sentBy.id === me.id,
      ),
    [talk, me],
  )
  const [sending, setSending] = useState(false)

  /**
   * WHETHER THIS PRESS IS WAITING TO BE TOLD TO FINISH COLLECTING FIRST.
   *
   * Null means it is not asking. A number means it is, and the number is how many notes are in the
   * review — the same thing the column's own confirm says.
   */
  const [askingToFinish, setAskingToFinish] = useState<number | null>(null)

  /**
   * SEND THEM. THE SAME ACT AS THE PRESS IN THE REVIEW COLUMN, IN THE SAME ORDER.
   *
   * The notes can be sent together from the chat box or from the review column
   * at the right. Criterion M28 asks that the two presses be one act,
   * and the same act means the same routes with the same comment ids.
   *
   * ---------------------------------------------------------------------------------------
   * WHAT THE COLUMN DOES, AND WHY THIS NOW DOES IT TOO
   * ---------------------------------------------------------------------------------------
   *
   * In the column, sending a review that is still collecting is two presses: **Finish collecting**,
   * confirmed, and then **Send this review**. This press used to be one call to the send route,
   * which answered 409 while a review collected, and the panel showed that sentence. That was
   * honest and it meant the panel's press could not do the act at all — half of why M28 was not met
   * on 5 September 2026.
   *
   * So it asks the same question the column asks, in the same words, and only then does the same
   * two calls. Nobody's review is finished without being told to finish it; the difference is that
   * the person can now say so from here instead of being sent to another part of the screen.
   *
   * THERE IS STILL NO SECOND DOOR. `POST /api/reviews/:id/send` with `only` is the one way out, and
   * a second one would make its own conversation for the same comment — the fault the per-comment
   * press in ReviewBar.tsx already had and already records.
   */
  const sendTheComments = async (finishFirst: boolean): Promise<void> => {
    const reviewId = review.reviewId ?? review.showing
    if (reviewId === null) {
      setFault(CHAT_WORDS.noReviewToSend)
      return
    }
    setSending(true)
    try {
      // THE STATE IS ASKED OF THE SERVER, never of this browser's store. The store holds whether the
      // column is open and nothing else, which is what stops a pane from deciding anything — see
      // tests/the-pane-does-not-decide-where-a-comment-goes.
      const detail = await api.oneReview(reviewId)
      // This press names only the unsent rows in the open conversation. It shows their bodies,
      // count and contact, not every comment in the review. Read those rows fresh, and only them.
      if (talkingTo === null || talk === null) return
      const members = [...detail.members.filter((one) => one.found), ...detail.saved]
      const theReviewChanged =
        unsentHere.some((one) => !members.some((member) => member.id === one.id && member.found && member.state === 'queued' && member.body === one.body)) ||
        (finishFirst && (detail.review.state !== 'collecting' || detail.members.length !== askingToFinish)) ||
        detail.review.state === 'abandoned' || detail.review.state === 'sent'
      // WHEN THE REVIEW ALREADY SAYS SO, the narrowed read is not asked: the conversation is read whole once, to redraw it.
      const mine = theReviewChanged ? null : await api.myUnsentInTheConversationWith(talkingTo.kind, talkingTo.id, openTalk.current.project)
      if (openTalk.current.key !== participantKey(talkingTo)) return
      const unsent = (mine?.messages ?? []).filter((one) => one.notSentYet && one.target !== null && me !== null &&
        one.sentBy?.kind === me.kind && one.sentBy.id === me.id)
      const carries = (rows: readonly PoolEntry[]) => JSON.stringify(rows.map((one) =>
        [one.id, one.body, one.to, one.target]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))
      if (mine === null || mine.them.kind !== talk.them.kind || mine.them.id !== talk.them.id ||
        carries(unsent) !== carries(unsentHere)) {
        // THE CONVERSATION IS READ WHOLE, as it always was, so the redraw holds every message.
        const fresh = await api.conversationWith(talkingTo.kind, talkingTo.id, openTalk.current.project)
        if (openTalk.current.key !== participantKey(talkingTo)) return
        setAskingToFinish(null)
        reviewChanged()
        const key = participantKey(talkingTo)
        const next = afterANewerRead(heldConversation(key), fresh)
        talkRequest.current += 1
        holdConversation(key, next)
        setTalk(next.reply)
        talkReadStartedAt.current = Date.now()
        talkBeat.current?.settled()
        setFault(t('chat.commentsChangedAtSend'))
        return
      }
      if (detail.review.state === 'collecting' && !finishFirst) {
        setAskingToFinish(detail.members.length)
        setFault(null)
        return
      }
      if (detail.review.state === 'collecting') await api.finishCollecting(reviewId)
      await api.sendReview(
        reviewId,
        [],
        unsentHere.map((one) => one.id),
      )
      setAskingToFinish(null)
      reviewChanged()
      await readEverything()
      if (talkingTo !== null) await readTheTalk(talkingTo)
      setFault(null)
    } catch (err: unknown) {
      setFault(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  /**
   * WHICH MESSAGES ARE ON THE SCREEN RIGHT NOW, whichever of the panel's screens is open.
   *
   * A conversation between two agents is NOT here on purpose. The reader is watching that one, not
   * taking part in it (M12), and saying they read somebody else's message would be a claim about a
   * mark that is not theirs.
   */
  /**
   * THE OPEN GROUP'S STREAM, AND THE LINES FOLDED UNDER A LINE OF IT. The office may fold its own old lines in a group
   * under one newer line (`theFoldsOf` in shared/folded-lines.ts). The stream draws `shown`; a line that holds folded
   * lines draws them under itself, behind a press that says how many there are.
   */
  const theFolds = useMemo(() => {
    const folds = theFoldsOf(theGroup?.messages ?? [])
    return { ...folds, shownById: new Map(folds.shown.map((one) => [one.id, one])) }
  }, [theGroup])

  const onTheScreen: readonly PoolEntry[] = useMemo(() => {
    if (!open) return []
    // A FOLDED LINE IS NOT ON THE SCREEN until somebody opens it, so it is not said to be read.
    if (inTheGroup !== null) return theFolds.shown
    if (withUnregistered !== null) return fromUnregistered?.messages ?? []
    if (talkingTo !== null) return talk?.messages ?? []
    return []
  }, [open, inTheGroup, theFolds, withUnregistered, fromUnregistered, talkingTo, talk])

  /**
   * THE PANEL SAYS IT READ WHAT IT DREW, AND THAT IS WHAT MAKES AN UNREAD COUNT FALL.
   *
   * ---------------------------------------------------------------------------------------
   * WHY THE PANEL AND NOT THE ROUTE
   * ---------------------------------------------------------------------------------------
   *
   * `seen` means *the person it is addressed to has said they read this message*. Only something
   * that put the words in front of them can say that, and this is that thing. The conversation
   * route hands bytes to whatever asked; a script that reads it has shown nobody anything, and a
   * route marking `seen` would be writing a claim about a person it never met.
   *
   * The route's own step stays what it was: a message it hands over stops being queued and becomes
   * delivered. This adds the third rung and nothing else.
   *
   * ---------------------------------------------------------------------------------------
   * WHAT WAS WRONG BEFORE
   * ---------------------------------------------------------------------------------------
   *
   * The owner reported that the unread 1 stayed after talking in the conversation or pressing it
   * again, and stayed even after sending another message. Nothing in the whole panel had ever called
   * this route. Opening a conversation moved queued to delivered and every count asked for `not seen`,
   * so the 1 was correct and permanent: the reader had been handed the message and nothing had ever
   * recorded them reading it. `markSeenInConversation` was named in a
   * comment in src/server/lib/messages.ts and had never been written. Criterion M19, problem
   * MaRGbk3A9SL6.
   */
  useEffect(() => {
    if (me === null || onTheScreen.length === 0) return
    const notYet = onTheScreen.filter(
      (one) =>
        !alreadySaidIReadIt.current.has(one.id) &&
        one.deliveries.some((d) => d.to.kind === me.kind && d.to.id === me.id && d.mark !== 'seen'),
    )
    if (notYet.length === 0) return
    setReadMarksFailed((previous) => {
      if (!notYet.some((one) => previous.has(one.id))) return previous
      const next = new Set(previous)
      for (const one of notYet) next.delete(one.id)
      return next
    })
    for (const one of notYet) {
      alreadySaidIReadIt.current.add(one.id)
      seenMarksOut.current.add(one.id)
    }
    let goneFromTheScreen = false
    void (async () => {
      try {
        // AND NOTHING IS READ AGAIN HERE. Each mark is announced as `delivery.changed`, which carries the reader's new
        // counts for the rows it moved and the new delivery rows, and `applyAnEvent` puts them in place, so the mark on
        // the contact and the number on the circle fall while the reader is looking at them. This read every list and
        // the conversation again until round 9 of wave 13x: the presence, the contacts, the groups and the projects on
        // every switch from one conversation to another.
        //
        // THE MARKS GO TOGETHER, in one request for what is on the screen, and the server writes them in one
        // transaction. Each was a request of its own until round 86 of wave 13y, and the page was quiet only once the
        // last of them had come back. A screen holding more than one request may carry is sent in several.
        const requests: (typeof notYet)[] = []
        for (let at = 0; at < notYet.length; at += SEEN_MARKS_IN_ONE_REQUEST_AT_MOST) {
          requests.push(notYet.slice(at, at + SEEN_MARKS_IN_ONE_REQUEST_AT_MOST))
        }
        await Promise.all(
          requests.map((some) =>
            api.markSeen(some.map((one) => one.id)).then((answer) => {
              // A MARK THAT MOVED NOTHING IS ANNOUNCED BY NOBODY, so there is no event to wait for.
              const movedNothing = answer.marks.filter((mark) => !mark.changed).map((mark) => mark.messageId)
              if (movedNothing.length > 0) stopWaitingFor(movedNothing)
            }),
          ),
        )
        window.clearTimeout(seenMarksGivenUp.current)
        seenMarksGivenUp.current = window.setTimeout(() => stopWaitingFor([...seenMarksOut.current]), SEEN_MARKS_WAITED_FOR_MS)
      } catch (err: unknown) {
        // A MARK THAT DID NOT LAND IS SAID OUT LOUD. The count is then still right about what this
        // product knows, and the reader is told why it did not move.
        for (const one of notYet) alreadySaidIReadIt.current.delete(one.id)
        setReadMarksFailed((previous) => new Set([...previous, ...notYet.map((one) => one.id)]))
        stopWaitingFor(notYet.map((one) => one.id))
        if (!goneFromTheScreen) setFault(errorMessage(err))
      }
    })()
    return () => {
      goneFromTheScreen = true
    }
  }, [onTheScreen, me])

  /**
   * TRY THE SEND, on a PendingSend that already exists. Criterion M113.
   *
   * Split out of `send` below so the same attempt can be made again from `Send again` on a failed
   * one, without the words ever having to pass back through the compose box: they are carried on
   * the entry itself, so a slow answer arriving after the person has moved on to typing something
   * else still updates the right bubble.
   */
  const attemptSend = async (of: PendingSend): Promise<void> => {
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort()
    }, SEND_TIMEOUT_MS)
    try {
      const reply = await api.sendMessage(of.to, of.body, of.pictures, of.destination, controller.signal, of.sendId, of.intent, of.quotes, of.label, of.quotePositions, of.markedParts)
      // THE ANSWER CAME, so the timeout may not fire during the reads below and call it lost.
      clearTimeout(timeout)
      setPendingSends((was) => was.map((p) => (p.id === of.id ? { ...p, state: 'sent', recordId: reply.record.id } : p)))
      await readTheTalk(of.to)
      await readEverything()
    } catch (err: unknown) {
      // THE TIMEOUT GAVE UP ON THE ANSWER, AND THE LETTER MAY STILL HAVE ARRIVED. Problem
      // KzLydNEm4HYX. Known by this attempt's own signal: `request()` in api.ts turns the aborted
      // fetch into an `unreachable` fault, so the error itself does not say it was a timeout. The
      // entry says it does not know, offers no press, and the conversation is read to find out.
      // What that read finds is drawn by the effect below, which also acts on every later read.
      if (controller.signal.aborted) {
        const timedOutAt = Date.now()
        setPendingSends((was) =>
          was.map((p) => (p.id === of.id ? { ...p, state: 'not-known', reason: null, shortReason: null, timedOutAt } : p)),
        )
        await readTheTalk(of.to)
        return
      }
      const fault = faultOf(err)
      const reason = errorMessage(err)
      // A REFUSED MESSAGE'S WORDS STAY IN THE BOX. The office's checks on marked parts answer 400 before anything is
      // stored, so the person can change the words or the marks at once. Only a box this send emptied is filled; words
      // typed since are never written over.
      if (fault?.status === 400 && of.markedParts !== undefined && of.markedParts.length > 0 && of.draftKey !== null && draftOf(of.draftKey) === '') {
        writeADraft(of.draftKey, of.body)
        writeDraftParts(of.draftKey, of.markedParts)
      }
      // A STORED LETTER IS NOT A LOST ONE. The retired send's 409 names the record it stored, so the entry keeps that
      // id: the chat draws the stored row once, with the failed mark on it, and offers no second press. It follows
      // criterion M113a and a decision. A CODED REFUSAL IS SAID IN THE READER'S LANGUAGE, from
      // the word lists, as ErrorNote does; the whole sentence on hover stays the server's.
      setPendingSends((was) =>
        was.map((p) =>
          p.id === of.id
            ? {
                ...p,
                state: 'failed',
                reason,
                shortReason: fault?.code === undefined ? (fault?.reason ?? null) : t(`server.${fault.code}`, fault.values),
                recordId: fault?.stored ?? null,
              }
            : p,
        ),
      )
    } finally {
      clearTimeout(timeout)
    }
  }

  /**
   * SEND AGAIN, on a bubble that failed. Criterion M113: the words are never lost, and this is
   * where they are recovered from — the failed bubble itself, not the compose box, which has moved
   * on to whatever is typed now.
   */
  const sendAgain = (id: string): void => {
    const found = pendingSends.find((p) => p.id === id)
    if (found === undefined) return
    // A NEW ID FOR THE NEW PRESS, so a letter from the first press that arrives late is still found
    // as its own row and is not taken for this one.
    const retrying: PendingSend = {
      ...found,
      sendId: aSendId(),
      timedOutAt: null,
      state: 'sending',
      reason: null,
      shortReason: null,
      recordId: null,
    }
    setPendingSends((was) => was.map((p) => (p.id === id ? retrying : p)))
    void attemptSend(retrying)
  }

  const send = async (asked: WhatTheQuestionHeld | null = null): Promise<void> => {
    const typedAtPress = typedNow()
    const draftAtPress = draftHereKey
    const quotesAtPress = quotesInDraft(draftAtPress)
    const words = asked?.words ?? typedAtPress.trim()
    const these = asked?.pictures ?? picture.chosen
    const partsAtPress = offersAMark ? partsInDraft(draftAtPress) : []
    const markedParts = partsAtPress.length === 0 ? undefined : partsForTheSentWords(partsAtPress, typedAtPress, words)
    const marked = markedParts === undefined && offersAMark ? (asked?.intent ?? intent) : undefined
    const labelled = markedParts === undefined && offersAMark ? ((asked === null ? label : asked.label) ?? undefined) : undefined
    if (words === '' || talkingTo === null) return
    // A PRESS OF THE BUTTON OR THE SEND KEY asks the button's own rule. Send anyway is the key question's press.
    if (asked === null && !canSendNow(words)) return
    if (asked === null && askedAboutAKey(words, these, (held) => void send(held))) return
    const to = talkingTo
    const destinationNow = destination
    let pictures: readonly ImageBlock[]
    try {
      // THE PICTURE'S BYTES GO FIRST AND THE MESSAGE SECOND, UNCHANGED FROM BEFORE M113. Criterion
      // M65. If the picture is refused — too big, not a picture, an installation that cannot hold
      // one — nothing is sent and the reason is the server's own sentence, shown where every other
      // fault here is shown, because there is no bubble yet for it to belong to. A message sent
      // with the picture missing would be the worse outcome of the two.
      pictures = await picture.store(these, destinationNow)
    } catch (err: unknown) {
      setFault(errorMessage(err))
      return
    }
    // THE BUBBLE IS DRAWN AT THE PRESS, WITH THE CLOCK, BEFORE THE SERVER ANSWERS. Criterion M113,
    // on the owner's report of 11 September 2026, about 14:40: nothing was shown between the press and the
    // server's answer, and a message must never disappear in that gap. The words and the pictures
    // this send carried leave the box and the row AT ONCE, because they now live on the bubble instead:
    // a failed one keeps them and offers Send again, so nothing is lost either way. Words and pictures
    // added while the upload ran stay (problems DpiY-sIBZoln and BfvfcYSCa7nW).
    pendingSendCounter.current += 1
    const entry: PendingSend = {
      id: `pending-${String(Date.now())}-${String(pendingSendCounter.current)}`,
      sendId: aSendId(),
      timedOutAt: null,
      to,
      body: words,
      pictures,
      quotes: quotesAtPress.map((one) => one.context),
      quotePositions: positionsForSend(quotesAtPress, typedAtPress, words),
      destination: destinationNow,
      intent: marked,
      label: labelled,
      markedParts,
      draftKey: draftAtPress,
      state: 'sending',
      recordId: null,
      reason: null,
      shortReason: null,
    }
    setPendingSends((was) => [...was, entry])
    takeTheSentDraftOut(draftAtPress, typedAtPress, quotesAtPress)
    writeDraftParts(draftAtPress, [])
    setDroppedMarks([])
    setMarksTakenOff(null)
    picture.sent(these)
    setIntent('none')
    setLabel(null)
    void attemptSend(entry)
  }

  /**
   * DROP A PENDING ENTRY THE MOMENT THE ROW IT STANDS FOR SHOWS UP IN THE FETCHED CONVERSATION.
   * Criterion M113. `attemptSend` marks an entry `sent` as soon as the server answers, which may be
   * moments before the next fetch actually carries the real row — this is what stops the two being
   * drawn as two messages in that gap, without ever needing the two lists compared by their words,
   * which a person could genuinely have sent twice.
   *
   * A FAILED ENTRY WHOSE LETTER WAS STORED IS KEPT, because the stored row is what carries its
   * failed mark and the whole routed line on hover (criterion M113a). The pending bubble is not
   * drawn for it — the render skips any entry whose record is already in the conversation — so one
   * letter stays one bubble. A failed entry that stored nothing has no record id and is kept too,
   * as M113 has always done.
   *
   * A SEND WHOSE ANSWER HAS NOT COME IS SETTLED HERE TOO, by every read of its conversation and by
   * the event that carries the letter. Problem KzLydNEm4HYX. Such an entry has no record id, so it is
   * found by the id its press sent (`sendId`) on a message this reader sent in that conversation: then
   * its bubble gives way to the stored row, with that row's own marks. This holds in both timed-out
   * states and on every read,
   * so a letter the server stored late is still found. A `not-known` entry that a read started after
   * the timeout does not find becomes `not-in-the-conversation`, which offers Send again. A read
   * that fails sets no `talk`, so it changes nothing here. It runs when an entry changes as well as
   * when `talk` does, so a read that already holds the letter settles an entry that times out later.
   */
  useEffect(() => {
    setPendingSends((was) => {
      if (was.length === 0) return was
      const here = new Set((talk?.messages ?? []).map((one) => one.id))
      const conversation = talk === null ? null : participantKey(talk.them)
      const sentHere = new Set(
        (talk?.messages ?? [])
          .filter((one) => one.sendId !== null && one.sentBy !== null && talk !== null && participantKey(one.sentBy) === participantKey(talk.me))
          .map((one) => one.sendId),
      )
      let changed = false
      const next: PendingSend[] = []
      for (const p of was) {
        const timedOut = p.state === 'not-known' || p.state === 'not-in-the-conversation'
        const inThisConversation = conversation !== null && participantKey(p.to) === conversation
        if (timedOut && inThisConversation && sentHere.has(p.sendId)) {
          changed = true
          continue
        }
        if (p.state === 'not-known' && inThisConversation && p.timedOutAt !== null && talkReadStartedAt.current >= p.timedOutAt) {
          changed = true
          next.push({ ...p, state: 'not-in-the-conversation' })
          continue
        }
        if (p.recordId !== null && p.state !== 'failed' && here.has(p.recordId)) {
          changed = true
          continue
        }
        next.push(p)
      }
      return changed ? next : was
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talk, pendingSends])

  const sendToTheGroup = async (asked: WhatTheQuestionHeld | null = null): Promise<void> => {
    const typedAtPress = typedNow()
    const draftAtPress = draftHereKey
    const quotesAtPress = quotesInDraft(draftAtPress)
    const words = asked?.words ?? typedAtPress.trim()
    const these = asked?.pictures ?? picture.chosen
    const partsAtPress = offersAMark ? partsInDraft(draftAtPress) : []
    const markedParts = partsAtPress.length === 0 ? undefined : partsForTheSentWords(partsAtPress, typedAtPress, words)
    const marked = markedParts === undefined && offersAMark ? (asked?.intent ?? intent) : undefined
    const labelled = markedParts === undefined && offersAMark ? ((asked === null ? label : asked.label) ?? undefined) : undefined
    if (words === '' || inTheGroup === null) return
    if (asked === null && !canSendNow(words)) return
    if (asked === null && askedAboutAKey(words, these, (held) => void sendToTheGroup(held))) return
    const group = inTheGroup
    setGroupSendGoingIn(group)
    try {
      const pictures = await picture.store(these)
      await api.sendToGroup(group, words, pictures, marked, quotesAtPress.map((one) => one.context), labelled, positionsForSend(quotesAtPress, typedAtPress, words), markedParts)
      takeTheSentDraftOut(draftAtPress, typedAtPress, quotesAtPress)
      writeDraftParts(draftAtPress, [])
      setDroppedMarks([])
      setMarksTakenOff(null)
      picture.sent(these)
      setIntent('none')
      setLabel(null)
    } catch (err: unknown) {
      // THE SEND FAILED, SO THE WORDS AND THE PICTURES STAY, and Send is there again once the send has ended.
      setFault(errorMessage(err))
      return
    } finally {
      setGroupSendGoingIn(null)
    }
    try {
      await readTheGroup(group)
      await readEverything()
    } catch (err: unknown) {
      setFault(errorMessage(err))
    }
  }

  /**
   * A LINE THIS PANEL HAS JUST WRITTEN IS IN THE REGISTRIES, so they are read again after the write and not joined to
   * a reading of them that began before it (src/web/lib/oneread.ts).
   */
  const readAfterWritingALine = async (): Promise<void> => {
    readTheParticipantsOnce.written()
    await readEverything()
    // THE OPEN AGENT'S STATUS COMES WITH ITS CONVERSATION, so the conversation is read again. The new read overtakes
    // one already out, which was asked before the write.
    if (talkingTo?.kind === 'agent' && openTalk.current.key === participantKey(talkingTo)) await readTheTalk(talkingTo)
  }

  const saveState = async (words: string): Promise<void> => {
    if (me === null) return
    try {
      await api.changeParticipant(me.kind, me.id, { state: words })
      setChangingState(false)
      setStateDraft(null)
      await readAfterWritingALine()
    } catch (err: unknown) {
      setFault(errorMessage(err))
    }
  }

  /**
   * WRITE OR CLEAR THE LINE ON THE AGENT WHOSE CONVERSATION IS OPEN. Criterion M21, on decision
   * `lUh6uis7oB6z`. An empty line clears it back to nobody having said, and clears who set it too.
   */
  const saveTheirState = async (words: string): Promise<void> => {
    if (talkingTo === null) return
    try {
      await api.changeParticipant(talkingTo.kind, talkingTo.id, { state: words })
      setChangingTheirState(false)
      setTheirStateDraft(null)
      await readAfterWritingALine()
    } catch (err: unknown) {
      setFault(errorMessage(err))
    }
  }

  /**
   * SAY WHETHER THE READER IS HERE. Criterion M20, on decision `wvfrwvuzsKF_`.
   *
   * The colour beside the reader's name comes back from the server rather than being set here, because the
   * colour is worked out from the choice and the two would otherwise be two answers to one question.
   */
  const savePresence = async (choice: PresenceChoice): Promise<void> => {
    if (me === null) return
    try {
      await api.changeParticipant(me.kind, me.id, { presence: choice })
      await readEverything()
    } catch (err: unknown) {
      setFault(errorMessage(err))
    }
  }

  /**
   * WHAT EVERY RECORD MENTIONED IN THE OPEN CONVERSATION, OR ON THE BOARD, IS CALLED.
   *
   * A comment says which record it was left on and an offer says which record it would take the
   * reader to, and both hold an id. An id is a machine word and never stands in for a name.
   *
   * AN UNREGISTERED WRITER'S MESSAGES ARE READ TOO, so a message that points somewhere says where
   * whichever screen it is on. One screen drawing less than another for the same message is the
   * shape of problem 8PujMi9Uwqxz.
   */
  const titles = useRecordTitles(
    [
      ...(talk?.messages ?? []),
      ...(fromUnregistered?.messages ?? []),
      // AND A GROUP'S AND TWO AGENTS', because the quote above a pointed message names the thing in
      // all four conversations.
      ...(theGroup?.messages ?? []),
      ...(asSide?.messages ?? []),
    ].flatMap((one) => {
      const held: string[] = []
      for (const place of [...one.quotes, one.lead]) {
        if (place === null || typeof place !== 'object') continue
        const named = recordNamedByTarget((place as Context).target)
        if (named !== null) held.push(named)
      }
      return held
    }),
  )

  /**
   * THE TWO HALVES OF THE NUMBER ON THE CIRCLE, criterion M32, and the owner's rule for what each is:
   * the number on the circle is the contacts' unread messages plus the unread groups, and the
   * conversations between agents, which do not need the person, are not counted.
   *
   * `messages` is the contacts' unread messages; `groups` is how many groups hold anything unread.
   * The agents' own conversations are in neither, because the reader is not in them.
   *
   * OPEN, THE CONTACT LIST'S OWN, so the circle and the tabs below it move in the same frame. CLOSED,
   * OR OPEN BEFORE THE LIST HAS ANSWERED, THE CIRCLE'S READ. The server works out both with one
   * function, so they are the same two numbers.
   */
  const countedWaiting = (open ? contacts?.unread : undefined) ?? circle?.unread ?? { messages: 0, groups: 0 }
  // A message drawn in the open conversation can reach the contact list one frame before its seen
  // mark. Do not flash it in the circle while the mark is on its way; a refused mark counts again.
  const openContactUnread = open && talkingTo !== null
    ? contacts?.contacts.find((row) => row.who !== null && sameParticipant(row.who, talkingTo))?.unread ?? 0
    : 0
  const drawnUnread = open && talkingTo !== null && talk !== null && sameParticipant(talk.them, talkingTo) && me !== null
    ? onTheScreen.filter((one) => !readMarksFailed.has(one.id) && one.deliveries.some((d) => sameParticipant(d.to, me) && d.mark !== 'seen')).length
    : 0
  const waiting = { ...countedWaiting, messages: Math.max(0, countedWaiting.messages - Math.min(openContactUnread, drawnUnread)) }
  const unread = waiting.messages + waiting.groups
  /**
   * THE CIRCLE IS DRAWN ONLY WHERE IT CAN BE THE ONLY PLACE THE COUNT STANDS: the chat is shut, a
   * message or a group waits, and the window is wide enough that the sidebar's own row is beside
   * the page rather than folded into a drawer. On a phone, and whenever the row can carry it, the
   * row or the phone's bar carries the count instead.
   *
   * UNLESS THE PERSON KEEPS IT IN THE CORNER. Then it is drawn on every page at every width, shut or
   * open, except while the open split covers the screen below 1024 pixels. The button stands above
   * an open window so the same press can close it. While it is drawn it carries the
   * count, so the row and the bar still say nothing and the number stands once.
   */
  const buttonStays = (myself?.chatButtonStays ?? chatButtonStaysBeforeAnybodyChooses(me?.kind)) === 'always'
  const theCornerIsCovered = open && drawingTheSplit && !theSplitIsWide
  const circleOnScreen = !onAPage && (buttonStays ? !theCornerIsCovered : where === 'corner' && split.where === 'closed' && theSplitIsWide && unread > 0)
  /** HOW THE CHAT OPENS from the circle, the sidebar's row, the phone's bar and the chat key, as the person chose. */
  const opensAs = myself?.chatOpensAs ?? CHAT_OPENS_AS_BEFORE_ANYBODY_CHOOSES
  useEffect(() => {
    sayHowTheChatOpens(opensAs)
  }, [opensAs])
  /**
   * THE CHAT IS THE ONE PLACE THE COUNT IS WORKED OUT, and the sidebar's Chat row and the phone's
   * bar draw it from here. When the circle carries it, they say nothing; when it does not, they
   * carry it. Null once this drawing goes, so nothing draws a number nobody is counting any more.
   */
  useEffect(() => {
    sayTheCount({ count: unread, onTheCircle: circleOnScreen })
  }, [unread, circleOnScreen])
  useEffect(() => () => sayTheCount(null), [])
  /**
   * WHETHER THE CIRCLE DRAWS ONE NUMBER OR TWO BUBBLES, which is the reader's to choose. Criterion
   * M32: the two added together by default, changed in the settings. Null on the reader's row means
   * they have never chosen, which is read as the
   * default — and the default is named once, in shared/participants.ts, so a control offering it and
   * a panel drawing it cannot come to different answers.
   */
  const circleShows: CircleShows = myself?.circleShows ?? CIRCLE_BEFORE_ANYBODY_CHOOSES
  /**
   * THE PICTURE ON THE BUTTON. A chosen picture is drawn; with none chosen, mole-at-the-sill is drawn
   * in both looks. The default is named once, in shared/messages.ts.
   *
   * UNTIL THE READER'S OWN ROW HAS BEEN READ, NO PICTURE. The page cannot yet tell whether they chose
   * one, and drawing the default first would show them a picture they may have replaced. The frame is drawn empty.
   * A row kept from before a reload counts as not read: it may hold the picture they have since replaced.
   *
   * ONCE A READ HAS FAILED, THE DEFAULT PICTURE IS DRAWN. Waiting for a row that will never arrive
   * left the button an empty square or circle, with no picture and no word, in a project the office
   * refuses. The default shows what the press is; it is the same picture a reader who has chosen
   * nothing sees.
   */
  const circleFace =
    myself !== undefined && whoReadHere
      ? (myself.circlePicture ?? CIRCLE_PICTURE_BEFORE_ANYBODY_CHOOSES)
      : fault === null
        ? null
        : CIRCLE_PICTURE_BEFORE_ANYBODY_CHOOSES
  /**
   * WHICH OF THE TWO NAMES A LINK IN A MESSAGE DRAWS, as the reader chose. Criterion M47.
   *
   * Null on the row means they have never chosen, and the shared default is what that is read as — the
   * same shape `circleShows` above has, and named once so the panel and the control agree.
   */
  const linkLevel: MessageLinkLevel = myself?.messageLinkLevel ?? MESSAGE_LINK_LEVEL_BEFORE_ANYBODY_CHOOSES
  /** Where a link in a message sits, as the reader chose. Criterion M48; null on the row is the default. */
  const linkLayout: MessageLinkLayout = myself?.messageLinkLayout ?? MESSAGE_LINK_LAYOUT_BEFORE_ANYBODY_CHOOSES
  /** Whether a message says which project it is in, or the default because nobody chose. M73. */
  const projectMark: MessageProjectMark =
    myself?.messageProjectMark ?? MESSAGE_PROJECT_MARK_BEFORE_ANYBODY_CHOOSES
  /**
   * HOW BIG THE CHAT'S OWN TEXT IS, or `normal` because the reader has never chosen. Criterion M112.
   *
   * Read here and nowhere else: it is applied as `data-chat-size` on this panel's own root below, so
   * the CSS in this file's own stylesheet is what moves — no second reader, no prop drilled through
   * four conversations for a fact each of their bubbles can read off an ancestor.
   */
  const textSize: ChatTextSize = myself?.chatTextSize ?? CHAT_TEXT_SIZE_BEFORE_ANYBODY_CHOOSES
  /**
   * AND THE READER'S PICTURE CHOICE REACHES EVERYTHING THAT DRAWS ONE. Criterion M64, decision
   * rJphPkCG3l7X.
   *
   * It moved off this browser and onto the reader's registry row on 7 September 2026. This panel is the one
   * thing mounted on every page that reads that row, so it is what tells `lib/messagepictures.ts`
   * what they chose; the pool page and the conversation then read it without each of them fetching.
   */
  const myPictureChoice = myself?.messagePictures ?? null
  useEffect(() => {
    saySomebodyChose(myPictureChoice)
  }, [myPictureChoice])
  /**
   * AND WHETHER MEDIA A RECORD POINTS AT ARE LOADED. Criterion U5.
   *
   * IT IS ONLY SAID WHEN THE ROW HAS REALLY BEEN READ. `myself === undefined` means the registry
   * read has not answered yet, and telling the store null then would say the row was read and holds
   * no choice — which is how a person who chose `never` would have their media fetched once before
   * the answer arrived. The store keeps that apart from a read row holding no choice, and a report's
   * figure loads nothing until it has been told.
   *
   * A ROW KEPT FROM BEFORE A RELOAD COUNTS AS NOT READ, as it does for the button's picture: it may
   * hold a choice the person has since changed to `never` (round 18 of wave 13w, merge entry
   * jiAOWcnckNYY).
   */
  useEffect(() => {
    if (myself === undefined || !whoReadHere) return
    sayMediaLoad(myself.mediaLoad ?? null)
  }, [myself, whoReadHere])
  const howLinksAreDrawn = useMemo(() => ({ level: linkLevel, layout: linkLayout }), [linkLevel, linkLayout])
  const them = talkingTo === null ? undefined : everybody.get(participantKey(talkingTo))
  // WHERE NO CONVERSATION IS HELD, it is being read, or its read failed and the line says why: the door's short reason
  // when it wrote one, and otherwise the chat's words with the door's sentence after them.
  const unreadHere = talkUnread !== null && talkingTo !== null && talkUnread.key === participantKey(talkingTo) ? talkUnread : null
  /**
   * THE OPEN AGENT'S STATUS, FROM THE CONVERSATION'S ANSWER, read in the same moment as its Cannot reach notice. Null
   * when it could not be read, and when the conversation's read failed with none of this conversation held in this
   * project. Undefined while it is being read.
   */
  const theirStatus = talk !== null && talkingTo !== null && talk.them.kind === talkingTo.kind && talk.them.id === talkingTo.id && talk.workspaceId === destination
    ? (talk.status?.available === true ? talk.status.value : null)
    : unreadHere === null ? undefined : null
  const theirPersonalWords = theirStatus == null ? them?.state ?? null : theirStatus.personal?.text ?? null
  /**
   * THE OPEN CONTACT'S NAME, by the rule every page names a writer by (`theWritersName`), so a contact nobody here answers
   * to is "an agent this page has no name for", as on the pages whose press opened it (wave 13y round 91). "Name
   * unavailable" is said only while the participants have not been read.
   */
  const theirNameWhere = (where: WhereTheNameGoes): string =>
    them?.name ?? (who === null || talkingTo === null ? t('chat.unknownName') : theWritersName({ sentBy: talkingTo, from: null }, known, where))
  const theirName = theirNameWhere('alone')
  /** The same name inside a sentence, where the phrase for an agent nobody here answers to starts lower case (wave 13y round 93). */
  const theirNameInASentence = theirNameWhere('inASentence')
  const noConversationHeld = (
    <p className="px-chat-empty">{unreadHere === null ? t('chat.readingConversation') : unreadHere.reason ?? t('chat.conversationUnread', { why: unreadHere.why })}</p>
  )
  // THE WRITER NOBODY REGISTERED THAT THE HEADING NAMES, or null while the door has not said whether it typed a line.
  const unregisteredShown = withUnregistered === null ? null : theUnregisteredWriterToName(withUnregistered, fromUnregistered)

  /**
   * A STATUS EDITOR CLOSES ON A PRESS OUTSIDE IT, and keeps what was typed as a draft when that is
   * not the line it would replace. The owner could not close the editor at all (25 October 2026, wave
   * 13y round 80).
   */
  useCloseOnOutsidePress(stateEditor, () => {
    setStateDraft(stateTyped === (myself?.state ?? '') ? null : stateTyped)
    setChangingState(false)
  })
  useCloseOnOutsidePress(theirStateEditor, () => {
    setTheirStateDraft(talkingTo === null || theirStateTyped === (theirPersonalWords ?? '') ? null : { who: participantKey(talkingTo), words: theirStateTyped })
    setChangingTheirState(false)
  })

  /**
   * ESCAPE CLOSES AN OPEN STATUS EDITOR AND NOTHING ELSE, wherever the focus is, and drops what was
   * typed. It is heard on the document, which hears a key before the window does, and it says it took
   * the press, so the panel's own Escape on the window leaves the panel open. Before this the box heard
   * Escape only while it had the focus, and the panel closed as well.
   */
  useEffect(() => {
    if (!changingState && !changingTheirState) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (stateEditor.current === null && theirStateEditor.current === null) return
      e.preventDefault()
      setChangingState(false)
      setStateDraft(null)
      setChangingTheirState(false)
      setTheirStateDraft(null)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [changingState, changingTheirState])
  /**
   * WHETHER A PRESS ON THIS PAGE MADE THE AGENT OF THIS CONVERSATION, and nobody has been seen
   * answering as it since (problem T6e9AVCcZyhb). Its press is then held, and the notice says the
   * agent was made here rather than that it cannot be reached. Once this conversation's reading has
   * somebody answering as it, the press is let go.
   */
  const madeOnThisPage = useMadeOnThisPage(talkingTo?.kind === 'agent' ? them?.handle : undefined)
  // THE READING IS THIS CONVERSATION'S OWN, not one left from the conversation open before it.
  const answeringHow = talk !== null && talkingTo !== null && talk.them.kind === talkingTo.kind && talk.them.id === talkingTo.id
    ? talk.answering?.how : undefined
  useEffect(() => {
    if (madeOnThisPage && them !== undefined && answeringHow !== undefined && answeringHow !== 'nobody') letThePressGoFor(them.handle)
  }, [madeOnThisPage, them, answeringHow])
  // THE HEADER'S DOT: its colour and word from the status in the conversation's answer, beside the presence read with
  // it, and the contact list's reading only until that read has landed. See `talkPresence`. It asks for no dot of its
  // own: the conversation's read brings it.
  const theirPresence = talkingTo === null ? undefined : (talkPresence ?? theReadingHeld(talkingTo))
  const theirHeadingPresence = talkingTo?.kind === 'agent' && !isMoleOffice(talkingTo)
    ? theirStatus?.presence.available === true && theirPresence !== undefined
      ? { ...theirPresence, ...theirStatus.presence.value, word: presenceWord(theirStatus.presence.value) }
      : undefined
    : theirPresence
  /** A resident's sleep as its press's door answered, held until the dot's next reading brings the office's own line. */
  const [sleptHere, setSleptHere] = useState<{ agentId: string; line: TheSleepLine } | null>(null)
  useEffect(() => {
    setSleptHere(null)
  }, [theirPresence])
  /**
   * WHO SET THIS AGENT'S LINE, BY NAME, or null because there is nothing to say.
   *
   * Null when nobody recorded a setter — every row written before M21 — and null when the agent set
   * its own, which is what a line with no attribution has always meant. Saying "set by" the agent
   * itself on its own words would be noise on every row.
   */
  /**
   * WHERE PRESSING THEIR PICTURE GOES, or null because there is nobody to open a page about.
   *
   * ---------------------------------------------------------------------------------------
   * IT USED TO OPEN THE RECORD PAGE, AND THE OWNER PRESSED IT ASKING SOMETHING ELSE
   * ---------------------------------------------------------------------------------------
   *
   * Criterion M36 sent this to the agent's record page, and until 6 September that is where it
   * went. The owner reported that day that pressing an agent's picture in the chat led to
   * Everything / Reports and notes, not to a profile page, and that the picture, the name and the
   * other details could not be changed there. The record page answers "what has been
   * written about this agent"; pressing a picture asks "who is this". Criterion M51 gives that
   * question a page, and this is what points at it.
   *
   * IT WORKS FOR A PERSON TOO, which the record address could not: a person has no record. The
   * profile address is built from the kind and the id, which every participant has, so there is no
   * participant this can fail to reach and no case where the picture is drawn without a press.
   */
  const theirProfile: string | null = them === undefined ? null : whoPath(them.kind as ParticipantKind, them.id)

  const theirStateSetter: string | null = (() => {
    const setter = theirStatus == null ? them?.stateBy : theirStatus.personal?.setBy
    if (setter === null || setter === undefined) return null
    if (talkingTo !== null && setter.kind === talkingTo.kind && setter.id === talkingTo.id) return null
    const said = { kind: setter.kind as ParticipantKind, id: setter.id }
    return everybody.get(participantKey(said))?.name ?? unregisteredName({ typed: null, said: said }, 'inASentence')
  })()
  const hasTheirPersonalWords = aStateIsWritten(theirPersonalWords)
  const theirPersonalTitle = t('chat.status.personal') + ': ' + (theirPersonalWords ?? '') +
    (theirStateSetter === null ? '' : ' (' + CHAT_WORDS.lineSetBy(theirStateSetter) + ')')
  const editTheirLine = (): void => {
    setTheirStateTyped(talkingTo !== null && theirStateDraft?.who === participantKey(talkingTo)
      ? theirStateDraft.words : (theirPersonalWords ?? ''))
    setChangingTheirState(true)
  }

  /**
   * WHETHER THE ONE-TO-ONE CONVERSATION IS THE VIEW ON SCREEN. The notices are drawn in the same
   * place as the cannot-reach notice there, and at the top of the panel in every other view.
   */
  const inAConversation =
    inTheGroup === null && withUnregistered === null && reading === null && talkingTo !== null

  /**
   * THE FAILED SENDS WHOSE LETTER WAS STORED ANYWAY, by the record each is about.
   *
   * A person's send to a retired agent answers 409 and keeps the letter (criterion M113a), so the
   * chat draws the stored row once and puts this entry's failed mark on that row instead of on a
   * bubble of its own. Nothing else in the panel reads this map.
   */
  const failedSendsByRecord = new Map<string, PendingSend>()
  for (const p of pendingSends) {
    if (p.state === 'failed' && p.recordId !== null) failedSendsByRecord.set(p.recordId, p)
  }
  /** The stored messages the open conversation is already drawing, so no pending bubble repeats one. */
  const drawnRecords = new Set((talk?.messages ?? []).map((one) => one.id))
  /**
   * AND THE PRESSES THEY CAME FROM (`sendId`). Since 26 September 2026 the event announcing a letter
   * carries it, so the conversation often draws the stored row before the answer to the send arrives.
   * A bubble still being sent whose press is already drawn is not drawn a second time; the entry is
   * kept, because the answer may still say something about it (a send to a retired agent is stored
   * and answered as failed, and that mark goes on the stored row).
   */
  const drawnPresses = new Set((talk?.messages ?? []).map((one) => one.sendId).filter((one): one is string => typeof one === 'string'))

  /** The notices as they are drawn: banners at the top, newest above older ones. */
  const noticeBanners =
    noticesNewestFirst.length === 0 ? null : (
      <div className="px-chat-notices">
        {noticesNewestFirst.map((one) => (
          <p key={one.key} className="px-chat-notice">
            {one.text}
          </p>
        ))}
      </div>
    )

  /**
   * THE CONTACTS, THE GROUPS AND THE CONVERSATIONS BETWEEN AGENTS: the reader's own line at the top, the three
   * tabs and the list under whichever is pressed. The corner draws this where no conversation is open;
   * the page draws it beside the conversation. One drawing for both, so the two cannot differ. A function, so a
   * dot in it is asked for only when it is drawn (`aDotIsDrawn`).
   */
  const findIsShown =
    findScrolledTo || findHasFocus || shownProject !== null || (list === 'contacts' && typedInTheFilter.trim() !== '')
  // THE MOMENT THE ROW STARTS TO SHOW OR HIDE, before the browser paints the list's new height.
  useLayoutEffect(() => {
    findMovedAt.current = performance.now()
  }, [findIsShown])

  const theLists = (): ReactElement => (
            <>
              <div className="px-chat-me">
                {/* THE READER'S OWN PICTURE OPENS THEIR SETTINGS, criterion M36. Pressing
                    their own picture on the chat's outermost screen opens the settings, to set
                    their own profile. It is a press and not a link because the panel is drawn over
                    whatever page the reader is on. The address names the "Your
                    profile" panel, so Settings opens that panel; its one
                    builder is settingsPath, so there is one spelling of it. */}
                {myself === undefined ? null : (
                  <button
                    type="button"
                    className="px-chat-face"
                    aria-label={CHAT_WORDS.yourSettings}
                    title={CHAT_WORDS.yourSettings}
                    onClick={() => {
                      navigate(settingsPath('settings.appearance'))
                    }}
                  >
                    <Avatar
                      kind={myself.kind as ParticipantKind}
                      id={myself.id}
                      name={myself.name}
                      url={myself.avatarUrl}
                      size={28}
                    />
                  </button>
                )}
                <div className="px-chat-me-words">
                  {/* NOTHING ELSE IS DRAWN FOR THE READER'S PRESENCE. There used to be a measured dot
                      here as well as the control below, and the two answered different questions —
                      whether a page of theirs is open, and what they chose — with one drawing. Their
                      choice is the one on the screen. Criterion M20 refined. */}
                  {/* ONE LINE: THE NAME, WHETHER THE READER IS HERE, AND A PENCIL WHILE THERE IS NO STATUS. Wave 13y round
                      113, item 45, which asks for less room at the top of the chat. The status takes a line of its own
                      only when there is one, and with none the pencil opens the same editor the line does. */}
                  <span className="px-chat-me-top">
                    <span className="px-chat-name">{myself?.name ?? ''}</span>
                    {/* WHETHER THE READER IS HERE, WHICH IS THEIR ANSWER AND NOT A MEASUREMENT. A
                        reader is online by default, and can set online, offline or invisible.

                        ONE DOT AND THE WORD, NOT THREE BUTTONS. It was three buttons with one green
                        dot above them, so the dot said green while the reader was invisible and the
                        three took the room of a contact. Since 4 September online, offline and invisible
                        are not three buttons on screen: pressing the green dot shows each dot's colour and
                        its name when a change is wanted. Invisible had been green too. Criterion M20
                        refined. */}
                    {/* THE CONTROL ITSELF IS `WhetherYouAreHere`, and it is one component drawn in
                        three places rather than three drawings of one control. It used to be written
                        out here, so the Settings page and a person's profile page had no way to set
                        this at all. Copying it there would have been the
                        defect CLAUDE.md names; it moved instead, and nothing about the drawing here
                        changed. */}
                    <WhetherYouAreHere
                      choice={myChoice()}
                      tone="quiet"
                      onChoose={(one) => {
                        void savePresence(one)
                      }}
                    />
                    {changingState || hasAState ? null : (
                      <button
                        type="button"
                        className="px-chat-state px-chat-set-state"
                        aria-label={t('chat.setYourStatus')}
                        title={t('chat.setYourStatus')}
                        onClick={startEditingMyState}
                      >
                        {'\u270e'}
                      </button>
                    )}
                  </span>
                  {changingState ? (
                    <div className="px-chat-state-edit" ref={stateEditor}>
                      {/* THE EDITOR HAS ITS OWN WAY OUT. Once "working" is opened
                          for editing, a cross to cancel the edit is needed. There used to be one
                          cross on the panel and it closed the whole panel, so cancelling an edit shut
                          the thing the reader was working in. This one
                          cancels the edit and leaves the line exactly as it was. Criterion M17
                          refined, problem RNpZdXjpMxC_. */}
                      <div className="px-chat-state-row">
                        <input
                          className="px-chat-state-box"
                          value={stateTyped}
                          maxLength={STATE_MAX}
                          aria-label={t('chat.yourState')}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void saveState(stateTyped)
                          }}
                          onChange={(e) => {
                            setStateTyped(e.target.value)
                          }}
                        />
                        <StopEditingTheLine
                          onStop={() => {
                            setChangingState(false)
                            setStateDraft(null)
                          }}
                        />
                      </div>
                      <div className="px-chat-presets">
                        {STATE_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            className="px-chat-preset"
                            onClick={() => {
                              setStateTyped(preset)
                              void saveState(preset)
                            }}
                          >
                            {t(`chat.preset.${preset}`)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : !hasAState ? null : (
                    <button type="button" className="px-chat-state" onClick={startEditingMyState}>
                      <StateWords said={myself?.state ?? ''} />
                    </button>
                  )}
                </div>
              </div>

              {/* THE THREE LISTS, AS THREE TABS ACROSS THE TOP. Contact,
                  group and between agents are three categories side by side at the top, not in one
                  column. One row of three at the
                  top, one list under whichever is pressed. They used to be three headings stacked
                  in one column, so a reader looking for a group scrolled past every contact.
                  Criterion M18. */}
              {/* EVERY TAB CARRIES ITS OWN NUMBER, so the circle can be accounted for from one
                  screen. It could not be: the circle read 24 while the contacts showed 3, and the
                  other 21 were behind the Groups tab, which had no number of its own. The owner was
                  left with a total that could not be found, which is the complaint of 4 September in a smaller
                  form. Problem LZXb_D1SxvNg, criterion M19.

                  AND EACH COUNTS ITS OWN KIND OF THING, criterion M32. Contacts counts messages,
                  Groups counts groups, and the two add up to the circle. Between agents draws no
                  number: nothing in a conversation between two agents is addressed to the reader,
                  and a decision keeps it from being pushed to the owner as new. */}
              <div className="px-chat-tabs" role="tablist" aria-label={CHAT_WORDS.whichList}>
                {LISTS.map((which) => {
                  const waiting = which === 'between' ? 0 : unreadOnTab[which]
                  return (
                    <button
                      key={which}
                      type="button"
                      role="tab"
                      className="px-chat-tab"
                      data-tab={which}
                      id={`px-chat-tab-${which}`}
                      aria-selected={list === which}
                      aria-controls="px-chat-under-tabs"
                      aria-label={
                        waiting === 0 ? undefined : CHAT_WORDS.tabWithUnread(LIST_NAMES[which], waiting)
                      }
                      title={LIST_NAMES[which]}
                      onClick={() => {
                        setList(which)
                      }}
                    >
                      {which === 'contacts' ? <ContactsShape /> : which === 'groups' ? <GroupsShape /> : <BetweenShape />}
                      <span className="sr-only">{LIST_NAMES[which]}</span>
                      {waiting === 0 ? null : (
                        <span className="px-chat-unread" data-counts={which}>
                          {waiting}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* THE PROJECT AND THE FILTER, IN ONE ROW THAT IS HIDDEN UNTIL IT IS WANTED. Wave 13y round 113, item 45:
                  the two share one row, the project as a small block left of the filter, hidden normally and shown
                  when the list is scrolled up. It sits above the list rather than in it, so a scroll
                  up shows it wherever the list is, and a scroll down hides it again.

                  IT STAYS WHILE IT NARROWS THE LIST. Words typed in the filter, or one project chosen, keep it shown, so
                  a narrowed list always says why it is narrowed. It stays while it has the keyboard's focus too, and
                  it can be reached by the keyboard while hidden, which is what shows it.

                  ONE CONTROL FOR THE PROJECT ON ALL THREE TABS: every project, or one by name (wave 13n, 8 October).
                  The list a reader narrowed stays narrowed on the next tab. The filter is the contacts' alone. */}
              <div
                className="px-chat-find"
                data-shown={findIsShown ? 'yes' : 'no'}
                onFocus={() => {
                  setFindHasFocus(true)
                }}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setFindHasFocus(false)
                }}
              >
                <select
                  className="px-chat-project-filter"
                  aria-label={t('chat.projects.filterLabel')}
                  title={t('chat.projects.filterLabel')}
                  value={shownProject ?? ''}
                  onChange={(event) => {
                    const next = event.target.value === '' ? null : event.target.value
                    setChosenProject(next)
                    rememberProjectChoice(next)
                  }}
                >
                  <option value="">{t('chat.projects.all')}</option>
                  {theProjectsToChooseFrom(projects).map((one) => (
                    <option key={one.id} value={one.id}>
                      {projectName(one.id, one.title)}
                    </option>
                  ))}
                  {/* A CHOICE KEPT FROM BEFORE THE PROJECTS WERE READ is applied, and named by what it is. */}
                  {shownProject !== null && projects.length === 0 ? (
                    <option value={shownProject}>{projectName(shownProject)}</option>
                  ) : null}
                </select>
                {list !== 'contacts' ? null : (
                  // THE FILTER NARROWS BY NAME AS ONE TYPES, criterion M124: a reader who searches types into the box,
                  // and one who looks down the list by hand needs no box in the way. The rows held are narrowed at
                  // once, and the door is asked for the same words a moment later.
                  <input
                    type="search"
                    className="px-chat-filter"
                    value={typedInTheFilter}
                    placeholder={t('chat.contact.filterPlaceholder')}
                    aria-label={t('chat.contact.filterLabel')}
                    onChange={(event) => {
                      setTypedInTheFilter(event.target.value)
                    }}
                  />
                )}
              </div>

              <div
                className="px-chat-under-tabs"
                id="px-chat-under-tabs"
                role="tabpanel"
                aria-labelledby={`px-chat-tab-${list}`}
                data-showing={list}
                ref={theListScrolls}
                onClickCapture={event => {
                  const target = event.target
                  pressedContact.current = target instanceof Element ? target.closest<HTMLElement>('.px-chat-contact[data-contact]') : null
                  if (target instanceof Element && target.closest('.px-chat-contact') !== null && pressedContact.current === null) {
                    contactSequence.current += 1
                    setContactWait(null)
                  }
                }}
                onScroll={(event) => {
                  const top = event.currentTarget.scrollTop
                  const was = listWasAt.current
                  listWasAt.current = top
                  // THE LIST GROWS OR SHRINKS AS THE ROW HIDES OR SHOWS, and a list at its foot is moved by that and
                  // not by the reader. What it is moved by while the row settles is not a scroll anybody made.
                  if (performance.now() - findMovedAt.current < FIND_SETTLES_MS) return
                  if (top > was + FIND_SCROLL_PX) showTheFind(false)
                }}
                onWheel={(event) => {
                  // WHERE THE LIST WAS BEFORE THIS WHEEL is `listWasAt`, so the turn that brings the list to its top
                  // does not show the row, and the next one up does. The browser has already moved the list when this
                  // runs, because the wheel is listened to without holding the scroll back; the scroll that reports
                  // the move comes after it.
                  if (event.deltaY < 0 && listWasAt.current < 1) showTheFind(true)
                  else if (event.deltaY > 0) showTheFind(false)
                }}
                onTouchStart={(event) => {
                  touchWasAt.current = event.touches[0]?.clientY ?? null
                }}
                onTouchMove={(event) => {
                  // A FINGER PULLED DOWN IS A SCROLL UP, and it shows the row only on a list that was already at its
                  // top, read as the wheel reads it.
                  const y = event.touches[0]?.clientY
                  if (touchWasAt.current === null || y === undefined) return
                  if (y > touchWasAt.current + FIND_SCROLL_PX * 3) {
                    if (listWasAt.current < 1) showTheFind(true)
                  } else if (y < touchWasAt.current - FIND_SCROLL_PX * 3) showTheFind(false)
                  else return
                  touchWasAt.current = y
                }}
              >
                {/* A LIST NOT READ YET SAYS SO, and never "no contacts". A closed panel reads no list,
                    so the first time it opens each list is on its way; drawing an empty one would
                    say nothing is there when nobody has looked yet. */}
                {shownProject === null || !theListIsEmptyUnderTheChoice ? null : (
                  <p className="px-chat-empty" data-px-none-in-project={shownProject}>
                    {t('chat.projects.noneInThisList', {
                      name: projectName(shownProject, projects.find((one) => one.id === shownProject)?.title),
                    })}
                  </p>
                )}
                {list !== 'contacts' ? null : contacts === null ? (
                  <p className="px-chat-empty">{t('chat.readingContacts')}</p>
                ) : (
                  <ContactsInGroups
                    contacts={(contacts?.contacts ?? []).filter((one) => inTheChosenProject(one, shownProject))}
                    known={projects}
                    narrowed={shownProject !== null}
                    filter={typedInTheFilter}
                    rowsIn={contacts.rowsIn}
                    left={contacts.left}
                    inTheList={contacts.inTheProject ?? contacts.total}
                    onMore={readUnder(contacts, { name: typedInTheFilter, project: shownProject }) ? readTheNextContacts : null}
                    groups={contacts?.contactGroups ?? []}
                    sides={
                      contacts?.contactSides ??
                      CONTACT_SIDES.map((one) => ({ key: one.key, name: one.name, collapsed: false }))
                    }
                    everybody={everybody}
                    readingOf={readingOf}
                    arranging={arranging}
                    draftFor={draftOnARow}
                    now={nowStamp()}
                    onArranging={setArranging}
                    onNewAgent={() => {
                      setSummoning(true)
                    }}
                    onChanged={readTheContacts}
                    onTalkTo={them => {
                      const element = pressedContact.current
                      if (element === null) { setTalkingTo(them); return }
                      // A CONVERSATION READ BEFORE OPENS AT ONCE, as a press with no row in hand does. The effect on
                      // `talkingTo` draws what is held and reads what came meanwhile behind it. Only a first opening waits.
                      if (heldConversation(participantKey(them)) !== null) {
                        contactSequence.current += 1
                        setContactWait(null)
                        setTalkingTo(them)
                        return
                      }
                      const sequence = ++contactSequence.current, project = openTalk.current.project, prior = openTalk.current.key, key = participantKey(them), startedAt = Date.now()
                      setContactWait({ sequence, element, status: 'loading' })
                      void (async () => {
                        talkReadsOut.current += 1
                        try {
                          const before = heldConversation(key)
                          const [value, theirs] = await Promise.all([
                            api.conversationWith(them.kind, them.id, project, whatToAskFor(before)),
                            them.kind === 'agent' && !isMoleOffice(them) ? api.presenceOfOne(them.kind, them.id, project) : Promise.resolve(null),
                          ])
                          if (sequence !== contactSequence.current || openTalk.current.project !== project || openTalk.current.key !== prior || !openNow.current) return
                          const held = heldConversation(key)
                          const newest = aMessageJoinedTheHeldOnes(held, value) ? await api.conversationWith(them.kind, them.id, project, whatToAskFor(null)) : null
                          if (sequence !== contactSequence.current || openTalk.current.project !== project || openTalk.current.key !== prior || !openNow.current) return
                          const next = newest === null ? afterANewerRead(held, value) : afterANewerRead(null, newest)
                          holdConversation(key, next)
                          talkReadStartedAt.current = startedAt
                          talkRequest.current += 1
                          preparedContact.current = key
                          setTalk(next.reply)
                          setTalkPresence(theirs === null ? null : theirs.presence)
                          setFault(null)
                          setTalkUnread(null)
                          setTalkingTo(them)
                          setContactWait({ sequence, element, status: onAPage ? 'ready' : 'gone' })
                        } catch (error: unknown) {
                          if (sequence !== contactSequence.current || openTalk.current.project !== project || openTalk.current.key !== prior || !openNow.current) return
                          setFault(theShortReasonOf(error) ?? errorMessage(error))
                          setContactWait({ sequence, element, status: 'error' })
                        } finally {
                          talkReadsOut.current -= 1
                          talkBeat.current?.settled()
                        }
                      })()
                    }}
                    onOpenUnregistered={setWithUnregistered}
                  />
                )}

                {/* THE GROUPS. A group is not a contact: it has several subscribers and no presence
                    dot, and a reader picking one is picking a conversation rather than somebody to
                    write to. Criterion M11.

                    AND ITS FIRST LEVEL, criterion M123: a "default group" level as the first level
                    in the groups tab, drawn as described for the contacts, with New group beside it
                    and an Edit entry at the far right. Every group from every project sits under
                    `Default group`, in one list narrowed only by the project
                    filter. New group opens one; Edit opens the arrangement
                    the group door can actually perform — taking a member out. Renaming a group is
                    not a door this product has, so no press here pretends it is. */}
                {list !== 'groups' ? null : (
                  <>
                    {/* THE PINNED CATEGORY, DRAWN FIRST. The
                        secretaries' group used to have no category of its own and was not pinned, and took a
                        while to find. Now the
                        office's standing group sits under its own heading at the top, and every other
                        group stays below under `Default group`.
                        THE HEADING NEVER FOLDS. There is no fold press on it, so the one room the
                        office and its secretaries speak to the person in cannot be put away by accident,
                        and the row under it keeps the same unread bold and number as any other. */}
                    {thePinnedGroups.length > 0 ? (
                      <section className="px-chat-top-group" data-side="groups" data-category="pinned">
                        <h3 className="px-chat-top-heading">
                          <span className="px-chat-top-name">{t('chat.contact.secretaryGroup')}</span>
                          {/* THE OFFICE KEEPS THIS GROUP'S MEMBERS ITSELF, so the Edit the category
                              below carries is drawn here disabled, the way the grey New placeholder
                              beside Human is. Its tooltip says why. Criterion M122. */}
                          <button
                            type="button"
                            className="px-chat-edit"
                            disabled
                            title={t('chat.contact.secretaryGroupEditTitle')}
                          >
                            {t('chat.contact.edit')}
                          </button>
                        </h3>
                        {/* THE ONE-ROW LIST IS INSIDE ITS OWN SECTION. Drawn beside the section it
                            was a flex child of the tab and shrank in proportion to the default
                            category's hundreds of rows; inside, the tab scrolls as one area. */}
                        <ul className="px-chat-list">
                          {thePinnedGroups.map((group) => (
                            <AGroupRow
                              key={group.id}
                              group={group}
                              everybody={everybody}
                              known={projects}
                              editing={false}
                              onOpen={setInTheGroup}
                              onChanged={readEverything}
                              keepForUndo={keepGroupForUndo}
                            />
                          ))}
                        </ul>
                      </section>
                    ) : null}
                    <section className="px-chat-top-group" data-side="groups" data-category="default">
                      <h3 className="px-chat-top-heading">
                        <span className="px-chat-top-name">{t('chat.contact.defaultGroup')}</span>
                        {!namingAGroup ? (
                          <button
                            type="button"
                            className="px-chat-new-agent"
                            aria-label={t('chat.contact.addAGroup')}
                            title={t('chat.contact.addAGroup')}
                            onClick={() => {
                              setAGroupName('')
                              setNamingAGroup(true)
                            }}
                          >
                            <AddGroupShape />
                            <span className="sr-only">{t('chat.contact.addAGroup')}</span>
                          </button>
                        ) : (
                          <span className="px-chat-naming">
                            <input
                              type="text"
                              className="px-chat-name-field"
                              value={aGroupName}
                              autoFocus
                              placeholder={t('chat.contact.newGroupPlaceholder')}
                              onChange={(event) => setAGroupName(event.target.value)}
                            />
                            <button
                              type="button"
                              disabled={aGroupName.trim() === ''}
                              onClick={() => void makeAGroup()}
                            >
                              {t('chat.contact.makeIt')}
                            </button>
                            <button type="button" onClick={() => setNamingAGroup(false)}>
                              {t('chat.contact.leaveTheName')}
                            </button>
                          </span>
                        )}
                        <button
                          type="button"
                          className="px-chat-edit"
                          aria-pressed={editingGroups}
                          onClick={() => setEditingGroups(!editingGroups)}
                        >
                          {editingGroups ? t('chat.contact.doneEditing') : t('chat.contact.edit')}
                        </button>
                      </h3>
                      {/* THE DEFAULT CATEGORY'S ROWS ARE INSIDE ITS OWN SECTION, the way the pinned
                          one's are, so the tab scrolls as one area and no list in it has a scroll
                          bar of its own. */}
                      {groupFault === null ? null : (
                        <p className="px-chat-arrange-fault" role="status">
                          {groupFault}
                        </p>
                      )}
                      <ul className="px-chat-list">
                        {theGroupsTheyAreInThatStayOpen.map((group) => (
                          <AGroupRow
                            key={group.id}
                            group={group}
                            everybody={everybody}
                            known={projects}
                            editing={editingGroups}
                            onOpen={setInTheGroup}
                            onChanged={readEverything}
                            keepForUndo={keepGroupForUndo}
                          />
                        ))}
                      </ul>
                    </section>
                    {/* THE GROUPS THE OFFICE OPENED AND THE GROUPS THE READER IS NOT IN, FOLDED UNDER
                        ONE HEADING. Criterion SC1 was amended on 24 September 2026.
                        The amendment was widened the same day: the groups the reader is in that a person or
                        an agent opened are drawn open above. Every group
                        the office opened by itself, the reader's and unread ones included, and every
                        group the reader is not in, waits here, one press away, so nothing is removed and no group is
                        lost. The heading carries how many groups wait inside as a quiet count and
                        not an unread badge (M123), and the whole section is drawn only while it
                        holds a group. */}
                    {theFoldedGroups.length === 0 ? null : (
                      <section className="px-chat-top-group" data-side="groups" data-category="folded">
                        <h3 className="px-chat-top-heading">
                          <button
                            type="button"
                            className="px-chat-fold"
                            aria-expanded={foldOpen}
                            onClick={() => setFoldOpen(!foldOpen)}
                          >
                            <span className="px-chat-fold-arrow" aria-hidden="true">
                              {foldOpen ? '▾' : '▸'}
                            </span>
                            <span className="px-chat-top-name">{t('chat.contact.officeOpenedAndNotYourGroups')}</span>
                            <span className="px-chat-top-count">{theFoldedGroups.length}</span>
                          </button>
                        </h3>
                        {!foldOpen ? null : (
                          <ul className="px-chat-list">
                            {theFoldedGroups.map((group) => (
                              <AGroupRow
                                key={group.id}
                                group={group}
                                everybody={everybody}
                                known={projects}
                                editing={editingGroups}
                                onOpen={setInTheGroup}
                                onChanged={readEverything}
                                keepForUndo={keepGroupForUndo}
                              />
                            ))}
                          </ul>
                        )}
                      </section>
                    )}
                    {groups === null ? <p className="px-chat-empty">{t('chat.readingGroups')}</p> : null}
                  </>
                )}

                {/* THE CONVERSATIONS BETWEEN TWO AGENTS. The tab is drawn whether or not this reader
                    may open them, and a reader who may not is told why. A tab that vanished would
                    leave somebody who had used it wondering where it went. Criterion M12. */}
                {list !== 'between' ? null : between === null || betweenPages.current?.project !== shownProject ? (
                  <p className="px-chat-empty">{t('chat.readingBetween')}</p>
                ) : between.mayRead !== true ? (
                  <p className="px-chat-empty">{between.because}</p>
                ) : (
                  <>
                    <ul className="px-chat-list">
                      {between.conversations.filter((one) => inTheChosenProject(one, shownProject)).map((one) => {
                        const a = everybody.get(participantKey(one.between[0]))
                        const b = everybody.get(participantKey(one.between[1]))
                        const pair = thePairKey(one.between)
                        return (
                          <li key={pair}>
                            <button
                              type="button"
                              className="px-chat-contact"
                              // BOLD WHEN ANYTHING HAS BEEN WRITTEN SINCE THE READER LAST OPENED IT,
                              // criterion M33. The owner's rule covers these rows too: it applies to
                              // the other two lists as well, the groups and the agents' conversations.
                              data-unread={one.anythingNew ? 'yes' : 'no'}
                              onClick={() => {
                                // NEITHER SIDE, criterion M72. The presses in the header take a
                                // viewpoint when the reader wants one.
                                setReading({ pair, asSide: null })
                              }}
                            >
                              <span className="px-chat-contact-words">
                                <span className="px-chat-contact-top">
                                  <span className="px-chat-name">{`${a?.name ?? unregisteredName({ typed: null, said: one.between[0] })} · ${b?.name ?? unregisteredName({ typed: null, said: one.between[1] })}`}</span>
                                  <ProjectMarks projects={one.projects} known={projects} />
                                  {/* HOW MANY MESSAGES OF THIS ONE THE READER HAS NOT READ. Criterion
                                      M71. The between agents list shows a bubble
                                      with each conversation's unread count, each drawn in grey with
                                      that conversation's own count. Grey: this reader is not
                                      in these conversations, so nothing here is waiting on them.
                                      The tab above draws no number, so the
                                      row is the only place this count shows.
                                      IT COUNTS MESSAGES AND NOT SYSTEM LINES. A row bold with no
                                      number is M33 working: a system line marks the row and counts
                                      for nothing. */}
                                  {one.newSince > 0 ? (
                                    <span className="px-chat-unread" data-counts="new">
                                      {one.newSince}
                                    </span>
                                  ) : null}
                                </span>
                                {/* THE SAME WORDS THE OPENED CONVERSATION DRAWS for this message: a line Mole Office
                                    wrote is worded in the page's language from its facts (wave 13n round 41), and a
                                    link is worded as its bubble words it (wave 13y round 146). */}
                                <span className="px-chat-last"><TheLineWithItsLinksInWords line={theLastLineInWords(t, one.last)} /></span>
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                    {betweenPages.current?.next == null ? null : (
                      <button type="button" className="px-chat-between-more" disabled={betweenLoadingMore} onClick={() => {
                        setBetweenLoadingMore(true)
                        readBetweenWhenReady('next')
                      }}>{t(betweenLoadingMore ? 'chat.readingBetween' : 'chat.moreAgentConversations')}</button>
                    )}
                  </>
                )}
              </div>

              {/* AND THE WHOLE POOL, ON ITS OWN PAGE. The panel is three lists of conversations;
                  the page is every message in the project, whoever said it and wherever. The owner
                  asked for it by name after reaching a page that could not be found again, so it is reachable
                  from here. The sidebar no longer has a row for it. So this
                  link is the way to it. Criterion M27. */}
              <p className="px-chat-foot-link">
                <RouteLink to={pathFor('messages')}>{CHAT_WORDS.everyMessage}</RouteLink>
              </p>
            </>
  )

  /**
   * THE CHAT BESIDE THE PAGE AND ITS WINDOW, IN ONE COLUMN OR TWO. Wide enough, it is the chat page's drawing: the lists
   * on the left and the open conversation on the right, or nothing on the right while none is open. Narrower, it is one
   * column: the lists until a conversation is opened, then the conversation, whose back press shows the lists again.
   *
   * THE CONVERSATION STAYS THE SAME ELEMENT across the change, in the same place in the drawing, so the change keeps the
   * conversation open and the place being read in it. Only the lists come and go beside it.
   */
  const theColumns = (): ReactElement => (
    <div className="px-chat-columns" data-columns={twoColumns ? 'two' : 'one'}>
      {twoColumns || conversationOnScreen === null ? <div className="px-chat-columns-lists">{theLists()}</div> : null}
      {twoColumns || conversationOnScreen !== null ? <div className="px-chat-columns-talk" data-empty={twoColumns && conversationOnScreen === null ? 'yes' : undefined}>{twoColumns && conversationOnScreen === null ? t('chat.chooseConversation') : theView()}</div> : null}
    </div>
  )

  /** THE CONVERSATION THAT IS OPEN, whichever of the four kinds it is, or nothing where none is. A function, as `theLists` is. */
  const theView = (): ReactNode => (
          inTheGroup !== null ? (
            <>
              <div className="px-chat-them">
                <button
                  type="button"
                  className="px-chat-back"
                  aria-label={CHAT_WORDS.back}
                  onClick={() => {
                    setInTheGroup(null)
                  }}
                >
                  {'\u2039'}
                </button>
                {/* THE MEMBERS' PICTURES, IN THE HEADER, so a reader can see who can read what they
                    write before they write it. Criterion M11 draws a group as a conversation with
                    several subscribers, and who those are is the one fact a private conversation's
                    header does not have to carry. */}
                <span className="px-chat-faces">
                  {facesInAGroup(theGroup?.group.members ?? [], everybody).map((member) => {
                    const one = everybody.get(participantKey(member.who))
                    return one === undefined ? null : (
                      <Avatar
                        key={participantKey(member.who)}
                        kind={one.kind as ParticipantKind}
                        id={one.id}
                        name={one.name}
                        url={one.avatarUrl}
                        size={24}
                      />
                    )
                  })}
                </span>
                <div className="px-chat-them-words">
                  <span className="px-chat-them-top">
                    <span className="px-chat-name">{theGroup?.group.name ?? ''}</span>
                  </span>
                  <span className="px-chat-them-state">
                    {GROUP_WORDS.memberCount(theGroup?.group.members.length ?? 0)}
                  </span>
                </div>
              </div>
              {/* SAID ONLY WHEN THE READER IS NOT IN IT. A person may read a group they are not in
                  (M12), and what they may not do is take part in it — so the sentence is drawn and
                  the composer is not. */}
              {theGroup !== null && !theGroup.yours ? (
                <p className="px-chat-watching">{GROUP_WORDS.readingSomebodyElses}</p>
              ) : null}
              {/* THE CONVERSATION IS ONE TIMELINE: THE MESSAGES AND THE JOINS TOGETHER, AT THEIR
                  TIME. A join reads like the office's own
                  short system line; an amendment puts it here, at its time
                  among the messages, rather than in a block above them. `theTimelineOfAGroup` is the
                  one place that order is worked out. A join is drawn from the membership row's own
                  `joined_at` and `joined_because`, so no record is rewritten. */}
              <ol {...theMessageList}>
                {/* A LINE THAT HOLDS FOLDED LINES STANDS AT THE TIME OF THE OLDEST OF THEM (`whenItStands`), so
                    the opened lines read in time order among the joins and the messages around them. */}
                {theTimelineOfAGroup(
                  theFolds.shown.map((one) => ({ ...one, sentAt: whenItStands(one, theFolds.under) })),
                  theGroup?.group.members ?? [],
                ).map((entry) => {
                  // A JOIN IS ONE SHORT TIMED LINE, MARKED SO A READER OF THE PAGE CAN TELL IT FROM
                  // THE OFFICE'S OTHER LINES. Its reason is the membership row's own sentence, kept
                  // as the block's hover text.
                  if (entry.kind === 'join') {
                    const one = everybody.get(participantKey(entry.member.who))
                    return (
                      <li
                        key={`join:${participantKey(entry.member.who)}`}
                        className="px-chat-system"
                        data-joined="yes"
                      >
                        <ASystemBlock
                          at={entry.member.joinedAt}
                          said={GROUP_WORDS.memberJoined(
                            theNameBesideItsDate(one?.name ?? unregisteredName({ typed: null, said: entry.member.who }), one?.retiredAt),
                            entry.member.joinedBecause,
                          )}
                        />
                      </li>
                    )
                  }
                  const one: PoolEntry = entry.message
                  const sender = theSenderOf(one.sentBy)
                  const mine =
                    me !== null && one.sentBy !== null && one.sentBy.kind === me.kind && one.sentBy.id === me.id
                  // THE OFFICE'S OWN LINES ARE THE SYSTEM BLOCKS. Criterion M26 asks for the line
                  // saying how the group was opened at the top of the messages; it is a message
                  // written the moment the group is, and the timeline places it by its own time.
                  if (isASystemLine(one)) {
                    // THE LINE AS WRITTEN, not the copy placed at its folded lines' time, so its words say when it was written.
                    return (
                      <SystemLine
                        key={one.id}
                        said={theFolds.shownById.get(one.id) ?? one}
                        folded={theFolds.under.get(one.id)}
                        lead={<Where entry={one} titles={titles} projects={projects} here={here} fromName={whoFirstSentIt(one, known)} />}
                      />
                    )
                  }
                  return (
                    <li key={one.id} className="px-chat-one" data-mine={mine ? 'yes' : 'no'} data-message-id={one.id} {...theMessagesOwnTarget(one)}>
                      {sender === undefined ? null : (
                        <Avatar
                          kind={sender.kind as ParticipantKind}
                          id={sender.id}
                          name={sender.name}
                          url={sender.avatarUrl}
                          size={24}
                        />
                      )}
                      <div className="px-chat-bubble">
                        {/* WHO SAID IT, ABOVE THE WORDS. In a group the picture alone is not enough:
                            several people write here and a reader following a conversation needs the
                            name beside the words rather than only in a tooltip. */}
                        {/* AND WHERE NOBODY HERE ANSWERS TO THE SENDER, IT SAYS SO, and draws no id as a name. */}
                        {mine ? null : <div className="px-chat-typed">{theWritersName(one, known)}</div>}
                        <OrderedMessage entry={one} titles={titles} ofMessage={one} flags={myFlags} />
                        {/* AND THE PICTURES IT CARRIES, criterion M64. Under the words, because a
                            picture is what the words are about. How it is drawn -- shown, shown after
                            a press, or the path alone -- is this browser's answer and is decided in
                            one place, so the four conversations here and the pool page cannot draw
                            one message three different ways. */}
                        <MessagePictures pictures={one.pictures} inProject={one.workspaceId} ofMessage={one.id} />
                        <Where entry={one} titles={titles} projects={projects} here={here} fromName={theWritersName(one, known)} />
                        <div className="px-chat-foot">
                          <IntentOnIt intent={one.intent} whatTheMarkAsks={one.whatTheMarkAsks} flags={myFlags} />
                          <LabelOnIt label={one.label} />
                          <MarkedPartsFoot entry={one} />
                          <Urgent said={one} />
                          <RanBy ranBy={one.ranBy} />
                          {theFromLineOf(theFolds.shown, one)}
                          <When at={one.sentAt} />
                          <EditedMark edited={one.edited} />
                          {mine && theGroup !== null ? <EditPress id={one.id} body={one.body} markedParts={one.markedParts ?? []} until={one.wordsMayChangeUntil} onSaved={() => { void readTheGroup(theGroup.group.id) }} /> : null}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
              {newBelowMark}


              {theGroup?.yours === true ? (
                <>
                  {/* A PICTURE GOES TO A GROUP THE WAY IT GOES TO ONE PERSON, criterion M65. The
                      same composer draws for both, so a picture chosen and then sent to a group
                      without it would be a loss with nothing saying it had happened. */}
                  <TheBox draftKey={draftHereKey}>
                    {(typed) => (
                  <>
                  <KeyQuestion question={keyQuestion} onChangeIt={selectTheKey} />
                  <PictureToSendRow held={picture} words={typed} />
                  {/* THE SAME ROW AS ONE PERSON'S: the box across the row, and the presses beneath it. A group has no quote
                      press, as before. */}
                  <div className="px-chat-write" {...picture.dropOn}>
                    <GrowingBox
                      value={typed}
                      placeholder={CHAT_WORDS.composerPlaceholder}
                      onChange={typeInTheBox}
                      select={pieceToSelect}
                      markedParts={offersAMark ? keptParts : []}
                      flags={offersAMark ? myFlags : null}
                      onSelectWords={(from, to) => { wordsSelectedInTheBox.current = { from, to } }}
                      onSend={() => {
                        void sendToTheGroup()
                      }}
                    />
                    <div className="px-chat-presses">
                      <AttachPress held={picture} />
                      <div className="px-chat-sender">
                        {theSelector}
                        <button
                          type="button"
                          className="px-chat-send"
                          disabled={!canSendNow(typed)}
                          aria-label={CHAT_WORDS.send}
                          title={CHAT_WORDS.send}
                          onClick={() => {
                            void sendToTheGroup()
                          }}
                        >
                          <SendShape />
                          <span className="sr-only">{CHAT_WORDS.send}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                  {theMarkNotes}
                  </>
                    )}
                  </TheBox>
                </>
              ) : null}
              {theGroup === null || me === null ? null : (
                <div className="px-chat-leave">
                  <TieredPress key={theGroup.group.id} tier="undo" available={theGroup.yours}
                    windowMs={CHAT_UNDO_MS} press={GROUP_WORDS.leave} pending={t('chat.leaving')}
                    done={t('chat.groupLeft')} undo={undoSeconds} undoing={t('chat.undoing')}
                    onPress={async () => {
                      const id = theGroup.group.id
                      const who = me
                      await api.leaveGroup(id, who)
                      await readTheGroup(id)
                      await readEverything()
                      return { remainingMs: CHAT_UNDO_MS, undo: async () => {
                        await rejoinGroup(id, who)
                        await readTheGroup(id)
                        await readEverything()
                      } }
                    }}
                  />
                </div>
              )}
            </>
          ) : withUnregistered !== null ? (
            <>
              {/* A CONVERSATION WITH A WRITER NOBODY REGISTERED. It has one side. There is no
                  composer under it, because there is nothing behind the name to deliver to.
                  Criterion M25. */}
              <div className="px-chat-them">
                <button
                  type="button"
                  className="px-chat-back"
                  aria-label={CHAT_WORDS.back}
                  onClick={() => {
                    setWithUnregistered(null)
                  }}
                >
                  {'\u2039'}
                </button>
                <div className="px-chat-them-words">
                  <span className="px-chat-them-top">
                    <span className="px-chat-name">{unregisteredShown === null ? null : unregisteredName(unregisteredShown)}</span>
                    <span className="px-chat-unregistered">{CHAT_WORDS.unregistered}</span>
                  </span>
                </div>
              </div>
              {/* THE PARAGRAPH SAYS WHAT THE NAME ABOVE IS, so it says the writer typed none when the heading says it left no name. */}
              {unregisteredShown === null ? null : (
                <p className="px-chat-watching">
                  {theLineAnUnregisteredWriterTyped(unregisteredShown) === null ? CHAT_WORDS.unregisteredIsNoName : CHAT_WORDS.unregisteredIs}
                </p>
              )}
              <ol {...theMessageList}>
                {(fromUnregistered?.messages ?? []).map((one: PoolEntry) => (
                  <li key={one.id} className="px-chat-one" data-mine="no" {...theMessagesOwnTarget(one)}>
                    <div className="px-chat-bubble">
<OrderedMessage entry={one} titles={titles} ofMessage={one} flags={myFlags} />
                      {/* AND THE PICTURES IT CARRIES, criterion M64. Under the words, because a
                          picture is what the words are about. How it is drawn -- shown, shown after
                          a press, or the path alone -- is this browser's answer and is decided in
                          one place, so the four conversations here and the pool page cannot draw
                          one message three different ways. */}
                      <MessagePictures pictures={one.pictures} inProject={one.workspaceId} ofMessage={one.id} />
                      {/* AND WHERE IT POINTS, if it points anywhere. Drawing one screen's messages
                          with less than another screen draws for the same message is what problem
                          8PujMi9Uwqxz was. */}
                      <Where entry={one} titles={titles} projects={projects} here={here} fromName={theWritersName(one, known)} />
                      <div className="px-chat-foot">
                        <IntentOnIt intent={one.intent} whatTheMarkAsks={one.whatTheMarkAsks} flags={myFlags} />
                        <LabelOnIt label={one.label} />
                        <Urgent said={one} />
                          <RanBy ranBy={one.ranBy} />
                          <WrittenFrom said={one} />
                        <When at={one.sentAt} />
                        <EditedMark edited={one.edited} />
                      </div>
                      {/* THE LONG ROUTED NOTE IS BEHIND THIS SHORT MARK NOW. The message says it was not
                          delivered in one short grey line, in place of the long notes, and Developer detail
                          opens the same words. */}
                      <NotDeliveredLine routed={one.routed} viewer={me} sentBy={one.sentBy} />
                    </div>
                  </li>
                ))}
              </ol>
              {newBelowMark}

            </>
          ) : reading !== null && pairRefused !== null && pairRefused.reading === reading ? (
            // A PAIR WHOSE READ WAS REFUSED says why and the way back, and nothing else. Its heading and side buttons
            // above an empty list held nothing to read (wave 13y round 95, item 26). The press says what the back arrow
            // says to a screen reader.
            <div className="px-chat-refused">
              <p className="px-chat-refused-why">{pairRefused.reason}</p>
              <button
                type="button"
                className="px-chat-refused-back"
                onClick={() => {
                  setReading(null)
                }}
              >
                {CHAT_WORDS.back}
              </button>
            </div>
          ) : reading !== null ? (
            <>
              <div className="px-chat-them">
                <button
                  type="button"
                  className="px-chat-back"
                  aria-label={CHAT_WORDS.back}
                  onClick={() => {
                    setReading(null)
                  }}
                >
                  {'\u2039'}
                </button>
                <div className="px-chat-them-words">
                  <span className="px-chat-them-top">
                    <span className="px-chat-name">{CHAT_WORDS.betweenAgents}</span>
                  </span>
                  {/* WHOSE VIEW THIS IS BEING READ FROM. Criterion M72: both sides in one view is
                      the first press and the one a row opens in, and the two viewpoints stay beside
                      it for the reader who wants one. */}
                  <span className="px-chat-sides">
                    <button
                      type="button"
                      className="px-chat-side"
                      aria-pressed={reading.asSide === null}
                      data-chosen={reading.asSide === null ? 'yes' : 'no'}
                      onClick={() => {
                        setReading({ pair: reading.pair, asSide: null })
                      }}
                    >
                      {CHAT_WORDS.bothSides}
                    </button>
                    {reading.pair.split('~').map((side) => (
                      <button
                        key={side}
                        type="button"
                        className="px-chat-side"
                        aria-pressed={reading.asSide === side}
                        data-chosen={reading.asSide === side ? 'yes' : 'no'}
                        onClick={() => {
                          setReading({ pair: reading.pair, asSide: side })
                        }}
                      >
                        {CHAT_WORDS.asSide(
                          everybody.get(participantKey({ kind: 'agent', id: side }))?.name ??
                            unregisteredName({ typed: null, said: { kind: 'agent', id: side } }, 'inASentence'),
                        )}
                      </button>
                    ))}
                  </span>
                </div>
              </div>
              <p className="px-chat-watching">
                {reading.asSide === null ? CHAT_WORDS.readingBothSides : CHAT_WORDS.readingSomebodyElses}
              </p>
              {/* WHEN THE READER LAST OPENED THIS ONE, from the durable record of the read. Null is
                  drawn as its own sentence rather than as nothing: "you have not read this before"
                  is an answer, and an empty space is a reader wondering. Criterion M12, problem
                  xdcPntH9rxw_. */}
              {asSide === null ? null : (
                <p className="px-chat-read-before">
                  {asSide.readBefore === null
                    ? CHAT_WORDS.firstTimeReadingThis
                    : asSide.readBefore.asSide === NEITHER_SIDE
                      ? CHAT_WORDS.youReadThisBeforeAsNeither(asSide.readBefore.at)
                      : CHAT_WORDS.youReadThisBefore(
                          everybody.get(participantKey({ kind: 'agent', id: asSide.readBefore.asSide }))?.name ??
                            (inspect
                              ? asSide.readBefore.asSide
                              : unregisteredName({ typed: null, said: { kind: 'agent', id: asSide.readBefore.asSide } }, 'inASentence')),
                          asSide.readBefore.at,
                        )}
                </p>
              )}
              <ol {...theMessageList}>
                {asSide?.page?.olderRemain === true ? <li><button type="button" className="px-chat-between-older" onClick={readOlderPair}>{t('messagePages.olderMessages')}</button></li> : null}
                {(asSide?.messages ?? []).map((one: PoolEntry) => {
                  if (isASystemLine(one)) return <SystemLine key={one.id} said={one} />
                  const sender = theSenderOf(one.sentBy)
                  // NEITHER SIDE IS MINE IN THE NEUTRAL VIEW. Criterion M72: a reader taking no
                  // viewpoint is not one of these two, so nothing is drawn as theirs.
                  const mine = reading.asSide !== null && one.sentBy !== null && one.sentBy.id === reading.asSide
                  return (
                    <li key={one.id} className="px-chat-one" data-mine={mine ? 'yes' : 'no'} {...theMessagesOwnTarget(one)}>
                      {sender === undefined ? null : (
                        <Avatar kind={sender.kind as ParticipantKind} id={sender.id} name={sender.name} url={sender.avatarUrl} size={24} />
                      )}
                      <div className="px-chat-bubble">
                        {/* WHO WROTE IT, ON THE BUBBLE, while neither side is drawn as the reader's.
                            Without it both agents are on the same side of the view and only the
                            small picture tells them apart. */}
                        {reading.asSide === null ? <span className="px-chat-who">{theWritersName(one, known)}</span> : null}
<OrderedMessage entry={one} titles={titles} ofMessage={one} flags={myFlags} />
                        {/* AND THE PICTURES IT CARRIES, criterion M64. Under the words, because a
                            picture is what the words are about. How it is drawn -- shown, shown after
                            a press, or the path alone -- is this browser's answer and is decided in
                            one place, so the four conversations here and the pool page cannot draw
                            one message three different ways. */}
                        <MessagePictures pictures={one.pictures} inProject={one.workspaceId} ofMessage={one.id} />
                        <div className="px-chat-foot">
                          <IntentOnIt intent={one.intent} whatTheMarkAsks={one.whatTheMarkAsks} flags={myFlags} />
                          <LabelOnIt label={one.label} />
                          <Urgent said={one} />
                          <RanBy ranBy={one.ranBy} />
                          <WrittenFrom said={one} />
                          <When at={one.sentAt} />
                          <EditedMark edited={one.edited} />
                        </div>
                        {/* THE LONG ROUTED NOTE IS BEHIND THIS SHORT MARK NOW. The third person's copy says it
                            was not delivered in one short grey line, in place of the long notes, and Developer
                            detail opens the same words. */}
                        <NotDeliveredLine routed={one.routed} viewer={me} sentBy={one.sentBy} />
                      </div>
                    </li>
                  )
                })}
              </ol>
              {newBelowMark}

            </>
          ) : talkingTo !== null && isMoleOffice(talkingTo) ? (
            <>
              <div className="px-chat-them">
                <button type="button" className="px-chat-back" aria-label={CHAT_WORDS.back} onClick={() => setTalkingTo(null)}>{'‹'}</button>
                <span className="px-chat-name">{MOLE_OFFICE_NAME}</span>
              </div>
              <p className="px-chat-office-notices">{t('w13q.upgrades.chatReadOnly')}</p>
              <ol {...theMessageList} data-office-notices="yes">
                {(talk?.messages ?? []).map((one) => isASystemLine(one)
                  ? <SystemLine key={one.id} said={one} />
                  : <li key={one.id} className="px-chat-one" {...theMessagesOwnTarget(one)}><Body text={one.body} message={one} /></li>)}
              </ol>
              {newBelowMark}
              {talk === null ? noConversationHeld : null}
            </>
          ) : talkingTo === null ? null : (
            <>
              <div className="px-chat-them">
                <button
                  type="button"
                  className="px-chat-back"
                  aria-label={CHAT_WORDS.back}
                  onClick={() => {
                    setTalkingTo(null)
                  }}
                >
                  {'‹'}
                </button>
                {/* THEIR PICTURE OPENS THEIR PROFILE PAGE, criterion M51. The owner reported on 6
                    September that pressing an agent's picture in the chat did not lead to a profile
                    page. It used to open the agent's record page,
                    which is a list of records rather than a page about who somebody is. Every
                    participant has a profile address, so this is never drawn without a press. */}
                {them === undefined || theirProfile === null ? null : (
                  <button
                    type="button"
                    className="px-chat-face"
                    aria-label={CHAT_WORDS.theirPage(them.name)}
                    title={CHAT_WORDS.theirPage(them.name)}
                    onClick={() => {
                      navigate(theirProfile)
                    }}
                  >
                    <Avatar kind={them.kind as ParticipantKind} id={them.id} name={them.name} url={them.avatarUrl} size={32} />
                  </button>
                )}
                <div className="px-chat-them-words">
                  <span className="px-chat-them-top">
                    <Dot reading={theirHeadingPresence} />
                    <span className="px-chat-name">{theirName}</span>
                    {/* NOBODY'S MISSING LINE IS A DASH: a pencil beside the name opens the editor instead, for a person as
                        for an agent (wave 13y round 113, item 45). */}
                    {!hasTheirPersonalWords && !changingTheirState ? (
                      <button type="button" className="px-chat-edit-personal" title={t('chat.status.addPersonal')}
                        aria-label={CHAT_WORDS.theirLine(theirNameInASentence)} onClick={editTheirLine}>{'✎'}</button>
                    ) : null}
                    {talkingTo.kind === 'agent' && !isMoleOffice(talkingTo) ? (
                      <span className="px-chat-presence-word">{theirStatus === undefined ? t('chat.status.reading') : theirStatus?.presence.available ? presenceWord(theirStatus.presence.value) : t('chat.status.couldNotBeRead')}</span>
                    ) : null}
                    {/* THE NEWER OF TWO AGENTS THAT SHARE A NAME, marked beside the name and not in it
                        (problem hqbovBMnTu-z). The server says which one is newer. */}
                    {them?.newerOfASharedName === true ? (
                      <span className="px-chat-newer" title={t('chat.newerOfASharedName.title')}>{t('chat.newerOfASharedName')}</span>
                    ) : null}
                    {/* WHICH MIND IS ANSWERING AS THIS AGENT NOW. Criterion H3: the session the person has
                        open answers as itself and carries everything said in that terminal; a run is
                        a fresh process that knows only what Mole Office handed it. The whole
                        sentence is the hover text, because there is room for three words here.

                        NOTHING IS DRAWN HERE WHEN NOBODY IS ANSWERING. Criterion M117: that fact is
                        drawn once, in the red-bordered box below this header, so the header does not
                        repeat it as plain text. The two answering states are still named here. */}
                    {/* "REPLYING" IS DRAWN ONLY WHILE THE AGENT HOLDS WORDS TO THIS READER that it has not sent yet: a
                        turn draft, which Mole Office sends at the end of the agent's turn (`replying` on the
                        conversation's reply). A run that serves the agent and holds nothing draws nothing here, except
                        in inspect, which names the mind as before. */}
                    {!inspect && talk?.replying === true ? (
                      <span className="px-chat-answering" title={t('chat.replying.title', { minutes: A_PERSONS_TURN_DRAFT_GOES_WITHIN_MINUTES })}>{t('chat.replying')}</span>
                    ) : talk?.answering == null || talk.answering.how === 'nobody' || (talk.answering.how === 'a run' && !inspect) ? null : (
                      <span className="px-chat-answering" title={talk.answering.says}>
                        {CHAT_WORDS.answeringNow[talk.answering.how]}
                      </span>
                    )}
                  </span>
                  {/* A SECRETARY'S ONE-LINE DUTY, directly under the name (wave 13y round 86, item 12). Nothing for anybody else yet.
                      Two lines of a longer duty, and a press for the rest (wave 13y round 113, item 45). */}
                  <TheDutyLine who={talkingTo} folds />
                  {/* A PERMANENT RESIDENT'S SLEEP, from the header dot's own reading. On its own
                      line under the name: beside it, the narrow chat cut both the name and the line short. */}
                  <SleepLine reading={sleptHere !== null && talkingTo !== null && sleptHere.agentId === talkingTo.id ? { residentSleep: sleptHere.line } : theirPresence} />
                  {/* ITS SLEEP AND WAKE PRESSES, beside its sleep line, for the person, from
                      round 47. The door also lets the resident itself press them, and only the
                      resident postpones a sleep; a chat is never the resident's conversation with itself, so here they
                      are the person's alone. */}
                  {talkingTo?.kind === 'agent' && theirPresence?.residentSleep !== undefined && me?.kind === 'person' ? (
                    <SleepPresses
                      agentId={talkingTo.id}
                      asleep={(sleptHere !== null && sleptHere.agentId === talkingTo.id ? sleptHere.line : theirPresence.residentSleep).asleepSince !== null}
                      may={{ sleepAndWake: true, postpone: false }}
                      onDone={(sleep) => {
                        setSleptHere({ agentId: talkingTo.id, line: theLineAfterAPress(sleep) })
                      }}
                    />
                  ) : null}
                  {/* THEIR LINE, AND THE PERSON'S HAND ON IT. Decision lUh6uis7oB6z keeps
                      the person's power to set it, and makes the line a mark like reporting or
                      working, not offline or online. The agent may
                      still write its own; when somebody else wrote it, the line says who.
                      Criterion M21. */}
                  {changingTheirState ? (
                    <div className="px-chat-state-edit" ref={theirStateEditor}>
                      <div className="px-chat-state-row">
                        <input
                          className="px-chat-state-box"
                          value={theirStateTyped}
                          maxLength={STATE_MAX}
                          aria-label={CHAT_WORDS.theirLine(theirNameInASentence)}
                          autoFocus
                          onChange={(e) => {
                            setTheirStateTyped(e.target.value)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (theirStateTyped.trim() === '') {
                                e.currentTarget.closest('.px-chat-state-edit')?.querySelector<HTMLButtonElement>('.tiered-press > button')?.click()
                              } else void saveTheirState(theirStateTyped)
                            }
                          }}
                        />
                        <StopEditingTheLine
                          onStop={() => {
                            setChangingTheirState(false)
                            setTheirStateDraft(null)
                          }}
                        />
                      </div>
                      <div className="px-chat-presets">
                        {STATE_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            className="px-chat-preset"
                            onClick={() => {
                              void saveTheirState(preset)
                            }}
                          >
                            {t(`chat.preset.${preset}`)}
                          </button>
                        ))}
                        <TieredPress tier="undo" available={theirPersonalWords !== null} windowMs={CHAT_UNDO_MS}
                          press={CHAT_WORDS.clearTheirLine} pending={t('chat.clearing')}
                          done={t('chat.lineCleared')} undo={undoSeconds} undoing={t('chat.undoing')}
                          onPress={async () => {
                            const who = talkingTo
                            const words = theirPersonalWords ?? ''
                            try {
                              await api.changeParticipant(who.kind, who.id, { state: '', stateWas: words })
                            } catch (error) {
                              if (faultOf(error)?.status === 409) throw new Error(t('chat.lineCannotClear'))
                              throw error
                            }
                            setTheirStateTyped('')
                            await readAfterWritingALine()
                            return { remainingMs: CHAT_UNDO_MS, undo: async () => {
                              try {
                                await api.changeParticipant(who.kind, who.id, { state: words, stateWas: null })
                              } catch (error) {
                                if (faultOf(error)?.status === 409) throw new Error(t('chat.lineChanged'))
                                throw error
                              }
                              setTheirStateTyped(words)
                              await readAfterWritingALine()
                            } }
                          }}
                        />
                      </div>
                    </div>
                  ) : !hasTheirPersonalWords ? null : (
                    <button
                      type="button"
                      className="px-chat-them-state px-chat-state"
                      data-stale={theirPresence?.stateMayBeStale === true ? 'yes' : 'no'}
                      aria-label={CHAT_WORDS.theirLine(theirNameInASentence)}
                      title={theirPersonalTitle}
                      onClick={editTheirLine}
                    >
                      {talkingTo.kind === 'agent' ? <span>{t('chat.status.personal')}{': '}</span> : null}
                      <StateWords said={theirPersonalWords ?? ''} />
                      {/* THE SETTER'S SENTENCE STAYS WHOLE in its own span, as on every other line that says who set
                          it; the heading's parentheses go round that span, in the same small type. */}
                      {theirStateSetter === null ? null : (
                        <span className="px-chat-state-setter">{' ('}<span className="px-chat-state-by">{CHAT_WORDS.lineSetBy(theirStateSetter)}</span>{')'}</span>
                      )}
                    </button>
                  )}
                  {talkingTo.kind === 'agent' && !isMoleOffice(talkingTo) ? <ChatFlowLine status={theirStatus} project={destination} /> : null}
                </div>
              </div>

              {/* THE NOTICES, DRAWN WITH THE CANNOT-REACH NOTICE, at the boundary between the
                  agent's header and the messages. A notice about
                  the chat's own state is a banner at the top, never a line under the composer. */}
              {noticeBanners}

              {/* NOTHING IS ANSWERING AS THIS AGENT, AND THE PRESS THAT STARTS ONE. Criterion M117
                  puts the notice at the boundary between the agent's header and the messages;
                  criterion M116 puts the offer back beside it. On 12 September 2026 the owner
                  asked to keep the offer to start a new run when a message sent in the chat finds that
                  Mole Office cannot reach the agent, and noted that this offer had disappeared. A send to this agent came back with nothing able to answer as it (the
                  conversation's own `answering` reading, and the reply has no reach refusal for the
                  person), so the offer is drawn here, once, and never for an agent that is
                  reachable. The press and its dialogue are the one component the contact row and
                  the right-click menu also draw. */}
              {talkingTo.kind !== 'agent' || talk?.answering?.how !== 'nobody' ? null : (
                <p className="px-chat-cannot-reach">
                  {/* COULD NOT TELL IS NOT CANNOT REACH. The server decides the three answers once
                      (whatAReadingSaysOfReach) and the conversation's reply carries the third as
                      couldNotTell; Cannot reach is said only when the office knows (problem
                      TOoUy7fMbg1P). */}
                  <span className="px-chat-cannot-reach-words" data-could-not-tell={talk?.couldNotTell === true ? 'yes' : 'no'}
                    data-made-here={madeOnThisPage ? 'yes' : 'no'}>
                    {talk?.couldNotTell === true
                      ? t('notesFixes.chat.couldNotTell', { who: theirNameInASentence })
                      : madeOnThisPage
                      ? t('newAgentKeys.madeHere', { who: theirName })
                      : CANNOT_REACH_WORDS.cannotReach(theirNameInASentence)}
                  </span>
                  {/* THE PRESS ONLY WHERE IT WOULD CARRY SOMETHING. After the press carried what was
                      waiting, the agent still cannot be reached, so the line stays, and a second press
                      would make nothing, so it is not offered (problem hqbovBMnTu-z). The server answers
                      with the press's own reading (pressWouldCarry above). */}
                  {pressWouldCarry !== null && pressWouldCarry.key === participantKey(talkingTo) && !pressWouldCarry.carries ? null : (
                    <StartANewAgent
                      key={talkingTo.id}
                      agentId={talkingTo.id}
                      handle={them?.handle ?? ''}
                      workspaceId={destination}
                      name={theirNameInASentence}
                      where="the conversation"
                      onDone={() => {
                        void readTheTalk(talkingTo)
                      }}
                      follow={openTheNewAgent}
                    />
                  )}
                </p>
              )}

              <ol {...theMessageList}>
                {(talk?.messages ?? []).map((one: PoolEntry) => {
                  // A LINE MOLE OFFICE WROTE ABOUT THIS CONVERSATION, not a message in it: a run
                  // stopped waiting (M22), a restart cut a run off (M24). Criterion M26.
                  if (isASystemLine(one)) {
                    return (
                      <SystemLine
                        key={one.id}
                        said={one}
                        lead={<Where entry={one} titles={titles} projects={projects} here={here} fromName={whoFirstSentIt(one, known)} />}
                      />
                    )
                  }
                  const sender = theSenderOf(one.sentBy)
                  const mine = me !== null && one.sentBy !== null && one.sentBy.kind === me.kind && one.sentBy.id === me.id
                  const theirMark = one.deliveries.find((d) => d.to.kind === talkingTo.kind && d.to.id === talkingTo.id)
                  // A CARRIED DELIVERY'S SENTENCE IS BUILT FROM THE STORED FACTS by the builder the visible carried
                  // line below uses, in the page's language. Any other row keeps its own sentence.
                  const theirBecause = (() => {
                    if (theirMark === undefined) return null
                    const fact = (one.carriedTo ?? []).find((carried) => carried.from === theirMark.to.id)
                    return fact === undefined ? theirMark.because : theCarriedWords(t, fact, fact.toHandle).sentence
                  })()
                  // A LETTER THAT WAS STORED AND STILL FAILED, so this row carries the failed mark
                  // instead of a bubble of its own. It follows criterion M113a and a decision.
                  const failedSend = failedSendsByRecord.get(one.id) ?? null
                  const theNext =
                    one.id !== newestWaiting || failedSend !== null
                      ? null
                      : (theirBecause ?? talk?.whatHappensToAWaitingMessage ?? null)
                  // THE NOBODY-ANSWERING READING NOW LIVES BEHIND THE SHORT MARK, because it is one of the
                  // long paragraphs the chat no longer draws. A worker's own reason is not that reading, so
                  // it is still drawn under its message.
                  const nobodyNote = theNext !== null && theirBecause === null && talk?.answering?.how === 'nobody'
                  return (
                    <li key={one.id} className="px-chat-one" data-mine={mine ? 'yes' : 'no'} data-sent-press={mine ? one.sendId ?? undefined : undefined} {...theMessagesOwnTarget(one)}>
                      {sender === undefined ? null : (
                        <Avatar kind={sender.kind as ParticipantKind} id={sender.id} name={sender.name} url={sender.avatarUrl} size={24} />
                      )}
                      <div className="px-chat-bubble">
                        {/* A GROUP REPLY THAT @s THE PERSON IS DRAWN HERE TOO, criterion GM2. The one
                            line says which group it came from and opens that group at it. */}
                        {one.toGroup === null ? null : (
                          <FromTheGroup
                            groupId={one.toGroup}
                            messageId={one.id}
                            name={groups?.groups.find((group) => group.id === one.toGroup)?.name ?? t('chat.unknownGroup')}
                          />
                        )}
<OrderedMessage entry={one} titles={titles} ofMessage={one} flags={myFlags} />
                        {/* AND THE PICTURES IT CARRIES, criterion M64. Under the words, because a
                            picture is what the words are about. How it is drawn -- shown, shown after
                            a press, or the path alone -- is this browser's answer and is decided in
                            one place, so the four conversations here and the pool page cannot draw
                            one message three different ways. */}
                        <MessagePictures pictures={one.pictures} inProject={one.workspaceId} ofMessage={one.id} />
                        {/* WHAT THIS MESSAGE IS ABOUT AND WHERE IT OFFERS TO TAKE THE READER. A
                            comment is a message with a target, so the panel says which record it
                            was left on and the name is a link. An offer carries the same press the
                            card on the page carries, because it is the same offer. M8 and 2c fix 4. */}
                        <Where entry={one} titles={titles} projects={projects} here={here} fromName={theWritersName(one, known)} />
                        {/* WHERE THE PRESS TO START A NEW AGENT CARRIED THIS MESSAGE, in visible words in the page's
                            language, from the facts the press stored (problem hqbovBMnTu-z). The same builder
                            writes the delivery mark's hover text below. It stands beside the routed line above:
                            that line is about the moment the message was sent, and this one is about later.
                            The new agent is named by its name now, and called the newer agent of that name where
                            two agents share it, and a press opens its conversation while it is not retired. */}
                        {(one.carriedTo ?? []).map((fact, at) => {
                          const toAgent = everybody.get(participantKey({ kind: 'agent', id: fact.to }))
                          // THE NEWER OF TWO AGENTS THAT SHARE A NAME IS SAID IN THE LINE'S OWN WORDS, so no mark stands beside it.
                          const words = theCarriedWords(t, fact, toAgent?.name ?? fact.toHandle, toAgent?.newerOfASharedName === true)
                          return (
                            <p key={at} className="px-chat-carried">
                              <span className="px-chat-carried-words">{words.line}</span>
                              {toAgent === undefined || toAgent.retired === true ? null : (
                                <button
                                  type="button"
                                  className="px-chat-carried-open"
                                  onClick={() => {
                                    setTalkingTo({ kind: 'agent', id: fact.to })
                                  }}
                                >
                                  {t('chatCarried.open')}
                                </button>
                              )}
                            </p>
                          )
                        })}
                        <div className="px-chat-foot">
                          <IntentOnIt intent={one.intent} whatTheMarkAsks={one.whatTheMarkAsks} flags={myFlags} />
                          <LabelOnIt label={one.label} />
                          <MarkedPartsFoot entry={one} />
                          <Urgent said={one} />
                          <RanBy ranBy={one.ranBy} />
                          {theFromLineOf(talk?.messages ?? [], one)}
                          {/* AND WHICH PROJECT IT WAS WRITTEN IN, when that is not this one.
                              Criterion M55: the conversation is the person's and spans every
                              project, so the exception is what a reader needs told. */}
                          <InAnotherProject said={one} projects={projects} here={here} mark={projectMark} />
                          <When at={one.sentAt} />
                          <EditedMark edited={one.edited} />
                          {/* NOTHING HAS BEEN HANDED THIS TO ANYBODY YET, which is the state a
                              comment written during a review is in. It is said in words rather
                              than left to the absence of a tick, because an absent mark reads as
                              a mark that has not loaded. Criterion M28. */}
                          {one.notSentYet ? <span className="px-chat-unsent">{CHAT_WORDS.notSentYet}</span> : null}
                          {mine ? <span className="px-chat-edit-and-mark">
                          <EditPress id={one.id} body={one.body} markedParts={one.markedParts ?? []} until={one.wordsMayChangeUntil} onSaved={() => { void readTheTalk(talkingTo) }} />
                          {failedSend !== null && mine ? (
                            /* THE STORED ROW CARRIES THE FAILED MARK, so one letter is one bubble.
                               The mark gives the short reason and keeps the whole routed line on
                               hover, and no second press is drawn. Criterion M113a. */
                            <span data-send-state="failed">
                              <SendingMark
                                state="failed"
                                reason={failedSend.reason}
                                shortReason={failedSend.shortReason}
                                stored
                                onRetry={() => {
                                  sendAgain(failedSend.id)
                                }}
                              />
                            </span>
                          ) : mine && theirMark !== undefined ? (
                            <Mark mark={theirMark.mark} because={theirBecause} />
                          ) : null}
                          </span> : null}
                        </div>
                        {/* THE SHORT MARK THAT THIS MESSAGE WAS NOT DELIVERED, in place of the old long routed
                            and nobody-answering paragraphs. Developer detail opens the same words, and normal
                            mode draws only the mark. */}
                        <NotDeliveredLine
                          routed={one.routed}
                          viewer={me}
                          sentBy={one.sentBy}
                          moreWords={nobodyNote && theNext !== null ? [theNext] : []}
                        />
                        {/* WHAT HAPPENS NEXT TO THE NEWEST MESSAGE STILL WAITING, in words, criterion M86. A
                            worker's own reason on the row is still drawn here; the nobody-answering reading
                            moved behind the short mark above (whatHappensToAWaitingMessage in
                            src/server/lib/worker.ts). */}
                        {theNext === null || nobodyNote ? null : (
                          <p className="px-chat-next" data-from={theirBecause === null ? 'answering' : 'row'}>{theNext}</p>
                        )}
                      </div>
                    </li>
                  )
                })}
                {/* MESSAGES BETWEEN THE PRESS AND THE SERVER'S ANSWER, criterion M113. After the
                    real ones, and in the order they were pressed: this is where a message sent
                    just now belongs, whether it has an answer yet or not. */}
                {pendingSends
                  .filter((p) => p.to.kind === talkingTo.kind && p.to.id === talkingTo.id)
                  // A PENDING BUBBLE IS DRAWN ONLY UNTIL ITS STORED ROW IS DRAWN. After that the
                  // stored row carries the failed mark, so one letter is one bubble. Criterion M113a.
                  .filter((p) => p.recordId === null || !drawnRecords.has(p.recordId))
                  .filter((p) => !((p.state === 'sending' || p.state === 'sent') && drawnPresses.has(p.sendId)))
                  .map((p) => (
                    <li key={p.id} className="px-chat-one" data-mine="yes">
                      <div className="px-chat-bubble" data-send-state={p.state}>
                        <OrderedMessage entry={p} titles={titles} flags={myFlags} />
                        <MessagePictures pictures={p.pictures} inProject={p.destination} />
                        <div className="px-chat-foot">
                          <IntentOnIt intent={p.intent} whatTheMarkAsks={p.whatTheMarkAsks} flags={myFlags} />
                          <LabelOnIt label={p.label} />
                          <MarkedPartsFoot entry={p} />
                          <SendingMark
                            state={p.state}
                            reason={p.reason}
                            shortReason={p.shortReason}
                            stored={p.recordId !== null}
                            onRetry={() => {
                              sendAgain(p.id)
                            }}
                          />
                        </div>
                      </div>
                    </li>
                  ))}
              </ol>
              {newBelowMark}

              {talk === null ? noConversationHeld : null}

              {/* AND ONE PRESS THAT SENDS EVERY UNSENT COMMENT IN THIS CONVERSATION.
                  The notes can be sent together from the chat box or from the
                  review column at the right. It is the SAME ACT as the press in
                  the review column — the same route with the same comment ids — and not a second
                  way to send one thing. A second door would make its own conversation, which is
                  the fault `MemberDetail` in ReviewBar.tsx already records. Criterion M28. */}
              {unsentHere.length === 0 ? null : (
                <div className="px-chat-unsent-bar">
                  <span className="px-chat-unsent-count">{CHAT_WORDS.unsentHere(unsentHere.length)}</span>
                  {askingToFinish === null ? (
                    <button
                      type="button"
                      className="px-chat-send"
                      disabled={sending}
                      onClick={() => {
                        void sendTheComments(false)
                      }}
                    >
                      {CHAT_WORDS.sendThemAll}
                    </button>
                  ) : (
                    /* THE SAME QUESTION THE COLUMN ASKS, IN THE COLUMN'S OWN WORDS. A review that
                       is still collecting is finished before it can be sent, there as well as here,
                       and finishing cannot be undone — so it is asked rather than done. The words
                       come from `REVIEW_VOCABULARY` so the two presses cannot drift apart.
                       CANCEL IS FIRST, where the press that opened this row was, which is what
                       stops a double-click completing an act that cannot be undone. */
                    <>
                      <button
                        type="button"
                        className="px-chat-send-cancel"
                        disabled={sending}
                        onClick={() => {
                          setAskingToFinish(null)
                        }}
                      >
                        {t('chat.cancel')}
                      </button>
                      <button
                        type="button"
                        className="px-chat-send"
                        disabled={sending}
                        onClick={() => {
                          void sendTheComments(true)
                        }}
                      >
                        {t('chat.finishCollecting')}{' · '}{t('chat.noteCount', { n: askingToFinish })}
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* A PICTURE TO SEND WITH THE NEXT MESSAGE, criterion M65. Above the box, because the
                  picture is chosen before the line about it is written. */}
              <TheBox draftKey={draftHereKey}>
                {(typed) => (
              <>
              <KeyQuestion question={keyQuestion} onChangeIt={selectTheKey} />
              <PictureToSendRow held={picture} words={typed} />
              {/* THE BOX ACROSS THE WHOLE ROW, AND ONE ROW OF PRESSES BENEATH IT, which is design D. Attach and quote stand
                  at the left; the flag and Send stand together at the right. The row of presses keeps its size while the
                  box grows, so a press never moves under the pointer as the person types. There is no second way to
                  send: the person's row has Send only. */}
              <div className="px-chat-write" {...picture.dropOn}>
                {keptQuotes.length === 0 ? (
                  <GrowingBox
                    value={typed}
                    placeholder={CHAT_WORDS.composerPlaceholder}
                    onChange={typeInTheBox}
                    select={pieceToSelect}
                    markedParts={offersAMark ? keptParts : []}
                    flags={offersAMark ? myFlags : null}
                    onSelectWords={(from, to) => { wordsSelectedInTheBox.current = { from, to } }}
                    onCaret={(at) => { quoteCaret.current = { at, quotesBefore: 0 } }}
                    onSend={() => { void send() }}
                  />
                ) : (
                  <QuoteBox
                    key={draftHereKey ?? ''}
                    value={typed}
                    quotes={keptQuotes}
                    caret={quoteCaret.current}
                    placeholder={CHAT_WORDS.composerPlaceholder}
                    heightLabel={CHAT_WORDS.composerHeight}
                    onCaret={(caret) => { quoteCaret.current = caret }}
                    onChange={(words, positions) => {
                      typeInTheBox(words)
                      const current = quotesInDraft(draftHereKey)
                      writeDraftQuotes(draftHereKey, positions.flatMap((position) => {
                        const quote = current.find((one) => one.id === position.id)
                        return quote === undefined ? [] : [{ ...quote, at: position.at }]
                      }))
                    }}
                    onRemove={takeTheQuoteOut}
                    onSend={() => { void send() }}
                  />
                )}
                <div className="px-chat-presses">
                  <AttachPress held={picture} />
                  <button
                    type="button"
                    className="px-chat-quote-press"
                    title={t('chat.quote.press')}
                    aria-label={t('chat.quote.press')}
                    aria-pressed={pickingQuote && pointMode.state === 'showing'}
                    onPointerDown={() => { selectedQuote.current = quoteTheSelectedWords() }}
                    onClick={() => {
                      const selected = selectedQuote.current ?? quoteTheSelectedWords()
                      selectedQuote.current = null
                      if (selected !== null) {
                        putQuoteInTheDraft(selected)
                        if (pickingQuote) { stopShowing(); setPickingQuote(false) }
                        return
                      }
                      if (pickingQuote) { stopShowing(); setPickingQuote(false) }
                      else { showWhatCanBeTalkedAbout(); setPickingQuote(true) }
                    }}
                  >
                    <span className="px-chat-quote-mark" aria-hidden="true">&quot;</span>
                    <span className="sr-only">{t('chat.quote.press')}</span>
                  </button>
                  <div className="px-chat-sender">
                    {theSelector}
                    <button
                      type="button"
                      className="px-chat-send"
                      disabled={!canSendNow(typed)}
                      aria-label={CHAT_WORDS.send}
                      title={CHAT_WORDS.send}
                      onClick={() => {
                        void send()
                      }}
                    >
                      <SendShape />
                      <span className="sr-only">{CHAT_WORDS.send}</span>
                    </button>
                  </div>
                </div>
              </div>
              {theMarkNotes}
              </>
                )}
              </TheBox>
            </>
          )
  )

  /** The corner is a panel over the page; the page is the page's own part. */
  const Frame = onAPage ? 'section' : 'aside'

  return (
    <HowLinksAreDrawn.Provider value={howLinksAreDrawn}>
      {contactWait === null ? null : <ContactWaitLight key={contactWait.sequence} element={contactWait.element} status={contactWait.status} />}
      <style href="mole-office-chat" precedence="default">
        {CSS}
      </style>
      <LabelColourStyle />

      {/* THE CIRCLE IS THE CORNER'S OWN. The chat page is always open, so it has nothing to open it;
          and it is drawn only while the chat is shut and a message waits, because otherwise the
          sidebar's Chat row or the phone's bar carries the same count, unless the person keeps it in
          the corner. Pressed, it opens the chat as the person chose, and shuts an open one. */}
      {circleOnScreen ? (
        <button
          type="button"
          className="px-chat-circle"
          /* WHAT SOMEBODY LISTENING HEARS, and it says whatever the circle is drawing. A button's own
             label replaces everything inside it, so while this always said the merged total the two
             bubbles' own words were never announced and the setting did nothing for a reader using a
             screen reader. Problem eeKpZbIXd9Gt, criterion M32. */
          aria-label={
            circleShows === 'two'
              ? CHAT_WORDS.unreadNameInTwo(waiting.messages, waiting.groups)
              : unread > 0
                ? CHAT_WORDS.unreadName(unread)
                : CHAT_WORDS.circleName
          }
          aria-expanded={open}
          data-open={open ? 'yes' : 'no'}
          data-quote-picking={pickingQuote && pointMode.state === 'showing' ? 'yes' : undefined}
          onClick={() => {
            if (open) putTheChat('closed')
            else openTheChatAsChosen()
          }}
        >
          {/* The button names itself and its unread count. Its picture is decorative. */}
          {circleFace === null ? null : (
            <img
              className="px-chat-circle-mark"
              src={whereRequestsGo(circlePictureUrl(circleFace))}
              alt=""
              aria-hidden="true"
              width={48}
              height={48}
            />
          )}
          {/* ONE NUMBER OR TWO BUBBLES, AS THE READER CHOSE. Criterion M32. Merged is the two halves added
              together, which is the default; two bubbles draw the messages in one ink and the groups
              in another, messages first. Each bubble says in words what it counts, so the two are
              never told apart by their colour alone. */}
          {circleShows === 'two' ? (
            <span className="px-chat-two" aria-hidden={unread === 0 ? 'true' : undefined}>
              {waiting.messages === 0 ? null : (
                <span
                  className="px-chat-unread"
                  data-counts="messages"
                  aria-label={CHAT_WORDS.unreadMessagesBubble(waiting.messages)}
                >
                  {waiting.messages}
                </span>
              )}
              {waiting.groups === 0 ? null : (
                <span
                  className="px-chat-unread"
                  data-counts="groups"
                  aria-label={CHAT_WORDS.unreadGroupsBubble(waiting.groups)}
                >
                  {waiting.groups}
                </span>
              )}
            </span>
          ) : unread > 0 ? (
            <span className="px-chat-unread">{unread}</span>
          ) : null}
        </button>
      ) : null}

      {open ? (
        <Frame
          ref={onAPage ? fitThePageToTheWindow : measureForTwoColumns}
          className="px-chat"
          // THE PAGE IS NAMED BY ITS OWN HEADING; the corner, which has none, by its label.
          aria-label={onAPage ? undefined : CHAT_WORDS.circleName}
          data-where={where}
          data-quote-picking={pickingQuote && pointMode.state === 'showing' ? 'yes' : undefined}
          // WHICH SIDE OF THE PAGE THE SPLIT'S SEAM IS ON. Only a split draws it; it lets the
          // stylesheet put the seam on the page's side of the chat.
          data-chat-side={drawingTheSplit ? split.side : undefined}
          // WHETHER A CONVERSATION IS OPEN, which the page's narrow layout reads to show the lists or
          // the conversation, one at a time, as the corner always does.
          data-conversation={conversationOnScreen === null ? 'none' : 'open'}
          data-dragging={seamDragging ? 'seam' : (dragging ?? 'no')}
          data-full={full && !onAPage && !drawingTheSplit ? 'yes' : 'no'}
          // HOW BIG THE CHAT'S OWN TEXT IS, criterion M112. `normal` draws nothing extra: every rule
          // below is unchanged for it, and only `small` and `large` add anything, in this file's own
          // stylesheet under `.px-chat[data-chat-size]`.
          data-chat-size={textSize}
          // WHETHER IT IS BEING MOVED NOW, which draws the outline that says so. Wave 13y round 113, item 45.
          data-moving={dragging === 'move' ? 'yes' : 'no'}
          style={
            drawingTheSplit
              ? theSplitIsWide
                ? { width: `${String(splitWidth)}px` }
                : undefined
              : onAPage || narrow || full
                ? undefined
                : {
                    width: `${String(size.width)}px`,
                    height: `${String(size.height)}px`,
                    // A MOVED PANEL IS PLACED HERE, over the corner the stylesheet gives it, which is where it sits otherwise.
                    ...(place === null ? {} : { right: `${String(place.right)}px`, bottom: `${String(place.bottom)}px` }),
                  }
          }
        >
          {/*
            THE SEAM, FIRST, BECAUSE IT IS THE EDGE THE CHAT MEETS THE PAGE AT. Above 1024 pixels it
            is a tall strip carrying the three shapes that swap the sides, send the chat to its own
            window and put it away, and the whole strip is the drag handle. Below that the chat
            covers the screen and the seam is the bar at its top, carrying only the way back.
          */}
          {drawingTheSplit ? (
            <div
              className="px-chat-seam"
              data-chat-side={split.side}
              title={theSplitIsWide ? t('chat.split.seam') : undefined}
              onPointerDown={startSeamDragging}
              onPointerMove={keepSeamDragging}
              onPointerUp={stopSeamDragging}
              onPointerCancel={stopSeamDragging}
              onDoubleClick={giveThePageItsReadingWidth}
            >
              {layoutPress}
              {theSplitIsWide ? (
                <>
                  <AShapePress className="px-chat-seam-swap" words={t('chat.split.swap')} onPress={swapTheSides}>
                    <SwapSidesShape />
                  </AShapePress>
                  <AShapePress className="px-chat-seam-window" words={t('chat.split.window')} onPress={() => putTheChat('window')}>
                    <ItsOwnWindowShape />
                  </AShapePress>
                  <AShapePress className="px-chat-seam-away" words={t('chat.split.away')} onPress={() => putTheChat('closed')}>
                    <PutItAwayShape />
                  </AShapePress>
                  <span className="px-chat-seam-grip" role="separator" aria-label={t('chat.split.seam')} title={t('chat.split.seam')} />
                </>
              ) : (
                <AShapePress className="px-chat-seam-back" words={t('chat.split.back')} onPress={leaveTheCoveringChat}>
                  <BackToThePageShape />
                </AShapePress>
              )}
            </div>
          ) : null}
          {/* THE RULES THE REPORTS' MARKDOWN IS SET BY. Criterion M103: the same renderer means the
              same stylesheet, and React draws one copy of it however many times it is asked for,
              because it is declared with the same name. Once here rather than once per message. */}
          <SummaryStyle />
          {/* THE TWO PRESSES AT THE TOP RIGHT. Criterion M104. The chat has
              a full-screen press, and the close button at the top right is back
              again, which folds the panel away when pressed, because on a phone having no close was
              inconvenient, above all once the panel filled the screen.

              THE CROSS IS BACK BECAUSE THE FULL-SCREEN PRESS PUT IT BACK. Criterion M17 took it off
              as not needed,
              because pressing the circle at the bottom right folds the panel away. A panel filling
              the window covers that circle, so on a phone there was no way out at all, which is
              why the cross came back.

              IT IS A ROW OF ITS OWN AND NOT A CORNER OVER THE HEADER. Each of the four
              conversations draws a header of its own, and a press floating over them would sit on
              the close of one and over a name in another. A thin row above them is in the panel's
              flow, so nothing is ever underneath it.

              THE NEW AGENT BUTTON IS NOT HERE ANY MORE. Criterion M115 put it in this row on
              12 September 2026; criterion M122, later the same morning, moved it beside the Agent
              heading on the contacts list, and this row keeps only the two window presses. The
              chooser it opens is the same one, drawn below and unchanged. */}
          {/* AND THE SAME ROW IS WHAT MOVES THE PANEL, wave 13y round 113, item 45. Dragged anywhere, on its presses
              too, it moves the panel at once; pressed without moving, its presses work as presses. Once the panel is
              off its corner, the row offers to put it back. Where nothing moves, the row says nothing about moving. */}
          {onAPage || drawingTheSplit ? null : (
          <div
            className="px-chat-chrome"
            title={mayMove ? t('chat.move.hold') : undefined}
            data-moves={mayMove ? 'yes' : 'no'}
            onPointerDown={pressTheTopRow}
          >
            {place === null || !mayMove ? null : (
              <button
                type="button"
                className="px-chat-to-the-corner"
                onClick={() => {
                  setPlace(null)
                }}
              >
                {CHAT_WORDS.backToTheCorner}
              </button>
            )}
            {layoutPress}
            <AShapePress className="px-chat-beside" words={t('chat.split.beside')} onPress={() => putTheChat('split')}>
              <BesideThePageShape />
            </AShapePress>
            <button
              type="button"
              className="px-chat-fill"
              aria-label={full ? CHAT_WORDS.backToTheCorner : CHAT_WORDS.fillTheWindow}
              title={full ? CHAT_WORDS.backToTheCorner : CHAT_WORDS.fillTheWindow}
              aria-pressed={full}
              onClick={() => {
                setFull(!full)
              }}
            >
              {full ? '⤡' : '⤢'}
            </button>
            <button
              type="button"
              className="px-chat-close"
              aria-label={CHAT_WORDS.close}
              title={CHAT_WORDS.close}
              onClick={() => {
                setOpen(false)
              }}
            >
              {'×'}
            </button>
          </div>
          )}
          {/* THE NOTICES AT THE TOP OF EVERY VIEW THAT IS NOT A ONE-TO-ONE CONVERSATION. In a
              conversation they are drawn with the cannot-reach notice instead, so every view keeps
              them at the top and nothing under the composer moves. */}
          {inAConversation ? null : noticeBanners}
          {/* AND THE CHOOSER THE NEW AGENT BUTTON OPENS. Criterion M115. It is the same
              `StartANewAgentFromHere` the right-click menu draws, so there is one list of the
              agents nothing is answering as, one press per agent, and one door behind them
              (`api.startANewAgentFor`). The label is drawn even when the list is empty, because a
              press that opened nothing would be a press that said nothing. The styles live in this
              file's one stylesheet, which is already in the document while the panel is. */}
          {!summoning ? null : (
            <Overlay>
              <div className="px-chat-new-agent-behind" aria-hidden="true" />
              <div
                className="px-chat-new-agent-ask"
                role="dialog"
                aria-modal="true"
                aria-label={CANNOT_REACH_WORDS.newAgent}
              >
                <StartANewAgentFromHere
                  showLabelWhenEmpty
                  onDone={() => {
                    setSummoning(false)
                    void readEverything()
                  }}
                />
                <button
                  type="button"
                  className="px-chat-new-agent-close"
                  onClick={() => {
                    setSummoning(false)
                  }}
                >
                  {t('chat.notNow')}
                </button>
              </div>
            </Overlay>
          )}
          {/* THE THREE EDGES A PERSON DRAGS. The owner named each one: the left edge sets the
              width, the top edge the height, and the top-left corner both at once. They are drawn only where there is a box to resize. */}
          {onAPage || drawingTheSplit || narrow || full
            ? null
            : (['left', 'top', 'corner'] as const).map((edge) => (
                <div
                  key={edge}
                  className="px-chat-grip"
                  data-edge={edge}
                  role="separator"
                  aria-label={CHAT_WORDS.dragging[edge]}
                  title={CHAT_WORDS.dragging[edge]}
                  onPointerDown={startDragging(edge)}
                  onPointerMove={keepDragging}
                  onPointerUp={stopDragging}
                  onPointerCancel={stopDragging}
                />
              ))}
          {onAPage ? (
            <>
              <div className="px-chat-page-layout">{layoutPress}</div>
              <div className="px-chat-page-panes" data-columns={twoColumns ? 'two' : 'one'}>
                <div className="px-chat-page-lists">{theLists()}</div>
                <div className="px-chat-page-talk">{theView()}</div>
              </div>
            </>
          ) : drawingTheSplit ? (
            <div className="px-chat-split-view">{theColumns()}</div>
          ) : (
            theColumns()
          )}

          {/* NOTHING IS DRAWN UNDER THE COMPOSER ANY MORE. The notice that this browser will not
              keep what is being typed (criterion M98), the fault from a failed action and the
              notice that the page is not being told about new messages are all banners at the top
              of the panel now (`noticeBanners` above). A line under the composer changed where the
              composer sat, which a notice must not do. */}
        </Frame>
      ) : null}
    </HowLinksAreDrawn.Provider>
  )
}

// THE RECORDS BEHIND THE STYLESHEET'S RULES. The comments inside the stylesheet below are shipped
// text, so they give their reasons in words and name no record or criterion. The ids they named are
// kept here, in the order of the rules:
// - the group line of a forwarded reply: criterion GM2;
// - the two bubbles and their two inks: criterion M32;
// - the panel filling the window, and the two presses at the top right: criterion M104;
// - the header row that stays put while its line is edited: criterion M17 refined, problem RNpZdXjpMxC_;
// - a picture that is a press: criterion M36;
// - a row's name in bold only when something is unread: criteria M33 and M99;
// - who wrote an agent's line: criterion M21;
// - which mind is answering as the agent: criterion H3;
// - the one New agent press: criteria M122 and M115;
// - the groups tab scrolling as one area: criterion SC2;
// - the quiet count beside a folded heading: criteria SC1 and M123;
// - the groups the contacts are in: criterion M29;
// - the two locked top groups: criteria M119 and M122; the disabled Edit and the grey placeholder: M122;
// - a fold press: criterion M121; the filter box: criterion M124;
// - the agents one agent started: criterion P10;
// - the contact row and its unread count: criterion M99;
// - the office's own mark on the preview line: criterion M105;
// - the reader's own dot: criterion M20 refined;
// - new messages below: criterion M101; a message's box growing with the panel: criterion M102;
// - a message body drawn by the reports' renderer: criterion M103;
// - the project mark on a message: criterion M55; a message before its row exists: criterion M113;
// - no answer in time: problem KzLydNEm4HYX; where a message was written from: criterion M63;
// - where a record link sits: criterion M48;
// - the box across the writing row, and the presses beneath it: design D, wave 13y;
// - a notice about the chat's own state: a decision; its wrapping: criterion M117;
// - who wrote a bubble in the neutral view: criterion M72; the mark of a message sent in front: M62;
// - nothing handed to anybody yet: criterion M28;
// - a line Mole Office wrote: criterion M11; a system notice: criterion M26; the time over it: M34 and SC3;
// - the panel stopping above the circle on a phone: criterion M17, problem vKXFAHteKv-O;
// - a system line on a phone: criterion M128; the chat's own text size: criterion M112;
// - a checklist line says what thing and what happened: the owner decided so.
const CSS = `
/* THE LINE SAYING WHICH GROUP A FORWARDED REPLY CAME FROM. It sits above the words
   and reads as a quiet label with a press, so it is not mistaken for part of what was said. */
.px-chat-from-group {
  display: block;
  margin: 0 0 0.25rem;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-2);
  font-size: var(--fs-1);
  text-align: left;
  text-decoration: underline;
  cursor: pointer;
}

.px-chat-from-group:hover { color: var(--text-1); }

.px-chat-lead {
  margin-top: 0.5rem;
  padding: 0.5rem;
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  background: var(--panel-2);
}

.px-chat-lead-words { margin: 0; font-size: var(--fs-1); color: var(--text); }

.px-chat-lead-presses { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 0.5rem; }

.px-chat-lead-later,
.px-chat-lead-choice {
  font: inherit;
  font-size: var(--fs-1);
  color: var(--text);
  background: var(--panel);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0.125rem 0.5rem;
  cursor: pointer;
}

.px-chat-lead-choices { display: flex; flex-wrap: wrap; gap: 0.25rem; flex-basis: 100%; }

.px-chat-lead-said { margin: 0; font-size: var(--fs-1); color: var(--text-2); }

.px-chat-lead-go {
  align-self: flex-start;
  font: inherit;
  font-size: var(--fs-1);
  color: var(--accent-text);
  background: var(--accent);
  border: var(--border-w) solid transparent;
  border-radius: var(--radius-sm);
  padding: 0.125rem 0.5rem;
  cursor: pointer;
  /* IT NAMES A PLACE, so it may take two lines, and a word longer than the line breaks rather than running out. */
  text-align: start;
  overflow-wrap: anywhere;
}

/* ITS SIZE AND ITS INSET ARE THE TOKENS' (tokens.css), which the room left under the page is worked
   out from, so the button and that room cannot come to disagree. ITS CORNERS ARE ITS OWN: a chat plate is a
   circle under every theme, and a person's own theme may set the corner style names to anything, so the
   button reads none of them. */
.px-chat-circle {
  position: fixed;
  right: var(--fab-inset);
  bottom: var(--fab-inset);
  z-index: var(--z-chat-button);
  width: var(--fab-size);
  height: var(--fab-size);
  padding: 0;
  border-radius: 50%;
  border: var(--fab-border);
  background: var(--fab-bg);
  color: var(--fab-ink);
  cursor: pointer;
  display: grid;
  place-items: center;
  box-shadow: var(--fab-shadow);
}
/* A circle kept in the corner while the chat is beside the page on the right stands in the page's own corner. */
:root[data-chat-split='right'] .px-chat-circle { right: calc(var(--chat-split-w, 0px) + var(--fab-inset)); }
/* The picture, chosen or the default one, fills the round frame. */
.px-chat-circle-mark {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: cover;
}
.px-chat-unread {
  min-width: 1.1rem;
  padding: 0 0.25rem;
  border-radius: 999px;
  background: var(--text);
  color: var(--panel);
  font-size: 0.7rem;
  line-height: 1.1rem;
  text-align: center;
}
.px-chat-circle .px-chat-unread { position: absolute; top: -0.2rem; right: -0.2rem; }

/* THE TWO BUBBLES, WHEN THE PERSON HAS ASKED FOR TWO. They sit where the one number sits and
   run along the top of the circle, messages first, so the order says which is which when the two
   inks do not. Each carries its own accessible name for the same reason. */
.px-chat-two {
  position: absolute;
  top: -0.2rem;
  right: -0.2rem;
  display: flex;
  gap: 0.15rem;
}
.px-chat-two .px-chat-unread { position: static; }

/* THE TWO INKS, AND THE TWO SHAPES. Messages and groups are counted in two colours; two shapes come
   with them because one of this product's palettes is monochrome, and there the accent token IS the
   text ink: two bubbles of one colour would not tell them apart. So messages keep the filled pill the single
   number has always had, and groups are drawn hollow with a ring. The colour differs in six
   palettes and the shape differs in all seven. */
.px-chat-unread[data-counts='groups'] {
  background: var(--panel);
  color: var(--accent);
  border: var(--border-w) solid var(--accent);
  line-height: calc(1.1rem - 2 * var(--border-w));
}

/* AND THE GREY ONE ON THE BETWEEN AGENTS TAB. Between agents, where anything is unread, shows a grey
   bubble with the unread count. Grey because it is not the reader's: nothing in
   one of those conversations is addressed to them, and the number is how many have been written in
   since they last looked.
   IT NAMES THE ROW AS WELL. The contact row's overdue rule below is as specific as the bare count
   rule and comes later, so the count on these rows was drawn red. */
.px-chat-contact .px-chat-unread[data-counts='new'] { background: var(--text-3); color: var(--panel); }

/* HOW BIG IT IS COMES FROM THE PERSON, NOT FROM WHAT IS IN IT.
   The width and the height are written on the element by the component, from the size that was
   dragged to and stored. The two numbers here are the same ones SIZE_TO_START_WITH holds in pixels,
   and they are what a panel drawn before JavaScript runs takes. */
.px-chat {
  position: fixed;
  right: 1rem;
  bottom: 4.5rem;
  z-index: var(--z-drawer);
  width: 21rem;
  height: 32rem;
  max-width: calc(100vw - 2rem);
  max-height: calc(100dvh - 6rem);
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--panel);
  color: var(--text);
  overflow: hidden;
  box-shadow: 0 2px 12px rgb(0 0 0 / 22%);
}

/* THE CHAT AS A PAGE. Plan row C1: the same drawing as the panel, in the page's own flow rather
   than over it, as tall as the window leaves room for, and never smaller than a list and a few
   messages need. Nothing is dragged and nothing floats, so the panel's placing, size, corners and
   shadow are all set back. The attribute selector outranks the phone rules below, which place the
   panel above the circle. The page's heading is read out and not drawn, so the panel takes the
   2.25rem it stood in (wave 13y round 113, item 45). The height here is the desk's, until the panel
   is measured: fitThePageToTheWindow sets the room the window really leaves at every width. */
.px-chat[data-where='page'] {
  position: relative;
  inset: auto;
  z-index: auto;
  width: auto;
  height: max(24rem, var(--px-chat-page-height, calc(100dvh - 6.75rem)));
  max-width: none;
  max-height: none;
  box-shadow: none;
}

/* THE CHAT BESIDE THE PAGE. Design D: both are as tall as the window, the chat is fixed to the
   window's edge, and the page gives it the room rather than being covered. The width comes from
   the person's drag through the style on the element; the seam is the chat's own first child and
   the edge it meets the page at. */
.px-chat[data-where='split'] {
  position: fixed;
  top: 0;
  bottom: 0;
  z-index: var(--z-drawer);
  height: 100dvh;
  max-width: none;
  max-height: none;
  border-radius: 0;
  border-top: none;
  border-bottom: none;
  box-shadow: none;
  display: flex;
  flex-direction: row;
}
.px-chat[data-where='split'][data-chat-side='right'] { right: 0; left: auto; }
.px-chat[data-where='split'][data-chat-side='left'] {
  left: var(--sidebar-w, 248px);
  right: auto;
  flex-direction: row-reverse;
}
.px-chat-split-view {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* THE SEAM. It is as tall as the chat at the desk, so it is dragged anywhere below the three
   shapes; on a phone it becomes the bar across the top. Its own colour is the quiet panel, and
   its line is the border that separates the two halves. */
.px-chat-seam {
  flex: 0 0 auto;
  width: 2.25rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 0.4rem 0.15rem;
  background: var(--panel-2);
  border-right: var(--border-w) solid var(--border-strong);
  touch-action: none;
  user-select: none;
}
.px-chat-seam[data-chat-side='left'] { border-right: none; border-left: var(--border-w) solid var(--border-strong); }
.px-chat-seam button {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-2);
  cursor: pointer;
  flex: none;
}
.px-chat-seam button:hover { background: var(--hover); color: var(--text); }
.px-chat-seam button:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: 2px; }
.px-chat-seam-grip { flex: 1 1 auto; width: 100%; min-height: 2rem; cursor: ew-resize; }

/* A FINGER DOES NOT DRAG THE SEAM THE SAME WAY A POINTER DOES: no text is selected under it. */
.px-chat[data-dragging='seam'] { user-select: none; }

/* THE LISTS BESIDE THE CONVERSATION. Each half is a column that scrolls inside itself, the way the
   panel does, so the composer stays at the foot of the conversation. The chat beside the page and
   its window draw the same two halves once they are wide enough, and one of them otherwise. */
.px-chat-page-panes, .px-chat-columns {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(15rem, 21rem) minmax(0, 1fr);
}
.px-chat-columns[data-columns='one'], .px-chat-page-panes[data-columns='one'] { grid-template-columns: minmax(0, 1fr); }
.px-chat-page-panes[data-columns='one'] .px-chat-page-lists { border-right: none; }
.px-chat[data-conversation='open'] .px-chat-page-panes[data-columns='one'] .px-chat-page-lists,
.px-chat[data-conversation='none'] .px-chat-page-panes[data-columns='one'] .px-chat-page-talk { display: none; }
.px-chat-page-layout { display: flex; justify-content: flex-end; flex: none; }
.px-chat-layout-toggle { display: grid; place-items: center; width: 2rem; height: 2rem; padding: 0; border: none; border-radius: var(--radius-sm); background: none; color: var(--text-2); cursor: pointer; }
.px-chat-chrome .px-chat-layout-toggle { width: 1.5rem; height: 1.5rem; }
.px-chat-layout-toggle:hover { background: var(--hover); color: var(--text); }
.px-chat-layout-toggle:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: 2px; }
.px-chat-page-lists, .px-chat-page-talk, .px-chat-columns-lists, .px-chat-columns-talk {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.px-chat-page-lists, .px-chat-columns[data-columns='two'] .px-chat-columns-lists { border-right: var(--border-w) solid var(--border); }
.px-chat-page-nothing-open { margin: auto; padding: 1rem; text-align: center; }
.px-chat-columns-talk[data-empty='yes'] { justify-content: center; align-items: center; padding: 1rem; text-align: center; }

/* THE PANEL FILLING THE WINDOW. The chat has a full-screen press as well.

   IT OVERRIDES EVERY ONE OF THE SIX RULES THAT PLACE AND SIZE THE PANEL, including the two the
   component writes on the element itself — those two are not written while this is on, because an
   inline width would beat any rule here and the panel would be full height and 21rem wide.

   THE CORNERS GO SQUARE AND THE SHADOW GOES. Both are what say a box is sitting over a page; a box
   that IS the page has nothing to sit over. When the corner button is drawn, its own space keeps
   the chat controls reachable above it. */
.px-chat[data-full='yes'] {
  inset: 0;
  width: auto;
  height: auto;
  max-width: none;
  max-height: none;
  border: none;
  border-radius: 0;
  box-shadow: none;
}
/* Keep the button above the window without putting any chat controls underneath it. */
.px-chat-circle ~ .px-chat[data-full='yes'] { padding-bottom: var(--fab-room); }
/* AND THERE IS NOTHING TO DRAG. A panel that is the window has no edge to move. */
.px-chat[data-full='yes'] .px-chat-grip { display: none; }

/* THE THREE PLACES A PERSON TAKES HOLD OF TO RESIZE IT.
   They sit just outside the panel's own border, so a drag never starts on a button or on the words
   of a message. Each is wider than it looks: 10px is about the smallest a pointer finds reliably,
   and the visible line is the panel's border. The corner is drawn slightly larger because two
   directions at once is the hardest of the three to hit. */
.px-chat-grip {
  position: absolute;
  z-index: 1;
  touch-action: none;
}
.px-chat-grip[data-edge='left'] { left: -5px; top: 10px; bottom: 0; width: 10px; cursor: ew-resize; }
.px-chat-grip[data-edge='top'] { top: -5px; left: 10px; right: 0; height: 10px; cursor: ns-resize; }
.px-chat-grip[data-edge='corner'] { top: -5px; left: -5px; width: 16px; height: 16px; cursor: nwse-resize; }
/* WHILE A DRAG IS HAPPENING, nothing inside the panel takes the pointer or highlights under it.
   Without this a drag across a message selects the words of the message. */
.px-chat[data-dragging]:not([data-dragging='no']) { user-select: none; }
.px-chat[data-dragging]:not([data-dragging='no']) .px-chat-said,
.px-chat[data-dragging]:not([data-dragging='no']) .px-chat-list { pointer-events: none; }

/* THE HEADER ROW STAYS WHERE IT IS WHILE THE LINE UNDER IT IS EDITED.
   The owner reported on 4 September that pressing "working" made the avatar on the left and the
   cross on the right move with it, and asked that both stay fixed at the top. The avatar used to be centred against the words beside it, so opening the editor made the words
   taller and the avatar slid down with them. Aligned to the top it does not move, whatever grows
   underneath. */
.px-chat-me, .px-chat-them {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  padding: 0.6rem 0.7rem;
  border-bottom: var(--border-w) solid var(--border);
  flex: none;
}
/* THE NAME AND THE DOT STILL SIT AGAINST THE MIDDLE OF THE PICTURE, which is what centring the
   whole row was for. It is the first line that lines up with it, not the column. */
.px-chat-them-top { min-height: 2.5rem; align-items: center; }
/* THE READER'S OWN ROW IS ONE LINE, as tall as its smaller picture: the name, whether they are here and, while they
   have no status, the pencil, beside one another. Item 45 asks for less room at the top of the chat. A status
   written takes the line under them, and so does its editor; the picture stays at the top while it is open. */
.px-chat-me { padding: 0.35rem 0.7rem; }
.px-chat-me-top { min-height: 1.75rem; align-items: center; }
.px-chat-me-top .wyh { flex: none; }
.px-chat-set-state {
  flex: none;
  min-width: 1.5rem;
  min-height: 1.5rem;
  font-size: 0.85rem;
  line-height: 1;
  text-align: center;
  color: var(--text-3);
}
.px-chat-set-state:hover { color: var(--text); }
.px-chat-me-words, .px-chat-them-words { display: flex; flex-direction: column; min-width: 0; flex: 1; }
/* A PICTURE THAT IS A PRESS. It is a button so that it can be reached by keyboard
   and read out as one; nothing else about it changes, because the thing on the screen is the
   picture and a frame around it would say there were two things. */
.px-chat-face {
  display: inline-flex;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  cursor: pointer;
  flex: none;
}
.px-chat-face:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

/* A minimum width of zero is what lets a long name shrink inside a flex row rather than pushing
   whatever is beside it off the end. Without it a flex item is at least as wide as its content, and
   at 336 the coordinator's own name cut the line saying which mind is answering to "Ans...". */
.px-chat-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

/* A ROW'S NAME IS PLAIN UNLESS SOMETHING IN IT IS UNREAD. A contact's name is bold only when
   there is a message, whether only a system message or a real message is unread. Every contact
   was in bold, so boldness said nothing. The rule is scoped to a ROW: the name at the top of a
   conversation and the heading over a group of contacts stay as they were, because neither is a row
   in a list and neither has anything to be unread. */
/* THE NAME IS BOLD, AND BOLDER AGAIN WHERE SOMETHING IS UNREAD. The owner's picture of a contact row
   draws the name in bold, and an unread row must be heavier than the rest.
   The read weight was 400 until 11 September 2026, which met the second and not the first. */
.px-chat-contact[data-unread='no'] .px-chat-name { font-weight: 600; }
.px-chat-contact[data-unread='yes'] .px-chat-name { font-weight: 700; }
.px-chat-contact-top, .px-chat-them-top { display: flex; gap: 0.35rem; align-items: center; min-width: 0; }
.px-chat-carried {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  margin: 0.3rem 0 0;
  color: var(--text-2);
  font-size: var(--fs-1);
  line-height: var(--lh-tight);
  overflow-wrap: anywhere;
}
/* WHAT HAPPENS NEXT TO THE NEWEST WAITING MESSAGE. The weight of the carried line above: it says where
   the message stands and asks nothing of the reader. */
.px-chat-next {
  margin: 0.3rem 0 0;
  color: var(--text-2);
  font-size: var(--fs-1);
  line-height: var(--lh-tight);
  overflow-wrap: anywhere;
}
.px-chat-carried-open {
  font: inherit;
  color: inherit;
  background: none;
  border: none;
  padding: 0;
  text-decoration: underline;
  cursor: pointer;
}
.px-chat-newer {
  flex: none;
  font-size: var(--fs-1);
  line-height: 1.2;
  padding: 0 0.3rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.6rem;
  color: var(--text-2);
  white-space: nowrap;
}
.px-chat-them-state { font-size: 0.75rem; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.px-chat-them .px-chat-name {
  white-space: normal; overflow: visible; overflow-wrap: anywhere; text-overflow: clip;
}
.px-chat-them-top { flex-wrap: wrap; }
/* THE PERSONAL LINE WRAPS, AND WHO SET IT STAYS WHOLE. Cut to one line, it hid the setter below
   1440 and in the side panel, so a line somebody else set read as the agent's own. A stored line
   is at most 60 characters long, so the wrapping is short. */
.px-chat-them .px-chat-them-state { display: block; max-width: 100%; line-height: 1.4; white-space: normal; overflow-wrap: anywhere; overflow: visible; text-overflow: clip; }
.px-chat-them .px-chat-state-by, .px-chat-them .px-chat-state-setter { margin-left: 0; }
/* THE DUTY WRAPS IN THE OPEN HEADING, AS THE PERSONAL LINE DOES, UP TO TWO LINES. Cut to one line, it lost most of a
   long duty below 1440 and in the side panel. Whole, a duty as long as the door stores took four or five lines above the
   messages, and item 45 asks for less room at the top of the chat (wave 13y round 113). So the heading
   shows two lines and a press that opens the rest: TheFoldedDuty in ChatDuty.tsx. A contact row keeps it to one line,
   because a row in a list is there to find the agent. */
.px-chat-them .duty-line { white-space: normal; overflow-wrap: anywhere; overflow: visible; text-overflow: clip; }
/* THE OPEN HEADING GIVES WAY BEFORE THE CONTROLS, AS THE LAST RESORT. With an opened duty and the personal line, it can
   be taller than a short panel has room for beside the composer. The controls are what the person needs to answer, and
   the heading's words can still be scrolled to, so the heading shrinks and scrolls inside itself. The message list gives
   up its height first (THE MESSAGE LIST GIVES UP HEIGHT BEFORE THE HEADING), so this happens only when the heading cannot
   fit. With two lines of the duty, every ordinary panel fits it, so the name line is the first thing in a conversation
   (wave 13y round 113, item 45). The heading still opens at its top. The picture row's weight is a thousandth of the
   heading's, so it keeps its height.

   A HEADING THAT SCROLLS SHOWS THAT IT DOES. Some systems draw no scroll bar until the reader scrolls, so
   a shade at the heading's bottom edge says there is more. The second layer is the shade, and it stays at
   the edge. The first layer is the panel's colour, drawn at the end of what the heading holds. It moves
   when the heading scrolls, and it covers the shade when the end is in view, which it always is when the
   heading fits. */
.px-chat-them {
  flex: 0 1 auto;
  min-height: 0;
  overflow-y: auto;
  background:
    linear-gradient(var(--panel), var(--panel)) center bottom / 100% 1.25rem no-repeat local,
    linear-gradient(transparent, color-mix(in srgb, var(--text) 24%, transparent)) center bottom / 100% 1.25rem no-repeat scroll,
    var(--panel);
}
.px-chat-edit-personal { border: none; padding: 0 0.2rem; background: none; color: var(--text-3); cursor: pointer; font: inherit; }
.px-chat-presence-word { font-size: 0.7rem; color: var(--text-2); white-space: normal; overflow-wrap: anywhere; }
.px-chat-flow { font-size: 0.75rem; line-height: 1.4; color: var(--text-2); overflow-wrap: anywhere; margin-top: 0.3rem; }
/* "AND 1 MORE" IS NEVER PUT BETWEEN THE WORDS OF THE STEP. Beside a step that wraps, it sat after the
   step's first line; now it moves whole to a line of its own when the step does not fit on one. */
.px-chat-flow-summary { display: flex; flex-wrap: wrap; gap: 0 0.3rem; align-items: start; line-height: 1.4; }
.px-chat-flow-main { min-width: 0; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.px-chat-flow-more { flex: none; white-space: nowrap; border: none; background: none; color: inherit; font: inherit; line-height: inherit; padding: 0; text-decoration: underline; cursor: pointer; }
.px-chat-flow a { color: inherit; text-decoration: underline; }
.px-chat-flow-dialog { width: min(32rem, calc(100% - 2 * var(--gut))); max-height: calc(100dvh - 2 * var(--gut)); overflow-y: auto;
  padding: var(--pad-lg); background: var(--panel); color: var(--text); border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius); box-shadow: var(--elev-2); }
.px-chat-flow-dialog::backdrop { background: color-mix(in srgb, var(--bg), transparent 25%); }
.px-chat-flow-title { font-size: var(--fs-4); }
.px-chat-flow-list { list-style: none; padding: 0; margin: var(--gut) 0 0; }
.px-chat-flow-list > li + li { margin-top: var(--gut); }
.px-chat-flow-list ul { padding-left: var(--gut); }
.px-chat-them-state[data-stale='yes'] { font-style: italic; color: var(--text-3); }
/* WHO WROTE THE LINE, WHEN IT WAS NOT THE AGENT ITSELF. Smaller and dimmer than the line, because
   it is about the line rather than part of it: a reader must not take it for the agent's words. */
.px-chat-state-by, .px-chat-state-setter { font-size: 0.65rem; color: var(--text-3); margin-left: 0.3rem; white-space: nowrap; }
/* WHICH MIND IS ANSWERING AS THIS AGENT NOW, beside its name.
   IT NEVER SHRINKS AND THE NAME DOES. Measured on the owner's own corpus at 1440 on 4 September
   2026: with the coordinator's long name in the same row, this was cut to "Ans..." and said nothing.
   The name is already cut with an ellipsis and a reader can still tell which conversation they are
   in from what is left of it; three words that are cut to one are three words wasted. */
.px-chat-answering { font-size: 0.65rem; color: var(--text-3); margin-left: 0.4rem; white-space: nowrap; flex: none; }

.px-chat-me-top { display: flex; gap: 0.35rem; align-items: center; min-width: 0; }

.px-chat-state, .px-chat-state-box {
  font-size: 0.75rem;
  color: var(--text-2);
  background: none;
  border: none;
  padding: 0;
  text-align: left;
  cursor: pointer;
}
.px-chat-state-box { border-bottom: var(--border-w) solid var(--border-strong); width: 100%; cursor: text; }
.px-chat-state-row { display: flex; gap: 0.3rem; align-items: center; }
.px-chat-stop-editing {
  flex: none;
  border: none;
  background: none;
  color: var(--text-3);
  font-size: 1rem;
  line-height: 1;
  padding: 0 0.2rem;
  cursor: pointer;
}
.px-chat-presets { display: flex; gap: 0.3rem; margin-top: 0.25rem; flex-wrap: wrap; }
.px-chat-preset {
  font-size: 0.7rem;
  border: var(--border-w) solid var(--border);
  border-radius: 999px;
  padding: 0.05rem 0.4rem;
  background: none;
  color: var(--text-2);
  cursor: pointer;
}

.px-chat-close, .px-chat-back, .px-chat-fill, .px-chat-beside {
  border: none;
  background: none;
  color: var(--text-2);
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.1rem 0.3rem;
  flex: none;
}
.px-chat-close:hover, .px-chat-fill:hover, .px-chat-beside:hover { color: var(--text); }

/* THE WAY BACK BESIDE THE PAGE, in the window's own row. It is a shape like the seam's, and it is
   in the row so the corner keeps its words about filling and closing. It comes after the presses'
   shared rule so that its padding of 0 is the one drawn: with that rule's padding, the 24-pixel
   shape made the window's top row 27 pixels tall, more than the 26 the row may be. */
.px-chat-beside {
  display: grid;
  place-items: center;
  padding: 0;
  flex: none;
}

/* THE TWO PRESSES AT THE TOP RIGHT OF THE PANEL.

   A ROW OF ITS OWN, ABOVE EVERY HEADER. The four conversations each draw a header, so a corner
   floating over them would land on the back press of one and over a name in another. In the flow
   nothing is ever underneath it, and it is the same row at every width — which is what the owner
   asked for, because a phone is where it matters most.

   THE PRESSES ARE BIGGER THAN THEY LOOK. 2rem square is about the smallest a finger finds, and the
   glyph inside it is the size of the words around it. */
.px-chat-chrome {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.1rem;
  flex: none;
  padding: 0 0.25rem;
  touch-action: none;
  user-select: none;
}
/* AS SMALL AS THE ROW, at the desk. Item 45 asks for less room at the top of the chat, and a pointer finds a press
   of 1.5rem. A finger needs the 2rem the phone width below gives it. */
.px-chat-chrome button { min-width: 1.5rem; min-height: 1.5rem; }

/* THE PANEL WHILE IT IS BEING MOVED. The outline says so; the row's pointer says it can be dragged before that. */
.px-chat-chrome[data-moves='yes'] { cursor: move; }
.px-chat[data-moving='yes'] { outline: 2px dashed var(--accent); outline-offset: 2px; }
.px-chat[data-moving='yes'] .px-chat-chrome { cursor: move; background: var(--hover); }
.px-chat-to-the-corner {
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font: inherit;
  font-size: var(--fs-1);
  line-height: 1.2;
  padding: 0 0.45rem;
  cursor: pointer;
}
.px-chat-to-the-corner:hover { background: var(--hover); }

/* THE ONE NEW AGENT PRESS, BESIDE THE AGENT HEADING. It moved here from the panel's own header
   row; the rule that there is exactly one is unchanged. The auto right margin
   pushes the Edit entry after it to the far right of the heading. It is a word and not a glyph,
   because it is the one press in this panel that makes something new. */
.px-chat-new-agent {
  margin-right: auto;
  border: var(--border-w) solid var(--border);
  border-radius: 999px;
  background: var(--panel);
  color: var(--text);
  font: inherit;
  font-size: 0.78rem;
  line-height: 1.4;
  padding: 0.15rem 0.7rem;
  cursor: pointer;
  white-space: nowrap;
}
.px-chat-new-agent:hover { background: var(--panel-2); }

/* THE CHOOSER IT OPENS, drawn over everything and closed by its own press. The same two-layer
   shape as the start-a-new-agent dialogue in StartANewAgent.tsx, so the two presses look like one
   product. The list inside carries its own styles from that file. */
.px-chat-new-agent-behind {
  position: fixed;
  inset: 0;
  z-index: var(--z-blocked);
  backdrop-filter: blur(6px);
  background: rgba(0, 0, 0, 0.25);
}
.px-chat-new-agent-ask {
  position: fixed;
  z-index: var(--z-wrong-world);
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(28rem, calc(100vw - 2rem));
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  box-sizing: border-box;
  background: var(--panel);
  color: var(--text);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius);
  padding: 1rem;
  box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.35);
}
.px-chat-new-agent-close {
  margin-top: 0.6rem;
  border: 1px solid var(--border);
  border-radius: 0.35rem;
  padding: 0.3rem 0.8rem;
  cursor: pointer;
  background: var(--panel-2);
  color: var(--text);
  font-size: 0.85rem;
}

.px-chat-head { margin: 0; padding: 0.5rem 0.7rem 0.2rem; font-size: 0.75rem; color: var(--text-2); font-weight: 600; }

/* THE THREE TABS, ACROSS THE TOP. Three categories sit side by side at the top, not in one
   column.
   Equal thirds, so the row reads as three of one thing and not as one wide tab and two narrow
   ones; the chosen tab is marked with a line under it and heavier text, so which list is showing
   survives a screen with no colour. */
.px-chat-tabs {
  display: flex;
  flex: none;
  border-bottom: var(--border-w) solid var(--border);
}
.px-chat-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  flex: 1 1 0;
  min-width: 0;
  padding: 0.4rem 0.3rem;
  font: inherit;
  font-size: 0.75rem;
  color: var(--text-2);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  /* A NAME LONGER THAN ITS THIRD WRAPS INSIDE THE THIRD, so every language draws its tab's whole
     name; the three tabs still share the row equally. */
  white-space: normal;
}
.px-chat-tab:hover { background: var(--hover, rgb(127 127 127 / 10%)); }
.px-chat-tab svg { width: 18px; height: 18px; flex: none; }
.px-chat-tab[aria-selected='true'] { color: var(--text); font-weight: 600; border-bottom-color: var(--text); }
/* A TAB'S UNREAD NUMBER STANDS APART FROM ITS NAME, so a Chinese tab name and 22 do not read as one word. */
.px-chat-tab .px-chat-unread { display: inline-block; margin-inline-start: 0.35rem; }

/* AND THE ONE LIST UNDER THEM. It scrolls on its own so that the tabs stay where they were put. */
.px-chat-foot-link {
  margin: 0;
  padding: 0.35rem 0.7rem 0.5rem;
  border-top: 1px solid var(--border);
  font-size: var(--fs-1);
  text-align: center;
}
.px-chat-under-tabs {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.px-chat-list { list-style: none; margin: 0; padding: 0 0 0.4rem; overflow-y: auto; min-height: 0; }
/* THE END OF THE CONTACT ROWS READ SO FAR, which reads the next page when it is scrolled to (TheRestOfTheList in
   ContactChooser.tsx). It is as tall as a row, so the list can be scrolled on to it. */
.px-chat-more-rows { height: 3rem; }
/* THE GROUPS TAB SCROLLS AS ONE AREA. Each category's list is inside its own section, so it is not
   a shrinking flex child of the tab and it carries no scroll bar of its own; the tab is the one
   scroller. Drawn beside its section the one-row Secretaries list was squeezed to a few pixels by
   the default category's many rows. */
.px-chat-top-group[data-side='groups'] { flex: none; }
.px-chat-top-group[data-side='groups'] .px-chat-list { flex: none; overflow: visible; }
/* THE QUIET COUNT BESIDE A FOLDED HEADING. The heading says how many groups wait inside. It is a
   plain number in the third ink, not an unread badge, so the rule that no group heading carries a
   message count still holds. */
.px-chat-top-count {
  margin-left: 0.15rem;
  color: var(--text-3);
  font-size: var(--fs-1);
  font-weight: 400;
}
/* THE WHOLE FOLDED HEADING IS THE PRESS. The heading carries no other control, so the name and the
   count sit inside the press and a press anywhere on the row opens the fold; the gap keeps the
   arrow, the words and the number apart. The words start at the left, like every other heading's:
   on a phone they take two lines, and a button would otherwise centre each line. */
.px-chat-top-group[data-category='folded'] .px-chat-fold { flex: 1; gap: 0.4rem; text-align: left; }

/* THE GROUPS THE CONTACTS ARE IN. A heading, its unread count, and the rows under
   it. The presses that move things are drawn only while the list is being arranged, so an ordinary
   read is the same list it always was with a heading above each part of it. */
.px-chat-arrange {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  align-items: center;
  padding: 0.3rem 0.7rem;
}
.px-chat-arrange button, .px-chat-group-presses button, .px-chat-place button, .px-chat-naming button, .px-chat-between-older, .px-chat-between-more {
  min-height: 24px;
  padding: 0 0.35rem;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text-2);
  font-size: var(--fs-1);
  cursor: pointer;
}
.px-chat-arrange button:hover, .px-chat-group-presses button:hover,
.px-chat-place button:hover, .px-chat-naming button:hover, .px-chat-between-older:hover, .px-chat-between-more:hover { background: var(--hover); }
/* THE PRESS UNDER THE LIST IS NOT PART OF THE LIST. Drawn at the list's own edge, its border cut the
   ninth conversation's project tag in half: seven pixels of an eighteen-pixel tag stayed above the
   border, and the press's box covered the rest. A gap of half a line keeps the list's foot and the
   press apart, so the press no longer covers a row. The scroller can still clip a row at its own
   viewport edge while it scrolls; that is ordinary clipping, not the press. */
.px-chat-between-more { margin-top: 0.5rem; }
.px-chat-arrange button:disabled, .px-chat-group-presses button:disabled,
.px-chat-place button:disabled, .px-chat-naming button:disabled, .px-chat-between-more:disabled { opacity: .45; cursor: default; }
.px-chat-arrange-press[aria-pressed='true'] { background: var(--hover); border-color: var(--accent); color: var(--text); }

.px-chat-arrange-fault {
  margin: 0;
  padding: 0 0.7rem 0.3rem;
  font-size: var(--fs-1);
  line-height: var(--lh-tight);
  color: var(--st-failed);
}

.px-chat-group-of { display: flex; flex-direction: column; min-width: 0; }

.px-chat-group-name {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  align-items: center;
  margin: 0;
  padding: 0.35rem 0.7rem 0.15rem;
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: .06em;
  text-transform: uppercase;
}
.px-chat-group-words { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* A GROUP A PERSON NAMED keeps the case they wrote it in; only the declared headings are labels. */
.px-chat-group-words[data-heading-is='content'] { text-transform: none; letter-spacing: 0; }
.px-chat-group-presses { display: flex; gap: 0.2rem; margin-left: auto; text-transform: none; letter-spacing: 0; }

.px-chat-group-empty { margin: 0; padding: 0; }

/* THE TWO LOCKED TOP GROUPS. The heading is larger than a second-level one
   and carries more room, because it is the level a reader is at; the New agent press and the grey
   New placeholder sit beside it, and the Edit entry sits at its right. The fold press is the same
   small arrow every group uses. */
.px-chat-top-group { display: flex; flex-direction: column; min-width: 0; }
.px-chat-top-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
  margin: 0;
  padding: 0.4rem 0.7rem 0.15rem;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
  letter-spacing: 0;
  text-transform: none;
}
.px-chat-top-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.px-chat-edit {
  margin-left: auto;
  border: var(--border-w) solid var(--border);
  border-radius: 999px;
  background: var(--panel);
  color: var(--text-2);
  font: inherit;
  font-size: 0.78rem;
  line-height: 1.4;
  padding: 0.15rem 0.7rem;
  cursor: pointer;
  white-space: nowrap;
}
.px-chat-edit:hover { background: var(--panel-2); }
.px-chat-edit[aria-pressed='true'] { background: var(--hover); border-color: var(--accent); color: var(--text); }
/* A DISABLED EDIT. The Secretaries heading carries one because the office keeps that group's
   members itself, and it is drawn quietly the way the New placeholder beside Human is. */
.px-chat-edit:disabled { opacity: 0.65; cursor: default; }
.px-chat-edit:disabled:hover { background: var(--panel); }
/* THE GREY PLACEHOLDER BESIDE HUMAN. It is not a press, it says so in its tooltip,
   and it is drawn in the third ink so a reader can tell it apart from a press that works. Its ring
   is the strong border: the plain one is too close to the panel in dark to be seen, and the button
   then read as loose grey words. */
.px-chat-new-agent-placeholder {
  border: var(--border-w) solid var(--border-strong);
  border-radius: 999px;
  background: var(--panel);
  color: var(--text-3);
  font: inherit;
  font-size: 0.78rem;
  line-height: 1.4;
  padding: 0.15rem 0.7rem;
  cursor: default;
  white-space: nowrap;
}
.px-chat-new-agent-placeholder:disabled { opacity: 0.65; }

/* A FOLD PRESS. It is the arrow, and the whole heading is not a press because the
   heading also carries the rename and move controls while a side is being arranged. */
.px-chat-fold {
  display: inline-flex;
  align-items: center;
  min-width: 1rem;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

/* THE ROW HOLDING THE PROJECT AND THE FILTER, ABOVE THE LIST AND HIDDEN UNTIL IT IS WANTED. It folds to nothing
   rather than being taken off the page, so the keyboard can still reach what is in it, and reaching it shows it. It
   pushes the list down as it opens, so it never covers the first row. */
.px-chat-find {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  flex: none;
  max-height: 0;
  padding: 0 0.7rem;
  overflow: hidden;
  opacity: 0;
  transition: max-height 160ms ease, padding 160ms ease, opacity 160ms ease;
}
.px-chat-find[data-shown='yes'] { max-height: 3rem; padding: 0.35rem 0.7rem; opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  .px-chat-find { transition: none; }
}
/* THE FILTER BOX takes what the project block leaves. */
.px-chat-filter {
  box-sizing: border-box;
  flex: 1 1 auto;
  min-width: 0;
  font: inherit;
  font-size: var(--fs-1);
  padding: 0.3rem 0.5rem;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
}

/* THE PROJECT, A SMALL BLOCK LEFT OF THE FILTER, drawn the way the filter is. It keeps the width its name needs, up
   to under half the row, and the filter gives way. On the two tabs with no filter it is the row's one control. */
.px-chat-project-filter {
  box-sizing: border-box;
  flex: none;
  min-width: 0;
  max-width: 45%;
  font: inherit;
  font-size: var(--fs-1);
  padding: 0.3rem 0.5rem;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
}

/* THE PROJECTS A ROW'S CONVERSATION WAS WRITTEN IN OR IS ABOUT, beside its name: at most two names
   and then +N. Quieter than the name, and it gives way to the name when the row is narrow: each name
   is cut with an ellipsis rather than pushing the time or the count off the row. */
.px-chat-projects {
  display: flex;
  flex: 0 1 auto;
  gap: 0.2rem;
  min-width: 0;
  max-width: 55%;
  overflow: hidden;
}
.px-chat-project-mark, .px-chat-project-more {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 9rem;
  padding: 0 0.3rem;
  border: 1px solid var(--border);
  border-radius: 0.2rem;
  color: var(--text-2);
  font-size: 0.65rem;
  font-weight: 400;
  line-height: 1rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.px-chat-project-more { flex: none; }
/* Contact names and project names remain readable when a list is narrow. */
.px-chat-contact .px-chat-contact-top { flex-wrap: wrap; }
.px-chat-contact .px-chat-name { white-space: normal; overflow: visible; overflow-wrap: anywhere; }
.px-chat-contact .px-chat-projects { flex-wrap: wrap; max-width: 100%; overflow: visible; }
.px-chat-contact .px-chat-project-mark { max-width: 100%; white-space: normal; overflow: visible; overflow-wrap: anywhere; }
.agent-projects { display: flex; flex-wrap: wrap; gap: 0.25rem; min-width: 0; }
.agent-projects .agent-project { max-width: 100%; white-space: normal; overflow: visible; overflow-wrap: anywhere; font-size: 0.75rem; }

/* THE AGENTS ONE AGENT STARTED, folded under it. The press is a row of the list, so
   it lines up with the contacts above and below it; the list inside is indented so a reader can see
   at a glance that those conversations belong to the starter and not to them. */
.px-chat-folded { list-style: none; }
.px-chat-fold-press {
  display: flex; align-items: center; gap: 0.35rem; width: 100%;
  padding: 0.2rem 0.7rem 0.3rem 1.5rem; border: 0; background: none; cursor: pointer;
  font: inherit; font-size: var(--fs-1); color: var(--ink-soft); text-align: left;
}
.px-chat-fold-press:hover { color: var(--ink); }
.px-chat-fold-arrow { display: inline-block; width: 0.7rem; }
.px-chat-fold-list { margin: 0 0 0.2rem; padding: 0 0 0 0.8rem; border-left: 1px solid var(--hairline); }

.px-chat-naming { display: flex; flex-wrap: wrap; gap: 0.2rem; align-items: center; text-transform: none; letter-spacing: 0; }
.px-chat-name-field {
  min-width: 0;
  flex: 1 1 7rem;
  min-height: 24px;
  padding: 0 0.35rem;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font-size: var(--fs-2);
  font-weight: 400;
}

/* THE CONTROLS THAT MOVE ONE CONTACT, under its row rather than beside it: the panel starts 336
   pixels wide, and a chooser and two presses on the same line as a name and the last thing said
   left no room for any of them. */
.px-chat-place { display: flex; gap: 0.2rem; align-items: center; padding: 0 0.7rem 0.35rem 2.6rem; }
.px-chat-member-acts { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--pad); padding: 0 0.7rem 0.35rem 2.6rem; }
.px-chat-member-acts .px-btn { max-width: 100%; white-space: normal; overflow-wrap: anywhere; text-align: left; }
.px-chat-place-group { min-width: 0; flex: 1; }
.px-chat-place select {
  width: 100%;
  min-height: 24px;
  padding: 0 0.2rem;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font-size: var(--fs-1);
}
.px-chat-contact {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  width: 100%;
  padding: 0.4rem 0.7rem;
  background: none;
  border: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.px-chat-contact:hover { background: var(--hover, rgb(127 127 127 / 10%)); }
.px-chat-contact-words { display: flex; flex-direction: column; min-width: 0; flex: 1; gap: 0.1rem; }
.px-chat-last { font-size: 0.75rem; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1; }

/* THE ROW THE OWNER'S PICTURE DRAWS, the picture chat-contatct.jpg.

   THE TIME IS AT THE RIGHT OF THE TOP LINE and never squeezed out of it. The name is the only
   thing on that line that may grow: it takes the room and cuts itself with an ellipsis, and the
   time keeps its own width whatever the name does. That is what flex none says here. */
.px-chat-contact-when {
  font-size: 0.7rem;
  color: var(--text-3);
  margin-left: auto;
  flex: none;
  white-space: nowrap;
}
/* THE SECOND LINE: the pencil, the tag, the words, and the count at the right. */
.px-chat-contact-line {
  display: flex;
  gap: 0.3rem;
  align-items: center;
  min-width: 0;
}
/* A DRAFT IS WAITING HERE. It is the accent ink because it is a thing the reader started and has
   not finished, and it is a GLYPH rather than a second pill: the tag beside it is a pill, and in a
   palette where the accent is the text ink the shape is what tells the two apart. */
.px-chat-pencil { font-size: 0.75rem; color: var(--accent); flex: none; line-height: 1; }
/* THE CARD THIS CONTACT HOLDS, as a tag. Hollow, like the groups bubble on the circle and for the
   same reason: one of this product's palettes is monochrome, where a filled accent pill and a
   filled text pill are the same box. */
.px-chat-tag {
  font-size: 0.65rem;
  line-height: 1.3;
  color: var(--accent);
  border: var(--border-w) solid var(--accent);
  border-radius: 999px;
  padding: 0 0.3rem;
  flex: none;
  white-space: nowrap;
  max-width: 6rem;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* THE OFFICE'S OWN MARK ON THE PREVIEW LINE. Same ink as the system block inside
   the open conversation (text-3), not the accent ink the draft pencil and the card tag use: those
   two are the reader's own state and this contact's own card, and the office's mark is neither. */
.px-chat-last-office { font-size: 0.75rem; color: var(--text-3); flex: none; white-space: nowrap; }
/* THE COUNT OF UNREAD MESSAGES, AT THE RIGHT OF THE SECOND LINE, which is where the owner's
   picture puts it. It was beside the name until 11 September 2026.

   THE INK IS THE OVERDUE STATE AND NOT A NAMED RED. The badge in the owner's picture is red, and this product
   never names a colour by its hue: the state inks carry the meaning and the palette carries the
   hue, the way the online presence mark is drawn in the done ink. The overdue ink is the one that
   means somebody is waiting, which is what an unread message is; it is red in six of the seven
   palettes and near black in the monochrome one, where a filled pill is still a filled pill. */
.px-chat-contact .px-chat-unread {
  background: var(--st-overdue);
  color: var(--panel);
  flex: none;
}

.px-chat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
  border: 1.5px solid var(--text-3);
}
.px-chat-dot[data-colour='green'] { background: var(--presence-online); border-color: var(--presence-online); }
.px-chat-dot[data-colour='grey'] { background: transparent; border-color: var(--presence-offline); }
.px-chat-dot[data-colour='red'] { background: var(--presence-gone); border-color: var(--presence-gone); }

/* THE READER'S OWN DOT -- the one that says what they CHOSE rather than what was measured -- is drawn
   by src/web/components/WhetherYouAreHere.tsx, and its rules ship with it. */

/* THE MESSAGE LIST GIVES UP HEIGHT BEFORE THE HEADING. In a panel with a set height the list starts from
   nothing and takes what is left, so it has nothing to give. The corner window at a phone's width has no set
   height, only a cap. There every part that can shrink gives up a share of what does not fit, by its length
   times its weight. At a weight of 1, a long conversation took enough of the open heading's height that the
   heading scrolled in an ordinary conversation (wave 13y round 106). At this weight the heading gives up less
   than a hundredth of a pixel while the list still has height to give. */
.px-chat-said { list-style: none; margin: 0; padding: 0.5rem 0.7rem; overflow-y: auto; overflow-anchor: none; min-height: 0; flex: 1 100000 0%; }
.px-chat-arrival { animation: px-chat-arrive var(--motion-open) var(--ease-out); }
@keyframes px-chat-arrive { from { transform: translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .px-chat-arrival { animation: none; } }

/* NEW MESSAGES ARE BELOW WHERE THE READER IS LOOKING.

   IT SITS UNDER THE LIST AND OVER THE COMPOSER, in the panel's own flow, so it can never cover a
   message. It is drawn only while there is something to say, and takes no room the rest of the
   time. Pressing it goes to the newest message. */
.px-chat-new-below {
  flex: none;
  align-self: center;
  margin: 0 0 0.3rem;
  padding: 0.1rem 0.6rem;
  border: var(--border-w) solid var(--accent);
  border-radius: 999px;
  background: var(--panel);
  color: var(--accent);
  font-size: 0.7rem;
  cursor: pointer;
}
.px-chat-new-below:hover { background: var(--hover, rgb(127 127 127 / 10%)); }
.px-chat-one { display: flex; gap: 0.4rem; align-items: flex-start; margin-bottom: 0.5rem; }
.px-chat-one[data-mine='yes'] { flex-direction: row-reverse; }
/* A MESSAGE'S BOX GROWS WITH THE PANEL. On 9 September 2026 the owner reported that widening the
   panel did not widen the message boxes, perhaps because the maximum was narrow, while narrowing it
   worked.

   IT WAS 15rem — 240 pixels, a fixed number — until 11 September 2026. The panel starts at 21rem
   and a person may drag it to the window's width, so a panel dragged to 900 pixels drew a 240 pixel
   message with 600 pixels of nothing beside it. Narrowing worked, which is what the owner noticed: below
   about 300 pixels the row itself is the smaller of the two and the fixed cap never applies.

   85 PER CENT OF THE ROW, AND NO SECOND CAP IN PIXELS. The share is what makes it grow at every
   width the panel can be given, and the fifteen per cent left is what keeps a message from one side
   telling apart from a message from the other at a glance. A reading-width cap in rem would be the
   same defect again with a larger number in it, so there is none: a wide panel is a thing the person
   asked for and the whole width is theirs to use. It is the same share the system block above uses. */
.px-chat-bubble {
  border: var(--bubble-border, var(--border-w) solid var(--border));
  border-radius: var(--bubble-radius, var(--radius));
  padding: 0.35rem 0.5rem;
  max-width: 85%;
  min-width: 0;
}
.px-chat-one[data-mine='yes'] .px-chat-bubble {
  background: var(--bubble-mine-bg, var(--hover, rgb(127 127 127 / 8%)));
  color: var(--bubble-mine-ink, var(--text));
}
.px-chat-one[data-mine='no'] .px-chat-bubble { background: var(--bubble-theirs-bg, transparent); }
.px-chat-words { font-size: 0.85rem; overflow-wrap: anywhere; }
/* MARKED WORDS: the flag's words colour on the characters, and the flag's own colour beneath them. The same classes
   draw the writing box's paint and the sent bubble, so one part cannot be two colours. */
.px-chat-marked {
  color: var(--label-words);
  text-decoration: underline;
  text-decoration-color: var(--label-ink);
  text-decoration-thickness: 2px;
  text-underline-offset: 2px;
  border-radius: 0.15rem;
}
.px-chat-marked-words { white-space: pre-wrap; overflow-wrap: anywhere; }
.px-chat-marked-count { color: var(--muted); font-size: 0.72rem; }
/* THE LAYER OVER THE PLAIN BOX. It has the box's own border, padding, font and wrapping, and takes no pointer. The box
   beneath keeps the caret, the selection and the typing; the layer only colours the marked runs. */
.px-chat-mark-paint {
  position: absolute;
  inset: 0;
  z-index: 1;
  flex: none;
  background: transparent;
  border-color: transparent;
  color: transparent;
  pointer-events: none;
  overflow: hidden;
}
/* THE NOTES UNDER THE BOX about a mark a change took out, or a whole flag that took the parts' place. */
.px-chat-mark-notes { display: flex; flex-direction: column; gap: 0.2rem; }
.px-chat-dropped-mark,
.px-chat-marks-taken-off,
.px-chat-marks-not-kept { margin: 0; color: var(--muted); font-size: 0.75rem; }

/* A MESSAGE BODY, DRAWN BY THE RENDERER THE REPORTS USE.

   THIS SETS SIZES AND NOTHING ELSE. Every rule about how a heading, a list, a table or a code block
   is BUILT is in the reports' own stylesheet, which the panel draws once. What a chat bubble needs
   is the same drawing at a chat's size and with a chat's air, so this moves the tokens those rules
   already read. A rule here that redrew a block would be the second renderer that using one
   renderer exists to prevent.

   A TABLE ALREADY SCROLLS AND THIS DOES NOT MAKE IT. The reports' own table block draws its table
   inside a scrolling box with the mark that says it scrolls, so a rule here saying the same thing
   was a SECOND sideways-scrolling box over the first — which is what
   the nothing-scrolls-sideways test caught on 11 September 2026, naming
   ".px-chat-md .sb-table". A box that scrolls and says nothing is the thing that test existed to
   stop, and the answer was to take the rule out rather than to write it down. */
.px-chat-md {
  --sb-read: 0.85rem;
  --sb-gap: 0.4rem;
  --sb-h3: 0.95rem;
  --sb-h4: 0.9rem;
  --sb-h5: 0.85rem;
  --sb-h6: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: var(--sb-gap);
  min-width: 0;
  overflow-wrap: anywhere;
}
.px-chat-md > :first-child { margin-top: 0; }
.px-chat-md > :last-child { margin-bottom: 0; }
.px-chat-md pre, .px-chat-md code { font-size: 0.78rem; }
/* WRAPS SINCE 6 SEPTEMBER 2026. This row gained the project mark, and at 390 wide
   a bubble is about 250px: the run, the project's name, the time and a delivery mark do not fit on
   one line, and without this the last of them leaves the bubble. */
.px-chat-foot { --chat-foot-gap: 0.3rem; display: flex; flex-wrap: wrap; gap: var(--chat-foot-gap); align-items: center; justify-content: flex-end; margin-top: 0.15rem; }
.px-chat-edit-and-mark { display: inline-flex; align-items: center; gap: 0.3rem; }
.px-chat-when { font-size: 0.65rem; color: var(--text-3); }
.px-chat-mark { font-size: 0.7rem; color: var(--chat-tick); }
.px-chat-bubble[data-send-state='sending'] .px-chat-mark[data-shape='pending'] {
  display: inline-block;
  animation: px-chat-sending-turn var(--motion-lap-wide) var(--ease-lap) var(--motion-delay) infinite;
}
.px-chat-bubble[data-send-state='sent'] .px-chat-mark[data-shape='tick'] {
  display: inline-block;
  animation: px-chat-sent-pop var(--motion-open) var(--ease-pop) both;
}
.px-chat-mark.px-chat-stored-tick-arrival { display: inline-block; animation: px-chat-sent-pop var(--motion-open) var(--ease-pop) both; }
@keyframes px-chat-sending-turn { to { transform: rotate(360deg); } }
@keyframes px-chat-sent-pop { from { transform: scale(.4); opacity: 0; } to { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .px-chat-bubble[data-send-state='sending'] .px-chat-mark[data-shape='pending'],
  .px-chat-bubble[data-send-state='sent'] .px-chat-mark[data-shape='tick'],
  .px-chat-mark.px-chat-stored-tick-arrival { animation: none; }
}

/* WHERE A MESSAGE STANDS BEFORE THE REAL ROW EXISTS. Weight in proportion to
   whether the reader has to act: sending and sent are quiet, the same weight the tick and the
   double tick already have, because nothing is asked of the reader. A failure is not — it is the
   one object on this row the reader must do something about, so it is the only place this file
   spends its failed colour on a chat bubble. */
.px-chat-bubble[data-send-state='sending'] { opacity: 0.7; }
.px-chat-bubble[data-send-state='failed'] {
  border-color: var(--st-failed-line);
  background: var(--st-failed-bg);
}
.px-chat-mark[data-shape='failed'] { color: var(--st-failed); font-weight: 700; }
.px-chat-send-failed { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; justify-content: flex-end; }
/* THE REASON IS READ, NOT ONLY HOVERED. It is the same sentence the ! carries as its title and its
   aria-label; drawing it again in words is what was asked for — "a red ! with the reason" — and a person reading this bubble is the one who has to decide whether to press Send
   again, which is why it is weighted like the fault banner the rest of this panel already uses. */
.px-chat-send-failed-why {
  flex: 1 1 100%;
  order: 3;
  font-size: 0.65rem;
  line-height: var(--lh-body);
  color: var(--st-failed);
  text-align: right;
  overflow-wrap: anywhere;
}
.px-chat-send-again {
  border: var(--border-w) solid var(--st-failed-line);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--st-failed);
  font: 600 var(--fs-1)/1 var(--font-ui);
  padding: 2px 6px;
  cursor: pointer;
}
.px-chat-send-again:hover { background: var(--st-failed-bg); }
/* NO ANSWER CAME IN TIME, AND IT IS NOT KNOWN YET WHETHER THE LETTER ARRIVED.
   Quiet, like sending: there is nothing for the reader to do until the chat has read the
   conversation. The words are drawn, because the clock alone would say the letter is still on its
   way. A letter the read does not find turns red with Send again, the same as a failed one. */
.px-chat-bubble[data-send-state='not-known'] { opacity: 0.85; }
.px-chat-bubble[data-send-state='not-in-the-conversation'] {
  border-color: var(--st-failed-line);
  background: var(--st-failed-bg);
}
.px-chat-send-not-known { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; justify-content: flex-end; }
.px-chat-send-not-known-why {
  flex: 1 1 100%;
  order: 3;
  font-size: 0.65rem;
  line-height: var(--lh-body);
  color: var(--text-2);
  text-align: right;
  overflow-wrap: anywhere;
}

/* THE TOOL THAT RAN THE RUN A MESSAGE CAME OUT OF. Quiet: it is a note about where the words came
   from, beside the words themselves, and it must not compete with them. */
.px-chat-ranby {
  font-size: 0.65rem;
  color: var(--text-3);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  padding: 0 0.25rem;
  line-height: 1.5;
  white-space: nowrap;
}

/* WHERE A MESSAGE WAS WRITTEN FROM. No box around it, unlike the run mark beside
   it: the run mark is one word and reads as a tag, this is a short phrase and reads as a phrase.
   It may wrap, because a machine name and a browser name together do not fit a 250px bubble at
   every width, and a truncated machine name is worse than a second line. */
.px-chat-from {
  font-size: 0.65rem;
  color: var(--text-3);
  line-height: 1.5;
}
/* Strengthen the small read glyph's painted green without changing its size or colour. */
.px-chat-mark[data-shape='read'] { color: var(--chat-read); -webkit-text-stroke: 0.25px currentColor; }

.px-chat-link {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  color: var(--link, var(--text));
  text-decoration: underline;
  cursor: pointer;
}

.px-chat-write {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.5rem 0.7rem;
  border-top: var(--border-w) solid var(--border);
  flex: none;
}
/* THE BOX AND THE EDGE A PERSON DRAGS TO CHANGE ITS HEIGHT, which is why the box needs a holder at
   all: the edge sits over the top of it and the box itself cannot hold a child. The holder takes the
   whole width of the row. */
.px-chat-box-holder { min-width: 0; position: relative; display: flex; }
/* THE ROW OF PRESSES BENEATH THE BOX: attach and quote at the left, the flag and Send at the right.
   It is as tall as one press and no taller, whatever the box holds, so nothing in it moves as the
   person types. */
.px-chat-presses {
  flex: none;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  height: 2rem;
  min-width: 0;
}
.px-chat-box-grip {
  position: absolute;
  top: -5px;
  left: 0;
  right: 0;
  height: 10px;
  cursor: ns-resize;
  touch-action: none;
  z-index: 1;
}
.px-chat-box {
  flex: 1;
  min-width: 0;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--bg, var(--panel));
  color: var(--text);
  padding: 0.3rem 0.45rem;
  font: inherit;
  line-height: 1.35;
  resize: none;
  overflow-y: hidden;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.px-chat-rich-box { min-height: 2rem; max-height: 12rem; overflow-y: auto; }
.px-chat-quote-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 0.4rem;
  min-width: 0;
  max-width: 100%;
  vertical-align: baseline;
  padding: 0.25rem 0.45rem;
  border-left: 2px solid var(--accent);
  background: var(--panel-2);
  color: var(--text);
  font-size: var(--fs-1);
  line-height: 1.3;
}
.px-chat-quote-chip-words { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.px-chat-quote-chip-from { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--text-3); white-space: nowrap; }
.px-chat-quote-chip-out {
  flex: none;
  border: none;
  background: none;
  color: var(--text-3);
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 0 0.1rem;
}
.px-chat-quote-chip-out:hover { color: var(--text); }
.px-chat-quote-press[aria-pressed='true'] { background: var(--panel-2); color: var(--accent); }
/* THE SHAPES THAT ATTACH A FILE AND TAKE THE SELECTED WORDS, at the left of the row of presses. They
   are as big as the other writing-box presses so a pointer finds them. The attach press is quiet until
   the pointer is on it. */
.px-chat-attach-add,
.px-chat-quote-press {
  flex: none;
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-2);
  cursor: pointer;
}
.px-chat-attach-add:hover { background: var(--hover); color: var(--text); }
.px-chat-quote-mark { font: 1.5rem/1 var(--font-ui); }
.px-chat-attach-add:focus-visible,
.px-chat-quote-press:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: 2px; }

/* THE FLAG AND SEND, TOGETHER AT THE RIGHT END OF THE ROW. Each has a border of its own. */
.px-chat-sender {
  flex: none;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: auto;
  height: 100%;
}
.px-chat-send {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  height: 100%;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius);
  background: none;
  color: var(--text);
  padding: 0 0.6rem;
  cursor: pointer;
}
.px-chat-send:hover:not(:disabled) { background: var(--hover); }
.px-chat-send:disabled { opacity: 0.5; cursor: default; }
.px-chat-send svg { width: 20px; height: 20px; }

/* A NOTICE ABOUT THE CHAT'S OWN STATE, AT THE TOP OF THE PANEL. Since 16 September 2026 every
   notice the chat draws about itself is a banner at the top, the way
   the cannot-reach notice is, and nothing under the composer may change where the composer sits.
   So the cannot-reach box, the browser-will-not-keep-a-draft notice, a failed action and the
   connection notice are drawn as the same box, one above another.

   IT WRAPS RATHER THAN RUNNING OFF THE SCREEN. At 390 the words and any press do
   not fit on one line, and the press must not be the half that goes. flex: none keeps the whole box
   on the screen when it wraps to two lines. The message list gives up its height first. After it,
   the open heading gives way and scrolls inside itself, because the controls are what the person
   needs to answer (THE OPEN HEADING GIVES WAY BEFORE THE CONTROLS). */
.px-chat-notices { display: flex; flex-direction: column; flex: none; }
.px-chat-cannot-reach,
.px-chat-notice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: .4rem;
  margin: 0 .7rem .25rem;
  padding: .2rem .45rem;
  border: var(--border-w) solid var(--st-broken-line);
  border-radius: var(--radius);
  background: var(--st-broken-bg);
  flex: none;
}
.px-chat-cannot-reach-words,
.px-chat-notice { font-size: var(--fs-1); color: var(--text); }
.px-chat-cannot-reach .px-start-agent { margin-left: auto; }
/* UNDER A NOTICE THE MESSAGES START UNDER A LINE, drawn as the line under the agent's name, with room above it.
   Without it a scrolled message was cut 4 pixels under the notice with no edge, and its sides ran up to the
   notice's border, so the notice looked as if it lay over the message (wave 13y round 146). */
:is(.px-chat-notices, .px-chat-cannot-reach) + .px-chat-said {
  border-top: var(--border-w) solid var(--border);
  margin-top: .25rem;
}

/* WHO WROTE A BUBBLE, drawn only in the neutral view of a conversation between two agents.
   Neither side is the reader's, so the name is what tells the two apart. */
.px-chat-who {
  display: block;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-3);
  margin-bottom: 0.15rem;
}

/* THE MARK ON A MESSAGE THAT WENT IN FRONT OF THE QUEUE, in the page's language. */
.px-chat-urgent {
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--st-broken);
  border: var(--border-w) solid var(--st-broken);
  border-radius: var(--radius);
  padding: 0 0.25rem;
  line-height: 1.5;
  white-space: nowrap;
}
/* THE FLAG LEFT OF SEND, for marking a message. "No mark" is a plain outline round the flag alone; a chosen mark is a
   thick accent outline, tinted and bold, round the flag and its short word, so it is never missed before a send. It is
   as tall as Send, and the outline is inside that height, so choosing a mark moves nothing up or down. */
.px-chat-intent {
  flex: none;
  box-sizing: border-box;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--panel);
  color: var(--text-2);
  font: inherit;
  font-size: 0.8rem;
  padding: 0 0.45rem;
  white-space: nowrap;
  cursor: pointer;
}
.px-chat-intent:hover { background: var(--hover); }
.px-chat-intent svg { width: 18px; height: 18px; flex: none; }
.px-chat-intent[data-chosen='yes'] {
  border: 2px solid var(--accent);
  background: var(--accent-soft);
  color: var(--text);
  font-weight: 700;
}
/* ONE DRAWING RULE FOR EVERY FLAG: the border in the flag's colour, on the soft ground of the same colour. The
   words colour is stored and shown in Settings; nothing draws it yet. */
.px-chat-intent[data-chosen='yes'][data-colour] { border-color: var(--label-ink); background: var(--label-soft); }
/* ITS MENU: a tick column, the mark's name, and one muted sentence under it. */
.px-chat-intent-tick { flex: none; width: 1rem; text-align: center; }
.px-chat-intent-line { display: flex; flex-direction: column; padding: 0.3rem 0; min-width: 0; }
.px-chat-intent-line-what { font-size: var(--fs-1); font-weight: 400; color: var(--text-2); white-space: normal; }
/* A FLAG'S LINE IN THE MENU, after a dot in the flag's colour. */
.px-chat-intent-line-colour .px-chat-intent-line-name { display: flex; align-items: center; gap: 0.35rem; overflow-wrap: anywhere; }
.px-chat-intent-line-colour .px-chat-intent-line-name::before { content: ""; flex: none; width: 0.6rem; height: 0.6rem; border-radius: 50%; background: var(--label-ink); }
/* THE MARK ON A SENT MESSAGE, in the footer where Urgent is drawn: the same border-on-soft-ground rule as the flag, in
   the colour the person gave it. The fallbacks are the accent, for a mark whose flag is no longer on their list. */
.px-chat-intent-mark {
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--label-ink, var(--accent));
  background: var(--label-soft, var(--accent-soft));
  border: var(--border-w) solid var(--label-ink, var(--accent));
  border-radius: var(--radius);
  padding: 0 0.3rem;
  line-height: 1.5;
  white-space: nowrap;
}
/* A PERSON'S OWN LABEL ON A SENT MESSAGE, beside the mark: its word in the label's colour, in its own border, on the
   soft ground of the same colour. */
.px-chat-label-mark {
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--label-ink);
  background: var(--label-soft);
  border: var(--border-w) solid var(--label-ink);
  border-radius: var(--radius);
  padding: 0 0.3rem;
  line-height: 1.5;
  white-space: nowrap;
}
/* "MARK BROKEN", on an agent's reply to a marked message. Quiet at rest; it is a complaint, used rarely. */
.px-chat-mark-broken {
  font: inherit;
  font-size: 0.7rem;
  color: var(--text-2);
  background: none;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius);
  padding: 0 0.35rem;
  line-height: 1.5;
  cursor: pointer;
}
.px-chat-mark-broken:hover { color: var(--st-broken); border-color: var(--st-broken); }
.px-chat-mark-broken:disabled { opacity: 0.6; cursor: default; }
.px-chat-mark-broken-said { font-size: 0.7rem; color: var(--text-2); }
.px-chat-mark-broken-failed { font-size: 0.7rem; color: var(--st-failed); overflow-wrap: anywhere; }
/* THE PRESS AND THE "FROM" LINE AS ONE PIECE OF THE FOOT, the press on the left. The foot wraps, and the two move to
   the next line together. The "from" line may still wrap inside the piece. */
.px-chat-from-with-press { display: inline-flex; align-items: center; gap: 0.3rem; min-width: 0; }
.px-chat-model-break { display: none; }
/* Keep the reply foot below its model without adding another row gap. */
.px-chat-ranby ~ .px-chat-model-break { display: block; flex: 0 0 100%; height: 0; margin-bottom: calc(-1 * var(--chat-foot-gap)); }
/* THE WAY OUT OF THE CONFIRM, drawn quieter than the press that completes the act, exactly as the
   review column draws its own pair. It carries no border so the eye lands on the other one. */
.px-chat-send-cancel {
  border: none;
  border-radius: var(--radius);
  background: none;
  color: var(--text-2);
  padding: 0.3rem 0.5rem;
  font: inherit;
  cursor: pointer;
}
.px-chat-send-cancel:disabled { opacity: 0.5; cursor: default; }

.px-chat-empty, .px-chat-typed {
  color: var(--text-3);
  font-size: var(--fs-1);
  margin-bottom: 0.15rem;
}
/* SAID BESIDE A WRITER NOBODY REGISTERED, in words and not in colour alone, because a colour is
   not readable to everybody and this is a fact about the writer rather than a decoration. */
/* NOTHING HAS BEEN HANDED THIS TO ANYBODY YET. Said in words beside the time rather than left to
   the absence of a tick: an absent mark reads as a mark that has not loaded. */
.px-chat-unsent {
  border: 1px solid var(--border);
  border-radius: 0.2rem;
  padding: 0 0.25rem;
  color: var(--text-3);
  font-size: 0.65rem;
  white-space: nowrap;
}
/* WHICH PROJECT A MESSAGE WAS WRITTEN IN, when it was not this one. It is drawn at
   the weight of the time beside it, because it is the same kind of fact about the message and not
   a warning: the conversation is the person's and holds what was said in every project. */
.px-chat-project {
  color: var(--text-3);
  font-size: 0.65rem;
  white-space: nowrap;
}
.px-chat-project::before { content: 'in '; }
.px-chat-unsent-bar {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  flex-wrap: wrap;
  padding: 0.35rem 0.7rem;
  border-top: 1px solid var(--border);
  font-size: var(--fs-1);
}
.px-chat-unsent-count { color: var(--text-2); flex: 1; min-width: 0; }

.px-chat-unregistered {
  flex: none;
  padding: 0 0.3rem;
  border: 1px solid var(--border);
  border-radius: 0.2rem;
  color: var(--text-3);
  font-size: 0.65rem;
  line-height: 1rem;
  white-space: nowrap;
}
.px-chat-read-before {
  margin: 0;
  padding: 0 var(--pad-lg) var(--pad);
  color: var(--text-3);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
}
.px-chat-watching { margin: 0; padding: 0.5rem 0.7rem; font-size: 0.75rem; color: var(--text-2); }
.px-chat-watching { border-bottom: var(--border-w) solid var(--border); }
/* A GROUP'S MEMBERS, DRAWN AS OVERLAPPING PICTURES. They overlap so that four of them take about as
   much width as one contact's picture does, which is what keeps a group row the same height as a
   contact row beside it. */
.px-chat-faces { display: inline-flex; flex: none; align-items: center; }
.px-chat-faces > * { margin-right: -0.4rem; border-radius: 999px; }
.px-chat-faces > *:last-child { margin-right: 0; }

/* A LINE MOLE OFFICE WROTE. Small, grey, centred and with no bubble, because it is not somebody
   speaking: it says what happened to the group. A sender is asked for on these lines so
   they are not faked as an agent's, and this is the other half of that — a reader must not mistake
   one for an agent's words either. */
/* A SYSTEM NOTICE: a small grey block, centred in the flow, with no avatar and no bubble. The owner
   asked for the shape QQ uses for who joined and who left. The list item is
   the centring and the span inside is the block, because a block as wide as the panel would read
   as a heading over the messages under it rather than as one line among them. */
.px-chat-system {
  list-style: none;
  display: flex;
  justify-content: center;
  margin: 0.5rem 0;
  padding: 0 var(--pad-lg);
}
/* THE TIME OVER THE BLOCK. A column inside the centred row, so the row is still the
   centred flex row it has always been and the time sits above the block rather than beside it.
   THE 85 PER CENT CAP IS HERE AND NOT ON THE BLOCK. On the block it was 85% of the block's own
   natural width, so a line longer than 85% of itself wrapped onto two lines; measured on the
   owner's office, every join did. On the stack it is 85% of the conversation, which is the width
   a system line must fit in. */
.px-chat-system-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  min-width: 0;
  max-width: 85%;
}
.px-chat-system-when {
  display: flex;
  gap: 0.35rem;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
}

/* A LINE THAT HOLDS FOLDED LINES: the line, the press under it, and the folded lines under that,
   in one centred column. */
.px-chat-system[data-holds-folded='yes'] { flex-direction: column; align-items: center; }
/* A LINE THAT CARRIES AN OFFER: the offer goes under the line, in the same centred column. Beside it, the line was
   squeezed to three short lines and at 390 pixels its words were cut off (round 45's pictures). */
.px-chat-system[data-carries-an-offer='yes'] { flex-direction: column; align-items: center; gap: 0.3rem; }
.px-chat-folded-press {
  margin: 0.15rem 0 0;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-2);
  font-size: var(--fs-1);
  text-decoration: underline;
  cursor: pointer;
}
.px-chat-folded-press:hover { color: var(--text-1); }
.px-chat-folded {
  list-style: none;
  align-self: stretch;
  margin: 0.25rem 0 0;
  padding: 0;
  /* THE STRONG BORDER, which is held to 3:1 in every theme: this line is the only thing that says where the
     opened lines end. The plain border was too faint to see in the dark look (the secretary's review, round 32). */
  border-top: var(--border-w) dashed var(--border-strong);
  border-bottom: var(--border-w) dashed var(--border-strong);
}
.px-chat-folded > .px-chat-system { margin: 0.3rem 0; }

.px-chat-system-block {
  max-width: 100%;
  padding: 0.2rem 0.55rem;
  border-radius: 0.6rem;
  background: var(--hover, rgb(127 127 127 / 10%));
  color: var(--text-3);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  text-align: center;
  overflow-wrap: anywhere;
}
/* The notice is the content of the office conversation, so its bodies also wrap on a phone. */
[data-office-notices='yes'] .px-chat-system-block { white-space: normal; overflow: visible; }

.px-chat-leave {
  margin: 0 var(--pad-lg) var(--pad);
  align-self: stretch;
}
.px-chat-leave:not(:has(.tiered-press > :not(style))) { display: none; }
.px-chat-sides { display: flex; gap: 0.3rem; margin-top: 0.15rem; flex-wrap: wrap; }
.px-chat-side {
  font-size: 0.7rem;
  border: var(--border-w) solid var(--border);
  border-radius: 999px;
  padding: 0.05rem 0.4rem;
  background: none;
  color: var(--text-2);
  cursor: pointer;
}
.px-chat-side[data-chosen='yes'] { border-color: var(--chosen-edge); color: var(--chosen-ink); background: var(--chosen-bg); box-shadow: var(--chosen-shadow); font-weight: 600; }
/* A PAIR WHOSE READ WAS REFUSED: the reason and the press back, in the middle of the panel (wave 13y round 95). */
.px-chat-refused {
  margin: auto;
  padding: var(--pad-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  text-align: center;
}
.px-chat-refused-why { margin: 0; font-size: var(--fs-1); color: var(--text); overflow-wrap: anywhere; }
.px-chat-refused-back {
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font: 600 var(--fs-1)/1.2 var(--font-ui);
  padding: 0.35rem 0.7rem;
  cursor: pointer;
}
.px-chat-refused-back:hover { background: var(--hover); }

/* 40rem IS ONE OF THE INTERFACE'S OWN BREAKPOINTS, and that is why it is this number rather than a
   width that suits this panel. tests/review-covers-four-widths.test.ts fails a new breakpoint that
   leaves a band nothing photographs: at 30rem it named 480px to 640px, where the interface would
   have drawn differently and no photograph would have been taken. */
@media (max-width: ${THE_WHOLE_SCREEN_BELOW}) {
  /* THE PANEL STANDS ON THE FOOT OF THE WINDOW, both edges wide, and up to 80dvh tall, so some of the page stays in
     sight above it and none below it (wave 13y round 165). It stopped 4.5rem above the foot to clear the chat's circle,
     and a strip of the page showed under it. The corner button can stay visible and close the panel. */
  .px-chat {
    right: 0;
    left: 0;
    bottom: 0;
    width: auto;
    height: auto;
    max-width: none;
    max-height: 80dvh;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }
  .px-chat-circle { right: var(--fab-inset); bottom: var(--fab-inset); }
  /* The button stays at the foot, so leave its room below the window's controls. */
  .px-chat-circle ~ .px-chat[data-where='corner'] { padding-bottom: var(--fab-room); }
  /* AND THERE IS NOTHING TO DRAG. The component does not draw the handles at this width; this is
     the second half of the same answer, for a panel drawn before its JavaScript has run. */
  .px-chat-grip { display: none; }
  /* THE TWO PRESSES AT THE TOP ARE AS BIG AS A FINGER NEEDS. */
  .px-chat-chrome button { min-width: 2rem; min-height: 2rem; }
  /* A SYSTEM LINE ON A PHONE IS ONE LINE, FOLDED, NEVER A PARAGRAPH. The owner's picture of 12
     September 2026: the office's long cap-stopped notice filled the owner's chat with an agent. The few words
     in the body are what is drawn; for every line but the checklist lines below, the whole sentence is
     already the block's hover text, so nothing is lost. A nowrap and an ellipsis are what fold it: the
     clamp is on the block itself and needs no particular inner display, which a webkit-box clamp would. */
  .px-chat-system-block {
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* THE FIVE CHECKLIST LINES WRAP WHOLE, WITH NO CLAMP, BECAUSE A CUT WOULD LOSE THE THING'S NAME.
     Two decisions meet here. The picture of 12 September 2026 keeps every other system line folded to
     one line, by the rule above. The other decision asks a checklist line to say what thing and what
     happened, and these five carry no hover sentence, so an ellipsis or a line clamp would hide the
     item's name with nothing behind it to read. A phone has no hover either.
     THE LINE IS BOUNDED WITHOUT A CLAMP. The item's words or the checklist's title are cut at 40
     characters inside the line (theWordsTheNoticeNames in shared/groups.ts), so only the name of the
     agent whose checklist it was can make the line longer. Measured at 390: a done line with a
     57-character agent name and a cut item takes four lines, and with a 60-character name, the most
     a new registry name may be, five. */
  .px-chat-system-block[data-wraps-on-a-phone='yes'] {
    white-space: normal;
  }
  /* THE CROSS THAT CLOSES A STATUS EDITOR IS PRESSED BY A FINGER HERE. Its glyph is 1rem high with a line height of 1,
     so it was pressed in about 16 px at 390 (wave 13y round 81). The press area is 44 px each way, the size the top bar's
     links are given at a phone's width in src/web/styles.css, and the glyph keeps its size in the middle of it. */
  .px-chat-stop-editing {
    min-width: 44px;
    min-height: 44px;
  }
}

/* BELOW 1024 PIXELS THE OPEN CHAT COVERS THE SCREEN. The split is not two halves there: the page
   has no room for the chat beside it, so the chat takes the window and the seam becomes the bar
   across its top with the one shape that goes back. This is the shell's own breakpoint, not the
   panel's 40rem one: the 640 to 1024 band still has the whole screen to give the page. */
@media ${THE_NARROW_FROM} {
  /* Keep the floating quote press and the corner button separately reachable. */
  .px-chat-circle[data-quote-picking='yes'] { bottom: calc(var(--fab-inset) + var(--fab-size) + 0.5rem); }
  /* Leave the page reachable while the quote press is choosing a part of it. */
  .px-chat[data-quote-picking='yes'] {
    visibility: hidden;
    pointer-events: none;
  }
  .px-chat[data-quote-picking='yes'] .px-chat-quote-press {
    visibility: visible;
    pointer-events: auto;
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    z-index: var(--z-drawer);
    width: 2.75rem;
    height: 2.75rem;
    border: var(--border-w) solid var(--border-strong);
    background: var(--panel-2);
    box-shadow: 0 2px 12px rgb(0 0 0 / 22%);
  }
  .px-chat[data-where='split'] {
    inset: 0;
    width: auto;
    height: auto;
    max-width: none;
    max-height: none;
    border: none;
    border-radius: 0;
    box-shadow: none;
    flex-direction: column;
  }
  /* THE SIDE RULES ABOVE WOULD PLACE A COVERING CHAT AT ONE EDGE AND TURN IT SIDEWAYS. Both sides
     take the whole screen here, and the seam stays the top bar whichever side was left stored. */
  .px-chat[data-where='split'][data-chat-side='right'],
  .px-chat[data-where='split'][data-chat-side='left'] {
    inset: 0;
    flex-direction: column;
  }
  .px-chat-seam {
    width: 100%;
    height: auto;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem var(--pad);
    border-right: none;
    border-bottom: var(--border-w) solid var(--border-strong);
  }
  .px-chat-seam button { width: 2.5rem; height: 2.5rem; }
  .px-chat-seam-grip { display: none; }
}

/* HOW BIG THE CHAT'S OWN TEXT IS. Since 11 September 2026 a setting chooses the size of the
   chat's text.

   NOT THE APPEARANCE BAR'S TEXT SIZE. The data-size attribute on the html element moves the whole
   app's root font size, and every --fs-* token here already follows it because --fs-* is set in
   rem. That axis is untouched by what is below: nothing here reads or writes an --fs-* token or
   the data-size attribute, and normal -- the default, read exactly when nobody has chosen -- adds
   nothing, because every rule above this one is unchanged. Small and large are additive rules
   under a higher-specificity selector, so they override what they name and nothing they do not
   name moves.

   WHY A SCOPED ATTRIBUTE AND NOT A CONTAINER FONT-SIZE. This panel's own root element inheriting a
   smaller font-size would do nothing: every rule in this file states its own size, in rem, and rem
   is root-relative -- it ignores every ancestor between the element and the page's own root. The
   Markdown body block just above is the proof this is already how the chat draws Markdown at its
   own scale, by redeclaring the tokens the renderer reads rather than trying to make inheritance
   do it; the three blocks below do the same for the three things the setting names: the list, the
   bubbles and the box.

   ONLY WHAT THE SETTING NAMES MOVES. The list means the two lines somebody actually reads in a row -- the
   name and the last message or draft -- not the timestamp, the pencil or the tag, which stay at
   their fixed small sizes as decoration. The bubbles means the words and the Markdown paragraph
   size; a heading or a code span inside a chat message moves with it, proportionally, so the
   hierarchy inside one message is kept. The box means the compose textarea, which normally just
   inherits the page's own font and needs an explicit size to override that inheritance the same
   way the line-height rule beside it already does. */
.px-chat[data-chat-size='small'] .px-chat-name,
.px-chat[data-chat-size='small'] .px-chat-last { font-size: 0.7rem; }
.px-chat[data-chat-size='large'] .px-chat-name,
.px-chat[data-chat-size='large'] .px-chat-last { font-size: 1rem; }

.px-chat[data-chat-size='small'] .px-chat-words,
.px-chat[data-chat-size='small'] .px-chat-md {
  font-size: 0.78rem;
  --sb-read: 0.78rem;
  --sb-h3: 0.86rem;
  --sb-h4: 0.82rem;
  --sb-h5: 0.78rem;
  --sb-h6: 0.78rem;
}
.px-chat[data-chat-size='small'] .px-chat-md pre,
.px-chat[data-chat-size='small'] .px-chat-md code { font-size: 0.72rem; }
.px-chat[data-chat-size='large'] .px-chat-words,
.px-chat[data-chat-size='large'] .px-chat-md {
  font-size: 1.05rem;
  --sb-read: 1.05rem;
  --sb-h3: 1.15rem;
  --sb-h4: 1.1rem;
  --sb-h5: 1.05rem;
  --sb-h6: 1.05rem;
}
.px-chat[data-chat-size='large'] .px-chat-md pre,
.px-chat[data-chat-size='large'] .px-chat-md code { font-size: 0.95rem; }

.px-chat[data-chat-size='small'] .px-chat-box { font-size: var(--fs-1); }
.px-chat[data-chat-size='large'] .px-chat-box { font-size: var(--fs-3); }
`
