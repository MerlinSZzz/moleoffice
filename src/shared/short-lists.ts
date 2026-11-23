// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHORT ANSWERS A PAGE ASKS FOR, declared once for the server and the page.
 *
 * A page asks only for what it draws, as option 2 of a decision says. A
 * list door answers its whole rows to any caller that does not ask otherwise, so agents and tools
 * get what they always got. The page adds `?shape=page` and gets each row with only the fields its
 * rows draw. Each short row is cut by the functions below, so the type says exactly what is on
 * the wire.
 *
 * WHAT EACH ROW KEEPS, AND WHO DRAWS IT.
 *   - A group row: `id`, `name`, `openedBy`, `pinned`, `unread`, `anythingUnread`, and each member's
 *     `who`. The chat's Groups tab (`AGroupRow` and `whereEachGroupSits`) and the claims band (the
 *     group's name) read nothing else.
 *   - A participant row, a person's or an agent's: the fields `PARTICIPANT_FIELDS_THE_PAGES_READ`
 *     names below, each beside one place that reads it, and no other. A field the whole row does not
 *     carry stays absent. The pages read the list once through `readParticipantsOnce` in
 *     src/web/lib/oneread.ts, and the chat puts one participant read by itself into it with
 *     `namesWithOne` in src/web/lib/chatdeltas.ts (wave 13y round 27).
 *   - A between-agents row: `between`, `newSince`, `anythingNew`, and of the last message only its
 *     `id` and the first words of its `body`. The row draws the body on one line and cuts it with an
 *     ellipsis, so the words past the first `LAST_BODY_CHARACTERS` are never on the screen. A last
 *     message Mole Office wrote also carries `office`, the facts its words are made from in the page's
 *     language (wave 13n round 41).
 *   - A contact row: every field of the whole row but `last`, and of the last message only its `id`,
 *     `sentAt` and the first words of its `body`, with `office` as on a between-agents row. The chat's
 *     contact row (`ContactRow` in src/web/components/ContactChooser.tsx) draws the time and one line
 *     of words from it, and the events code (src/web/lib/chatdeltas.ts) compares ids and times. The
 *     rest of the row is the counts, the group, the place and the fold, which the list works over
 *     whole (wave 13x round 9).
 *   - A comment: `id`, `kind` and `writtenOrder`, and of its `data` only `body`, `target`, `context`
 *     and `sentBy`. Two things on a page read comments: the marks store (`notesWaiting` in
 *     src/web/components/agent/marks.ts, which the review column reads too) and the agent's card
 *     (`whatAgentsSaidOn` in src/web/components/agent/AgentSaidHere.tsx). The answer's
 *     `recipientNames` is kept whole beside the rows (wave 13y round 28). The card reads
 *     `writtenOrder` and not `createdAt`, which is kept to the second and cannot say which of two
 *     comments of the same second came first (wave 13y round 29).
 */

import { theWordsOfAnOfficeLine } from './dead-letter-lines.ts'
import type { Say } from './i18n.ts'
import type { PoolEntry } from './messages.ts'
import { isMoleOffice, type ParticipantRef } from './participants.ts'
import type { PanelRecord } from './types.ts'

/** The one value of `?shape=` a list door takes, and what the refusal of any other value says. */
export const PAGE_SHAPE = 'page'
export const PAGE_SHAPE_REFUSAL =
  'shape must be "page" for the fields the page draws, or left out for the whole answer'

// ---------------------------------------------------------------------------- groups

/** One member of a group, as the page's short groups list carries it. */
export interface ShortGroupMember {
  who: ParticipantRef
}

/** One group, as the page's short groups list carries it. */
export interface ShortGroupRow {
  id: string
  name: string
  openedBy: ParticipantRef
  members: ShortGroupMember[]
  unread: number
  anythingUnread: boolean
  pinned: boolean
  /** The projects its messages were written in or are marked about, latest first. */
  projects: string[]
}

/** Cut one whole group row to what the page draws. */
export function aGroupRowForThePage(row: {
  id: string
  name: string
  openedBy: ParticipantRef
  members: readonly { who: ParticipantRef }[]
  unread: number
  anythingUnread: boolean
  pinned: boolean
  projects: readonly string[]
}): ShortGroupRow {
  return {
    id: row.id,
    name: row.name,
    openedBy: row.openedBy,
    members: row.members.map((member) => ({ who: member.who })),
    unread: row.unread,
    anythingUnread: row.anythingUnread,
    pinned: row.pinned,
    projects: [...row.projects],
  }
}

// ---------------------------------------------------------------------------- participants

/** Every field the shared participant cache's readers read, and one reader of each. */
export const PARTICIPANT_FIELDS_THE_PAGES_READ = [
  'id', // src/web/components/Sidebar.tsx usePersonName
  'kind', // src/web/components/Forced.tsx nameOf
  'name', // src/web/components/Sidebar.tsx usePersonName
  'handle', // src/web/components/Chat.tsx openTheNewAgent
  'avatarUrl', // src/web/components/Chat.tsx TheChat
  'state', // src/web/components/Chat.tsx TheChat
  'newerOfASharedName', // src/web/components/ContactChooser.tsx ContactRow
  'retired', // src/web/components/ContactChooser.tsx facesInAGroup
  'retiredAt', // src/web/components/ContactChooser.tsx ContactRow
  'stateBy', // src/web/components/Chat.tsx TheChat
  'circleShows', // src/web/components/Chat.tsx TheChat
  'circlePicture', // src/web/components/Chat.tsx TheChat
  'messageLinkLevel', // src/web/components/Chat.tsx TheChat
  'messageLinkLayout', // src/web/components/Chat.tsx TheChat
  'messageProjectMark', // src/web/components/Chat.tsx TheChat
  'messagePictures', // src/web/components/Chat.tsx TheChat
  'mediaLoad', // src/web/components/Chat.tsx TheChat
  'chatTextSize', // src/web/components/Chat.tsx TheChat
  'chatButtonStays', // src/web/components/Chat.tsx TheChat
  'chatOpensAs', // src/web/components/Chat.tsx TheChat
  'chatLayout', // src/web/components/Chat.tsx TheChat
  'startingMode', // src/web/lib/starting-mode.ts takeTheStartingMode
  'role', // src/web/components/ContactChooser.tsx ContactRow
  'shortcuts', // src/web/lib/shortcuts.ts readShortcuts
  'chatLabels', // src/web/components/Chat.tsx TheChat
  'shippedFlags', // src/web/components/Chat.tsx TheChat
  'sendKey', // src/web/lib/send-key.ts readSendKey
  'language', // src/web/lib/language.ts readLanguage
  'record', // src/web/components/agent/TalkBox.tsx carryTheShownRecipient
  'addressAs', // src/web/components/ResidentProposals.tsx ResidentProposals
  'themes', // src/web/lib/the-look.ts readThePersonsLook
] as const

/** Keep only the page's fields, preserving each own value and leaving absent fields absent. */
export function aParticipantRowForThePage<Row extends object>(
  row: Row,
): Pick<Row, Extract<keyof Row, typeof PARTICIPANT_FIELDS_THE_PAGES_READ[number]>> {
  const page = { ...row }
  for (const field in page) {
    if (!PARTICIPANT_FIELDS_THE_PAGES_READ.some(kept => kept === field)) delete page[field]
  }
  return page
}

// ---------------------------------------------------------------------------- comments

/**
 * A comment as GET /api/messages/comments answers it: the whole record, and its place in the order the
 * comments were written, 1 for the first (`withTheOrderWritten` in src/server/lib/messages.ts).
 */
export type ACommentWithItsWrittenOrder = PanelRecord & { writtenOrder: number }

/** Every field of a comment the page reads, other than `data`, and one reader of each. */
export const COMMENT_FIELDS_THE_PAGES_READ = [
  'id', // src/web/components/agent/marks.ts notesWaiting
  'kind', // src/shared/messages.ts targetOfRecord
  'writtenOrder', // src/web/components/agent/AgentSaidHere.tsx whatAgentsSaidOn
] as const

/** Every field of a comment's `data` the page reads, and one reader of each. */
export const COMMENT_DATA_THE_PAGES_READ = [
  'body', // src/web/components/agent/marks.ts notesWaiting
  'target', // src/shared/messages.ts targetOfRecord, for a comment that is a message
  'context', // src/shared/messages.ts targetOfRecord, for a comment written as an annotation
  'sentBy', // src/web/components/agent/AgentSaidHere.tsx senderOf
] as const

/** One comment as the page shape carries it. Its `data` has only the fields above that the comment has. */
export type ACommentOnThePage<Row extends { data: Record<string, unknown> }> =
  Pick<Row, Extract<keyof Row, typeof COMMENT_FIELDS_THE_PAGES_READ[number]>> &
  { data: Partial<Record<typeof COMMENT_DATA_THE_PAGES_READ[number], unknown>> }

/** Keep only the page's fields, on copies, so the whole comment the server keeps for other readers stays whole. */
export function aCommentRowForThePage<Row extends { data: Record<string, unknown> }>(row: Row): ACommentOnThePage<Row> {
  const page: Record<string, unknown> = { ...row }
  for (const field in page) {
    if (field !== 'data' && !COMMENT_FIELDS_THE_PAGES_READ.some(kept => kept === field)) delete page[field]
  }
  const data = { ...row.data }
  for (const field in data) {
    if (!COMMENT_DATA_THE_PAGES_READ.some(kept => kept === field)) delete data[field]
  }
  page['data'] = data
  return page as ACommentOnThePage<Row>
}

// ---------------------------------------------------------------------------- between agents

/**
 * HOW MANY CHARACTERS OF THE LAST MESSAGE A BETWEEN-AGENTS ROW CARRIES.
 *
 * The row draws the body on one line, and the line is cut with an ellipsis where the panel ends
 * (the rule on `.px-chat-last` in src/web/components/Chat.tsx: no wrapping, overflow hidden). 600
 * characters fill that line up to about 3,300 pixels wide at the chat's smallest text size, which is
 * wider than a panel filling a 1440-pixel window.
 */
export const LAST_BODY_CHARACTERS = 600

/**
 * The first `LAST_BODY_CHARACTERS` characters of a message body, with "…" added where it was cut.
 *
 * It counts characters as a person does, not UTF-16 units, so a cut never splits an emoji or any
 * other character written with two units. A body no longer than the limit comes back unchanged.
 */
export function theFirstWords(body: string): string {
  // A string of this many UTF-16 units or fewer cannot hold more characters than the limit.
  if (body.length <= LAST_BODY_CHARACTERS) return body
  // ONLY AS FAR AS THE CUT IS READ. Splitting a whole long body into characters was 27 ms of the page's list on an office of
  // the live shape (wave 13y round 13). `for...of` steps through a string by the same characters `Array.from` makes.
  let counted = 0
  let units = 0
  for (const character of body) {
    if (counted === LAST_BODY_CHARACTERS) return `${body.slice(0, units)}…`
    counted += 1
    units += character.length
  }
  return body
}

/**
 * WHAT A LINE MOLE OFFICE WROTE IS WORDED FROM, beside its body: the fields `theWordsOfAnOfficeLine` in
 * shared/dead-letter-lines.ts reads. The opened conversation words the line from them in the page's language, so
 * the row carries them and words it the same way (`theLastLineInWords`).
 */
export type ShortOfficeLine = Pick<PoolEntry, 'sentBy' | 'sentAt' | 'toGroup' | 'saidInFull' | 'deadLetterSweepSaid' | 'deadLetterSummarySaid'>

/** The last message of a between-agents row, as the page's short list carries it. `office` only where Mole Office wrote it. */
export interface ShortLastMessage {
  id: string
  body: string
  office?: ShortOfficeLine
}

/** Of a last message, the fields a short row is cut from. */
type ALastMessage = Pick<PoolEntry, 'id' | 'body'> & Partial<ShortOfficeLine>

/** The facts of a line Mole Office wrote, or undefined because somebody else wrote it. */
function theOfficeLinesFacts(last: ALastMessage): ShortOfficeLine | undefined {
  const sentBy = last.sentBy ?? null
  if (sentBy === null || !isMoleOffice(sentBy) || last.sentAt === undefined) return undefined
  return {
    sentBy,
    sentAt: last.sentAt,
    toGroup: last.toGroup ?? null,
    saidInFull: last.saidInFull ?? null,
    ...(last.deadLetterSweepSaid === undefined ? {} : { deadLetterSweepSaid: last.deadLetterSweepSaid }),
    ...(last.deadLetterSummarySaid === undefined ? {} : { deadLetterSummarySaid: last.deadLetterSummarySaid }),
  }
}

/**
 * THE WORDS A BETWEEN-AGENTS ROW DRAWS UNDER THE NAMES: the few words the opened conversation draws for the same
 * message. A line Mole Office wrote is worded from its facts in the page's language, as `SystemLine` in
 * src/web/components/Chat.tsx words it; every other line is its body.
 */
export function theLastLineInWords(say: Say, last: ShortLastMessage): string {
  if (last.office === undefined) return last.body
  return theWordsOfAnOfficeLine(say, { ...last.office, body: last.body }).line
}

/** One conversation between two agents, as the page's short list carries it. */
export interface ShortBetweenAgentsRow {
  between: [ParticipantRef, ParticipantRef]
  last: ShortLastMessage
  newSince: number
  anythingNew: boolean
  /** The projects its messages were written in or are marked about, latest first. */
  projects: string[]
}

/** Cut one whole between-agents row to what the page draws. */
export function aBetweenAgentsRowForThePage(row: {
  between: [ParticipantRef, ParticipantRef]
  last: ALastMessage
  newSince: number
  anythingNew: boolean
  projects: readonly string[]
}): ShortBetweenAgentsRow {
  const office = theOfficeLinesFacts(row.last)
  return {
    between: row.between,
    last: { id: row.last.id, body: theFirstWords(row.last.body), ...(office === undefined ? {} : { office }) },
    newSince: row.newSince,
    anythingNew: row.anythingNew,
    projects: [...row.projects],
  }
}

// ---------------------------------------------------------------------------- contacts

/** The last message of a contact row, as the page's short list carries it: a between-agents row's, and when it was sent. */
export interface ShortContactLast extends ShortLastMessage {
  sentAt: string
}

/**
 * Cut one whole contact row to what the page draws: the row as it is, with its last message cut.
 *
 * THE WORDS ARE CUT AT `LAST_BODY_CHARACTERS`, and the row draws at most the first 120 of them with
 * the inline markers taken out. So a marker opened before the cut and closed after it is drawn as it
 * was typed on the row. The opened conversation draws the whole message.
 */
export function aContactRowForThePage<Row extends { last: (ALastMessage & Pick<PoolEntry, 'sentAt'>) | null }>(
  row: Row,
): Omit<Row, 'last'> & { last: ShortContactLast | null } {
  const last = row.last
  if (last === null) return { ...row, last: null }
  const office = theOfficeLinesFacts(last)
  return { ...row, last: { id: last.id, sentAt: last.sentAt, body: theFirstWords(last.body), ...(office === undefined ? {} : { office }) } }
}

// ---------------------------------------------------------------------------- the offers panel

/**
 * TRUE WHEN A MESSAGE CARRIES A LEAD, which is the first thing that makes it an offer.
 *
 * `offersWaitingFor` in src/web/components/Leading.tsx skips an entry for which this is false before
 * it looks at anything else. So `GET /api/messages?only=waiting-for-me&leads=1` keeps only the
 * entries for which this is true, and the offers drawn from it are the offers drawn from the whole
 * list.
 */
export function carriesALead(entry: Pick<PoolEntry, 'lead'>): boolean {
  return entry.lead !== null && typeof entry.lead === 'object'
}

/**
 * HOW LONG "NOT NOW" PUTS A LEAD OFFER OFF, in minutes, by one decision and a
 * second.
 *
 * Not now keeps the message unread, and the offer comes back after a while. Thirty minutes is an
 * engineering choice for that while, because no number was named. This is the one place the number
 * is written. The server reads it to leave a put-off offer out of the offers read, and the page reads
 * it to keep the offer it was just told "Not now" off the screen until then.
 */
export const A_PUT_OFF_OFFER_COMES_BACK_AFTER_MINUTES = 30

/**
 * WHEN AN OFFER PUT OFF AT `putOffAtMs` COMES BACK, in milliseconds. Each Not now starts the wait
 * again from the moment it was pressed.
 */
export function whenAPutOffOfferComesBack(putOffAtMs: number): number {
  return putOffAtMs + A_PUT_OFF_OFFER_COMES_BACK_AFTER_MINUTES * 60_000
}

// ---------------------------------------------------------------------------- the chat circle

/**
 * WHAT A CLOSED CHAT PANEL DRAWS: who is reading, and the two halves of the number on the circle.
 *
 * `GET /api/messages/circle` answers it. `unread` is worked out by the same function as the
 * `unread` of `GET /api/messages/contacts`, from the same rows, so the two cannot disagree.
 */
export interface TheCircle {
  me: ParticipantRef
  unread: { messages: number; groups: number }
  workspaceId: string
}
