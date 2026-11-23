// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MESSAGE POOL OVER HTTP.
 *
 *   GET  /api/messages                       every message in this project, newest first
 *   GET  /api/messages/contacts              everybody you could write to, with the last line said
 *   GET  /api/messages/circle                who is reading, and the number on the chat circle alone
 *   POST /api/messages/contact-groups        make a group to put contacts in
 *   PATCH /api/messages/contact-groups/:key  rename one, or move it up or down
 *   POST /api/messages/contact-placements    move one contact to a group, or up or down inside its own
 *   GET  /api/messages/unregistered          what one writer nobody registered has sent you
 *   GET  /api/messages/conversation          what you and one other participant have said
 *   GET  /api/messages/comments              every comment in this project, of both kinds; ?shape=page for the page's fields
 *   GET  /api/messages/pictures              what may be sent as a picture: the size, and the types
 *   POST /api/messages/pictures              put a picture where a message can point at it
 *   POST /api/messages/files                 put any other file where a message can point at it
 *   GET  /api/messages/:id                   one message and how far it got with each recipient
 *   POST /api/messages/:id/mark              say a message has reached you, or that you have read it
 *   GET  /api/presence                       whether each person and each agent can be reached now
 *   GET  /api/presence/:kind/:id             the same for one of them
 *   GET  /api/messages/between-agents        every conversation between two agents
 *   GET  /api/messages/between/:pair         one of them, read as one of the two sees it
 *
 * WRITING A MESSAGE IS NOT HERE. A message is a record, so it is written at POST /api/records with
 * kind "message", exactly as a comment is, and who it is for and what it says go inside `data`.
 * theBodyThatWritesAMessage in src/shared/messages.ts builds the whole body. A second write door
 * would be a second set of rules about somebody's own words, which is the argument
 * src/server/api/annotations.ts already makes.
 *
 * THE RULES ARE IN src/server/lib/messages.ts, beside the refusals that name them. Nothing here
 * repeats one.
 */

import { agentMarksFor } from '../lib/agent-tags.ts'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { enWave13y } from '@shared/words/en-wave-13y.ts'
import { PARTICIPANT_KINDS, isMoleOffice, participantWord, type ParticipantRef } from '@shared/participants.ts'
import { DELIVERY_MARKS, SEEN_MARKS_IN_ONE_REQUEST_AT_MOST, UNREGISTERED_PREFIX, aMarkSaysItWasRead, participantFromKey, participantKey, unregisteredFromKey, unregisteredName, unregisteredWriterOf, sameParticipant, type PoolEntry } from '@shared/messages.ts'
import { CONTACT_LIST_MOST, CONTACT_LIST_PAGE, theRowsOnTopInDrawnOrder, theTypedWordsFindAContact } from '@shared/contacts.ts'
import { actorFrom } from '../lib/http.ts'
import { nothingWrittenSentence } from '../lib/records/patching.ts'
import { parse } from '../lib/parse.ts'
import { theMessageReadTookIt } from '@shared/handles.ts'
import { theRunAWriteCameFrom } from '../db/the-run-a-write-came-from.ts'
import { itChangesSomething, route } from '../lib/route.ts'
import { sendTheHeldDraftsOfThisRequestsRun, theAgentIsReplyingTo } from '../lib/turn-drafts.ts'
import { localStamp, nowStamp, readATypedTime } from '@shared/time.ts'
import { aRaiseCarriesIt, assertThePersonIsProved, type Actor } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { REMIND_ME_LATER_CHOICES } from '@shared/remind-me-later.ts'
import { THE_PERSON } from '@shared/person.ts'
import { fileAMarkBrokenPress } from '../lib/intent-mark-broken.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { EVERY_PROJECT } from '@shared/which-projects.ts'
import { MESSAGE_CENTRE } from '@shared/workspaces.ts'
import { PROJECTS_QUERY } from '@shared/across-projects.ts'
import { asksForEveryProject, theProjectsAsked } from '../lib/across-projects.ts'
import { agentsThePressWouldCarryFor, askForARunFor, startANewAgentFor, theAnsweringReadingOfTheWorker, whatAReadingSaysOfReach, whatHappensToAWaitingMessage, wouldThePressCarryAnything } from '../lib/worker.ts'
import { sqlite } from '../db/client.ts'
import { theFiledAliasesReadOnce, type TheFiledAliases } from '../lib/registry-aliases/runs.ts'
import { checkpointPage } from '../lib/worker-delivery/letters.ts'
import { participantForActor } from '../lib/participant-for-actor.ts'
import { theAgentAnArrivingReferenceNames } from '../lib/the-agent-an-arriving-reference-names.ts'
import { listParticipants } from '../db/list-participants.ts'
import { readParticipant } from '../db/read-participant.ts'
import { groupsFor } from '../lib/groups.ts'
import {
  GROUP_NAME_MAX,
  groupsOf,
  makeAContactGroup,
  moveAContact,
  moveAContactBy,
  moveAContactGroup,
  placeTheContacts,
  renameAContactGroup,
  setAContactGroupCollapsed,
  sidesOf,
  type ContactToPlace,
} from '../lib/contacts.ts'
import {
  asAContactToPlace,
  asContactsToPlace,
  everyAgentById,
  contactKey as keyOfContact,
  everybodyRegistered,
  type AMessageReader,
  forcedMessagesFor,
  type ContactLine,
} from '../lib/messages.ts'
// WHERE THE READER IS, measured on this request. Criterion M62 narrows an emergency by it.
import { writtenFrom } from '../lib/machines.ts'
import { theGroupForAHandOver, theSendersReadOncePerAnswer, type TheSenderOfAHandOver } from '../lib/who-sent-it.ts'
import { whatYourGroupsGained } from '../lib/group-news.ts'
import { groupNewsText } from '@shared/group-news.ts'
// TAKING A PICTURE SOMEBODY SENT AND PUTTING IT WHERE A MESSAGE CAN POINT AT IT. Criterion M65. The
// rules — the size, the three types, where the file goes and why an installation may be refused
// outright — are in that file, beside the refusals that name them.
import { MESSAGE_PICTURE_TYPES_READ, maxMessagePictureBytes, storeAMessageFile, storeAMessagePicture } from '../lib/messagepictures.ts'
import { MAX_REPORT_FILE_NAME, decodeReportFileBase64 } from '../lib/reportfiles.ts'
// THE THREE KINDS OF FILE THIS PRODUCT TAKES, from the one declaration. A message picture and an
// avatar are sniffed by the same reader, so they accept the same three, and a second list here
// would be free to promise a fourth.
import { UPLOADABLE_AVATAR_TYPES } from '@shared/participants.ts'
import { everybodysPresence, participantPresence, thePresenceOf, whichContactsAreOnline } from '../lib/presence.ts'
import { readAgentStatus, thePresenceAtHome } from '../lib/messages/status.ts'
import type { PluginAgentStatus, PluginStatusReading } from '@shared/plugin-read.ts'
import { CHAT_WORDS, NEITHER_SIDE, SINCE_REFUSAL, SINCE_WITHOUT_GROUP_REFUSAL, theBodyThatWritesAMessage, type DeliveryOnTheWire } from '@shared/messages.ts'
import { AGENT_CONVERSATIONS_PAGE_SIZE, aPageOfAgentConversations } from '../lib/a-page-of-agent-conversations.ts'
// THE SHORT ANSWERS THE PAGE ASKS FOR, and the circle's shape, are option 2 of a decision.
import { A_PUT_OFF_OFFER_COMES_BACK_AFTER_MINUTES, LAST_BODY_CHARACTERS, PAGE_SHAPE, PAGE_SHAPE_REFUSAL, aBetweenAgentsRowForThePage, aCommentRowForThePage, aContactRowForThePage, carriesALead, type TheCircle } from '@shared/short-lists.ts'
import {
  type KnownParticipant,
  commentRecordsIn,
  withTheOrderWritten,
  conversationWithUnregistered,
  conversationsBetweenAgents,
  theContactsOfOneReader,
  withTheOwnRecordsOf,
  withTheRecordsOfTheseIds,
  theNarrowingsByWho,
  pairFrom,
  pairKey,
  recordThatSomebodyRead,
  theAgentTheDoorToOnePairReads,
  whenTheyLastRead,
  conversationBetween,
  markDelivery,
  markManyDelivered,
  markManySeen,
  theDeliveryRowsOf,
  putOffALeadOffer,
  remindMeLater,
  theOffersPutOffFor,
  messagesWaitingFor,
  aPageOfWaitingLeads,
  messagesInAGroupAfter,
  thePoolCountedFor,
  thePoolThisReaderMayRead,
  theseMessagesOfThePool,
  theIdsWaitingForTheAnswerOf,
  readMessage,
  readMessageWhereverItIs,
  onlyTheMessagesThisReaderMayRead,
  refuseAMessageThisReaderMayNotRead,
  theMessageReader,
  theMessagesThisReaderMayRead,
  unreadAmong,
  unreadInAGroup,
  withTheseMessagesReadAgain,
  A_CONVERSATION_PAGE_HOLDS_AT_MOST,
  aPageOfTheConversation,
  theQueuedOnesOfTheConversation,
  theUnsentOnesOfTheConversationFrom,
} from '../lib/messages.ts'
import { whyReadingSomebodyElsesIsRefused } from '@shared/why-reading-somebody-elses-is-refused.ts'
import { recipientNamesOfComments, whatAReviewKeepsFromTheWaitingList, whatAReviewKeptBack } from '../lib/reviews.ts'
import { theCommentsAnswer } from '../lib/comments-answer.ts'

// ============================================================================ the sentences

/** The most messages one page of `GET /api/messages` may carry. Named once, so the refusal and the code agree. */
export const POOL_PAGE_MAX_LIMIT = 1000

/**
 * HOW MANY MESSAGES A POOL READ ANSWERS WHEN IT NAMES NO `limit`: one page, and the largest one, so it is
 * `POOL_PAGE_MAX_LIMIT` itself. Both are declared above `POOL_PAGE_NOTE` because the note reads the number when this
 * module loads; a later declaration would throw on that read. A call that names none used to build every message of
 * the office and answer them all. A caller that needs every message follows the reply's `next`.
 */
export const POOL_PAGE_DEFAULT = POOL_PAGE_MAX_LIMIT

/**
 * THE MESSAGES PAGE'S WORDS, kept as a paragraph of their own: the narrowings a page asks for and the numbers its
 * answer carries. POOL_NOTE is composed from them, so the door's one note still describes the pool and its page, and a
 * caller that wants only the page's words reads this constant.
 */
export const POOL_PAGE_NOTE =
  'THE MESSAGES PAGE READS ONE PAGE AT A TIME: ?sender= and ?contact= name a participant as kind:id, ?group= a ' +
  'group id, ?state= one of queued, delivered, seen, comment or nowhere, and ?words= text looked for in the ' +
  'message itself, case folded; ?limit= and ?offset= cut the page. ' +
  // THIS SENTENCE IS PLAIN ENGLISH AND NOT A WORD: no page draws the note, and as a word it waited for translation in
  // every language, where Settings drew its bare key wider than its card.
  'A CALL THAT NAMES NO limit ANSWERS ONE PAGE: the newest ' + String(POOL_PAGE_DEFAULT) + ' messages that match, ' +
  'and the reply says left and next when more remain. A caller that needs every message follows next, or asks a ' +
  'narrower read. ' +
  'Every narrowing runs over the whole pool ' +
  'before the page is cut. The answer carries total (the messages before ' +
  'these narrowings), matched, returned, left, truncated, next (the request for the next page) and ' +
  'unreadForYou, how many of the matched messages you have not read, on every page. ' +
  'A GROUP CAN BE READ FROM A MOMENT ON: ?since= with ?group= keeps only that group\u2019s messages sent after the ' +
  'moment it names, strictly after it, so a message stored at that same second is left out. It takes the ' +
  'office\u2019s own time, as 2026-11-14 22:20:35, or an ISO time with its zone, as 2026-11-14T22:20:35Z, and the ' +
  'answer\u2019s since says which moment of the office\u2019s clock it read. ?since= is refused without ?group=, because ' +
  'it narrows a group\u2019s messages.'

const POOL_NOTE =
  enWave13y['server.queuedAgentIds'] + ' ' +
  'EVERY MESSAGE IN THIS PROJECT THAT YOU MAY READ, newest first. The owner and the secretaries may read every ' +
  'message; an agent may read the ones it sent, the ones addressed to it and the ones sent to a group it was in ' +
  'when they were sent, and every narrowing and count below is over those alone. One message is one thing said by one participant to another: a ' +
  'line on the message board, a message in a conversation, and a comment left on a page are all in here, because ' +
  'they are one kind of thing. A PLAIN CALL ANSWERS EACH ID, TITLE AND wordsMayChangeUntil, ' +
  'which says when the words may still change; ?full=1 asks for the whole entry, and ?narrow=1 asks the ' +
  'same narrow entry explicitly. Each full entry carries who ' +
  'sent it as a participant, who it reached, when it was sent, what on a page it is about when it is a comment, ' +
  'and one delivery mark per recipient, and whoSentIt: who sent it, read from the registries, in the words every hand-over prints, and ' +
  'howToAddressTheSender: how that sender asks to be addressed, or null when it set no part, and fromGroup: the ' +
  'group it was sent to, as its id and its title now, or null when it was sent to no group. ' +
  'Writing one is POST /api/records with ' +
  theBodyThatWritesAMessage({ to: [{ kind: 'agent', id: '<an id>' }] }, '<what you say>') +
  ', with `toGroup` and a group id in place of `to` for a group. ' +
  'NARROWED WITH ?only=: "waiting-for-me" answers only the messages with a delivery to you that you have not ' +
  'marked seen; "queued-for-agents" only the messages with a delivery to an agent that nothing has taken yet; ' +
  '"addressed-to-me-or-nobody" only the messages addressed to you or addressed to nobody at all, in every read ' +
  'state — what your own board and the open board hold, and nothing addressed only to somebody else; ' +
  '"waiting-for-my-answer" only the messages waiting for your answer: their writer set asksThePerson to true, they ' +
  'were addressed to you as a person, and you have written nothing to their sender since, in any project (reading ' +
  'one does not answer it). An agent is never asked this way, so it gets none. ' +
  'AN AGENT\u2019S waiting-for-me LIST LEAVES OUT A COMMENT A REVIEW KEEPS BACK: one a review that has not been sent ' +
  'holds, as the message worker holds it, and one whose own delivery a sent review archived because the review\u2019s ' +
  'message carries it to you. keptBackByAReview then says how many of each (held, carried) and why, and is absent ' +
  'when nothing was left out. ' +
  'EVERY FULL ENTRY CARRIES asksThePerson: true when its writer said it asks the person something, false when its ' +
  'writer said it does not, and null when nobody said, which is every message written before the field existed. ' +
  'Each is the same rows the whole pool holds, fewer of them: the whole pool is 2.4 MB here and a lead pop-up ' +
  'that reads it on every delivery change was reading all of it for a handful of lines. ' +
  '?leads=1 keeps only the entries that carry a lead, which is what the offers panel draws; it combines with the ' +
  'other two. With only=waiting-for-me it is the offers read: it also leaves out an offer you put off with Not now ' +
  `(POST /api/messages/:id/not-now) less than ${String(A_PUT_OFF_OFFER_COMES_BACK_AFTER_MINUTES)} minutes ago, and offersComeBackInSeconds says when the first ` +
  'of those comes back, or is null. ' +
  'A READ MARKS NOTHING unless you ask: ?markDelivered=1, with only=waiting-for-me, says this read hands you the ' +
  'words. Your own deliveries on the page that are still queued then become delivered, the answer shows them so and ' +
  'lists their ids in markedDelivered, and none becomes seen: mark each one seen with POST /api/messages/:id/mark. ' +
  'The dead-letter sweep reads a delivery still queued as a message that never reached you. ' +
  'With only=waiting-for-me the read first sends the messages your run holds in this turn; ?leaveHeld=1 leaves them ' +
  'held, which is what a hook that reads after each step asks. ' +
  POOL_PAGE_NOTE

/**
 * HOW FAR A MESSAGE GOT, AS THE MESSAGES PAGE ASKS FOR IT: one of the four delivery marks, `comment`
 * for a message written on a page, or `nowhere` for a message that reached nobody.
 */
export const POOL_STATE_CHOICES = [...DELIVERY_MARKS, 'comment', 'nowhere'] as const
export type PoolStateChoice = (typeof POOL_STATE_CHOICES)[number]

/**
 * THE MOMENT A `since` NAMES, in the office's stored form, or null when it names none. It takes the office's own time
 * to the second, `2026-11-14 22:20:35`, and an ISO time carrying its own zone, `2026-11-14T22:20:35Z`, whose instant
 * is written on the office's clock. Anything else — a bare date, a time with no zone, words — names no moment, and
 * the door refuses it with `SINCE_REFUSAL`.
 */
function theMomentASinceNames(text: string): string | null {
  // THE OFFICE'S OWN FORM, exactly as a stored stamp is written: a space, and the seconds.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return readATypedTime(text)
  // AN ISO TIME WITH A ZONE. A time with no zone names no moment, so it is not one of these.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(text)) return null
  const ms = Date.parse(text)
  return Number.isNaN(ms) ? null : localStamp(new Date(ms))
}

/** The narrowings the pool door takes, and what each keeps.
 *
 * THE WORDS ARE OFF UNLESS ASKED FOR. A caller reading the pool for marks,
 * addressees and leads — the start-a-new-agent press reads who a queue is waiting for — was paying
 * every row's words for them. A plain call answers each id, title and `wordsMayChangeUntil`,
 * which says when the words may still change; `full=1` answers the
 * whole entry, and `narrow=1` stays accepted and answers the same narrow entry explicitly.
 * `markDelivered=1` implies the whole entry, because its own sentence says that read hands the words
 * over. A `narrow` or `full` value that is not exactly 1 is refused rather than read as its absence,
 * so two spellings of "full" cannot both read as bodies, and asking for both is refused with both
 * named. */
const whichPool = z
  .object({
    only: z.enum(['waiting-for-me', 'queued-for-agents', 'addressed-to-me-or-nobody', 'waiting-for-my-answer']).optional(),
    checkpoint: z.literal('1').optional(),
    narrow: z
      .literal('1', { error: 'narrow must be exactly 1: ?narrow=1 answers ids, titles and when words may still change' })
      .optional(),
    // THE WHOLE ENTRY, WORDS AND ALL. A plain call answers the narrow entry now, so a caller that reads what
    // somebody said asks for this. Refused unless it is exactly 1, for the reason `narrow` is.
    full: z
      .literal('1', { error: 'full must be exactly 1: ?full=1 answers every entry with its words' })
      .optional(),
    // ONLY THE ENTRIES THAT CARRY A LEAD, which are the only entries the offers panel can draw.
    // Refused unless it is exactly 1, for the reason `narrow` is.
    leads: z
      .literal('1', { error: 'leads must be exactly 1: ?leads=1 answers only the entries that carry a lead' })
      .optional(),
    offerFrom: z.string().trim().min(1).optional(),
    // THE READER SAYS IT HANDS THESE WORDS TO THEIR RECIPIENT, so its own deliveries on the page become delivered. See
    // `handedOver` in the door below. Refused unless it is exactly 1, for the reason `narrow` is.
    markDelivered: z
      .literal('1', { error: 'markDelivered must be exactly 1: ?markDelivered=1 marks delivered the messages this read hands you' })
      .optional(),
    // A HOOK READS WHAT WAITS FOR ITS RUN, and the run's held messages stay held (lib/turn-drafts.ts). Refused unless it
    // is exactly 1, for the reason `narrow` is.
    leaveHeld: z
      .literal('1', { error: "leaveHeld must be exactly 1: ?leaveHeld=1 reads what waits for you and leaves your run's held messages held" })
      .optional(),
    // THE MESSAGES PAGE'S NARROWINGS AND ITS PAGE. See `POOL_PAGE_NOTE`.
    sender: z.string().trim().min(1, { error: 'sender must name a participant as kind:id' }).optional(),
    contact: z.string().trim().min(1, { error: 'contact must name a participant as kind:id' }).optional(),
    group: z.string().trim().min(1, { error: 'group must name a group id' }).optional(),
    // FROM A MOMENT ON, WITH ONE GROUP: a message at the moment's own second is not after it, so it is left out. The
    // forms are checked below, against the door's sentence; the read is the group's alone (see `POOL_PAGE_NOTE`).
    since: z.string().trim().min(1, { error: SINCE_REFUSAL }).optional(),
    state: z
      .enum(POOL_STATE_CHOICES, { error: `state must be one of: ${POOL_STATE_CHOICES.join(', ')}` })
      .optional(),
    words: z.string().trim().min(1, { error: 'words must say what to look for: leave it out to keep every message' }).optional(),
    // WHICH PROJECTS, read as wave 13j's doors read it (src/shared/across-projects.ts; the secretary's message TL2JENjl3ZgH): `all`
    // is every message the reader may read, across projects, which is also what leaving it out answers, and a project id is
    // that project's view of the message centre: the messages written in it, about it, or commenting
    // on one of its records. THE VALUE IS HANDED OVER AS IT CAME: `theProjectsAsked` is the one reader of it, so the spaces
    // around it are taken off, and an empty value is refused, in the same words at every `?projects=` door.
    [PROJECTS_QUERY]: z.string().optional(),
    limit: z.coerce
      .number({ error: 'limit must be a whole number of messages' })
      .int({ error: 'limit must be a whole number of messages' })
      .min(1, { error: 'limit must be at least 1' })
      .max(POOL_PAGE_MAX_LIMIT, {
        error: `limit must be ${String(POOL_PAGE_MAX_LIMIT)} or less — that is the most this route answers in one page`,
      })
      .optional(),
    offset: z.coerce
      .number({ error: 'offset must be a whole number of messages to skip' })
      .int({ error: 'offset must be a whole number of messages to skip' })
      .min(0, { error: 'offset must be 0 or more' })
      .optional(),
  })
  .strict()
  .refine((asked) => asked.markDelivered === undefined || asked.only === 'waiting-for-me', {
    path: ['markDelivered'],
    message: 'goes with only=waiting-for-me, the read of the messages to you that you have not marked seen. Nothing was read or marked',
  })
  .refine((asked) => asked.markDelivered === undefined || asked.narrow === undefined, {
    path: ['markDelivered'],
    message: 'says this read hands you the words, and narrow=1 leaves the words out, so ask for one of the two. Nothing was read or marked',
  })
  .refine((asked) => asked.narrow === undefined || asked.full === undefined, {
    path: ['full'],
    message: 'narrow=1 leaves the words out and full=1 asks for them, so ask for one of the two. Nothing was read or marked',
  })
  .refine((asked) => asked.leaveHeld === undefined || asked.only === 'waiting-for-me', {
    path: ['leaveHeld'],
    message: "goes with only=waiting-for-me, the read that sends your run's held messages first. Nothing was read or sent",
  })
  .refine((asked) => asked.since === undefined || theMomentASinceNames(asked.since) !== null, {
    path: ['since'],
    message: SINCE_REFUSAL,
  })
  .refine((asked) => asked.since === undefined || asked.group !== undefined, {
    path: ['since'],
    message: SINCE_WITHOUT_GROUP_REFUSAL,
  })


/** What the pool door adds to its answer when any of the page's narrowings or its page is asked for. */
export interface PoolPage {
  /** How many messages the pool held before these narrowings (after `only` and `leads`). */
  total: number
  /** How many of those the narrowings kept, counted before the page was cut. */
  matched: number
  returned: number
  left: number
  truncated: boolean
  /** The request that carries the next page, or null when nothing was left. */
  next: string | null
  /**
   * How many of the `matched` messages the reader has not read, on every page: a delivery to the
   * reader whose mark is not `seen`, the same rule `?only=waiting-for-me` keeps.
   */
  unreadForYou: number
}

/**
 * True when one message passes every narrowing that was asked for. A narrowing not asked for keeps
 * every message. `words` is looked for in the message's own words, case folded. `who` answers the
 * narrowings by sender and by contact (`theNarrowingsByWho`).
 */
function passesThePageNarrowings(
  one: PoolEntry,
  by: { sender?: string; contact?: string; group?: string; since?: string; state?: PoolStateChoice; words?: string },
  who: ReturnType<typeof theNarrowingsByWho>,
): boolean {
  if (by.sender !== undefined && !who.sentBy(one)) return false
  if (by.contact !== undefined && !who.reached(one)) return false
  if (by.group !== undefined && one.toGroup !== by.group) return false
  // STRICTLY AFTER: a message at the moment's own second is not after it.
  if (by.since !== undefined && one.sentAt <= by.since) return false
  if (by.words !== undefined && !one.body.toLowerCase().includes(by.words.toLowerCase())) return false
  if (by.state === 'comment') return one.target !== null
  if (by.state === 'nowhere') return one.deliveries.length === 0
  if (by.state !== undefined && !one.deliveries.some((d) => d.mark === by.state)) return false
  return true
}

const FORCED_NOTE =
  'THE EMERGENCY MESSAGES ADDRESSED TO YOU THAT THIS SCREEN HAS NOT DISMISSED. An emergency is ' +
  'drawn as a dialogue in the page with everything behind it blurred, and one press dismisses it. A message may ' +
  'be narrowed to one viewer — one machine, one browser — and whether THIS screen is that one is answered here, ' +
  'from the machine measured on this very request, because a browser cannot read the name of the computer it is ' +
  'running on. Dismissing is POST /api/messages/:id/mark with "seen", which is the same mark everything else ' +
  'uses, so an emergency dismissed on one screen is dismissed on all of them. Across every project, because an ' +
  'emergency addressed to a person is about the person.'

const CONTACTS_NOTE =
  'EVERYBODY YOU COULD WRITE TO, with the last thing said either way and how many of theirs you have not read. ' +
  'Who you are is read from the actor headers on the request: a caller neither registry holds is answered with ' +
  'the sentence saying how to register rather than with somebody else’s contacts. A ROW IS ONE OF TWO SHAPES. A ' +
  'registered contact carries `who` and a null `unregistered`. A writer nobody registered carries a null `who` ' +
  'and an `unregistered` naming the `from` line it typed, or the actor it claimed that no registry holds; there ' +
  'is nothing to write back to on one of those. `online` is true when the row\'s dot in this project is green, ' +
  'or grey with the words "In a terminal"; a person\'s dot is the presence they chose. ' +
  '`unread` is the number on the circle, in its two halves: ' +
  '`messages` is how many messages from these rows you have not read, and `groups` is how many GROUPS you are ' +
  'in hold anything unread — one per group, not one per message in it. A conversation between two agents is in ' +
  'neither, because you are not in it. Both are added up from these rows rather than counted again, so the circle ' +
  'cannot stand at a number you have no row to press. THE LIST HAS TWO LEVELS: the first ' +
  'is two locked top groups, Human and Agent, declared rather than stored and never renamed; `contactSides` names ' +
  'them with the fold state the person set on each. Every contact sits in a second-level group under one of them, ' +
  'and `contactGroups` names those in the order they are drawn, with the side each belongs to and whether it is ' +
  'folded. Under Agent the default groups are by role, in the person’s order — secretary, inspector, supervisor, worker, ' +
  'other, retired — and under Human there is one default group. A person falls onto Human and an agent or a writer ' +
  'nobody registered onto Agent, and a move across that line is refused rather than drawn. So a fresh ' +
  'installation is arranged with no rows written and nothing is written when a new agent arrives. What is stored ' +
  'is only what somebody CHANGED, through the four routes below. ?shape=page answers the same rows with only ' +
  'the id, the time and the first ' + String(LAST_BODY_CHARACTERS) + ' characters of each last message, with "…" where ' +
  'the body was cut, and the facts a line Mole Office wrote is worded from. Left out, every row is whole.'

const CIRCLE_NOTE =
  'WHO YOU ARE, AND THE NUMBER ON THE CHAT CIRCLE, AND NOTHING ELSE. A closed chat panel draws only the circle, ' +
  'so it asks this instead of the whole contact list. `unread` is exactly the `unread` of GET ' +
  '/api/messages/contacts: it is worked out by the same function from the same rows, in its ' +
  'two halves.'

const MAKE_A_GROUP_NOTE =
  'MAKE A SECOND-LEVEL GROUP. Body {"name": "…", "side": "human" | "agent"}, at most ' +
  String(GROUP_NAME_MAX) +
  ' characters. It goes at the end of that side, empty, and its key is a fresh id rather than its name — so ' +
  'renaming it moves nothing, and two groups may share a name. `side` fixes which of the two top groups it ' +
  'sits under, for good: the move door refuses to change it afterwards. The arrangement is yours: it is stored ' +
  'against whoever is asking, and it names no project, because which group an agent belongs in is a fact about ' +
  'the agent and the registries are the installation’s. THERE IS NO ROUTE THAT DELETES A GROUP: nothing here ' +
  'has ever needed one, and a delete would have to say what happens to the contacts in it.'

const CHANGE_A_GROUP_NOTE =
  'RENAME A GROUP, MOVE IT UP OR DOWN, OR FOLD IT AWAY. Body {"name"?: "…", "moveBy"?: -1 | 1, "collapsed"?: ' +
  'true | false} and at least one of them. Renaming works on a declared group as well as on one you made. ' +
  'Renaming or moving `human` or `agent` is refused, because those are the two locked top groups and their words ' +
  'and places are not yours to change. `moveBy` is one place at a time inside the group’s own ' +
  'side; moving the first group of a side up is refused rather than answered 200 for a move that did not happen. ' +
  '`collapsed` is the person’s fold state and is stored on the server, so it holds on every machine. ' +
  'The reply is every group in the order they are now drawn, and the two top groups with their fold state.'

const PLACE_A_CONTACT_NOTE =
  'MOVE ONE CONTACT TO A GROUP, OR UP OR DOWN INSIDE ITS OWN. Body {"contact": "…", "group"?: "…", "moveBy"?: -1 ' +
  '| 1} and at least one of the last two. `contact` is the key the contacts reply gave — `person:<id>`, ' +
  '`agent:<id>`, or one beginning `unregistered:` — so a writer nobody registered can be moved like anybody ' +
  'else. Moving it to a group puts it at the end of that group and drops any order it had, because a position ' +
  'was a position in the group it has left. A MOVE ACROSS THE LINE BETWEEN HUMAN AND AGENT IS REFUSED with a ' +
  'sentence and no write: an agent cannot go under a Human group and a person cannot go under ' +
  'an Agent group. `moveBy` moves it one place inside the group it is in; moving the first contact up is ' +
  'refused. The reply is every contact with the group it is now in and where it sits.'

const UNREGISTERED_NOTE =
  'WHAT ONE WRITER NOBODY REGISTERED HAS SENT YOU, oldest first. Ask for it with the `writer` key the contacts ' +
  'reply gave you. There is no other side to this conversation: nothing can be written back to a name with no ' +
  'registry row behind it. If that writer registers under the same handle or the same name, these messages move ' +
  'into its contact and this reply becomes empty — nothing is rewritten to make that happen, the move is worked ' +
  'out afresh on every read. THIS READ WRITES ONLY FOR A PERSON: the ones still queued for a person become ' +
  'delivered, exactly as they do when a person opens any conversation; an agent\'s read marks nothing.'

const CONVERSATION_NOTE =
  'WHAT YOU AND ONE OTHER PARTICIPANT HAVE SAID, oldest first. Ask for it with ?kind=agent&id=builder. THIS READ ' +
  'WRITES ONLY FOR A PERSON: when a person reads, every message in it that was addressed to them and was still ' +
  'queued is marked delivered, because it has reached their screen. When an agent reads, nothing is marked: a ' +
  'message to an agent is moved only by the hand that gives it the words — its waiter\'s take, the run the worker ' +
  'starts, or the agent\'s own POST /api/messages/:id/mark — and a line Mole Office wrote is moved by the ' +
  'worker, which starts no run for it. It never marks one read — that is POST /api/messages/:id/mark with ' +
  '"seen", which is you saying so. ONE PAGE AT A TIME: &limit=50 answers the newest 50; &before=<message id> ' +
  'the page just older than that message; &after=<message id> the messages newer than it, and with ' +
  '&since=<page.readAt of your last read> also the held messages that changed since, in page.changed, and the ' +
  'ones deleted, in page.gone. page.continuesFromTheCursor is false when the reply is the newest page instead. ' +
  'With &from=<the oldest message you hold> as well, page.changed names only that message and the ones after it, ' +
  'so a changed one there that you do not hold has joined among yours. ' +
  'A read of one page marks the whole conversation as a whole read does. ' +
  'ONLY YOUR UNSENT COMMENTS: &only=my-unsent answers in messages only the comments you wrote here that nobody has ' +
  'sent yet, in the order and the form a whole read gives them, and says only: "my-unsent"; every other field is ' +
  'as a whole read gives it. It marks as a page read does, and is refused with limit, before, after, since or from. ' +
  'WITH AN AGENT, status is its whole status, as GET /api/plugin-read/v1/status answers it with scope=home: its ' +
  'presence, its personal words and its unsettled runs, read in its home projects in the same moment as answering. ' +
  'It is {available: true, value: <the agent as the status view answers it>}, or {available: false} when it could ' +
  'not be read. Null for a person and for Mole Office itself, which have no such status.'

/** How many participants one `?of=` may name. A page asks for the rows it draws, which are fewer. */
const PRESENCE_OF_AT_MOST = 500

const PRESENCE_NOTE =
  'WHETHER EACH PERSON AND EACH DURABLE AGENT CAN BE REACHED RIGHT NOW, in three colours: green means something is ' +
  'serving them, grey means nothing is and they are still here, red means they are retired or in no registry. It ' +
  'is worked out at the moment you ask and stored nowhere. AN AGENT is measured: its answer says which of three ' +
  'things it was read from — a connection this server is holding open, a registered process the operating system ' +
  'says is running, or a run of theirs that wrote down output or used a tool recently — and an agent cannot ' +
  'declare itself online. A PERSON says it themselves: online, away or invisible, online being what nobody having ' +
  'chosen means. ' +
  'Invisible is here to an agent they have written to and, to every other, exactly what away looks like, sentence ' +
  'and all. Which of the three they chose is told to a person and never to an agent, or the hiding would be ' +
  'undone by the field beside the colour. Beside all of it is the state they wrote about themselves, kept exactly ' +
  'as they typed it, with a sentence saying it may be out of date when nothing is serving them. ' +
  '?of=agent:<id>,person:<id> answers only those, in the order asked, at most ' + String(PRESENCE_OF_AT_MOST) + ' of ' +
  'them; one nothing answers to is the red answer. Left out, everybody is answered. ' +
  'With ?of= and scope=home each registered agent is read in its home projects, as the chat reads it from any project: ' +
  'the project of its own record, the project of the session holding its handle, and each project where a run of it ' +
  'has not ended, or carries a message to hand over and is still inside its wait. Only an agent with none is read ' +
  'in every project. A person is read in this project either way.'

/** `?of=` of the presence door: participants as `kind:id`, joined by commas. */
const presenceOf = z.object({
  of: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined) return undefined
      const named = [...new Set(value.split(','))]
      if (named.length > PRESENCE_OF_AT_MOST) {
        ctx.addIssue({ code: 'custom', message: `of names ${String(named.length)} participants, and at most ${String(PRESENCE_OF_AT_MOST)} are answered in one read` })
        return z.NEVER
      }
      const whos: ParticipantRef[] = []
      for (const one of named) {
        const at = one.indexOf(':')
        const kind = one.slice(0, at)
        const id = one.slice(at + 1)
        if (at < 1 || id === '' || !(PARTICIPANT_KINDS as readonly string[]).includes(kind)) {
          ctx.addIssue({ code: 'custom', message: `of must name participants as kind:id joined by commas, kind being ${PARTICIPANT_KINDS.join(' or ')}; "${one}" is not one` })
          return z.NEVER
        }
        whos.push({ kind: kind as ParticipantRef['kind'], id })
      }
      return whos
    }),
  scope: z.literal('home', { error: 'scope is "home", which reads each agent asked about in its home project; left out, they are read in this project.' }).optional(),
})

const ONE_PRESENCE_NOTE =
  'THE SAME READING FOR ONE PERSON OR ONE AGENT, by kind and id. A kind and id nothing answers to is not a 404 ' +
  'here: it is the red answer, because "there is nobody by that name" is exactly what red means.'

const BETWEEN_AGENTS_NOTE =
  'EVERY CONVERSATION BETWEEN TWO AGENTS in this project, newest first, with the last thing said in each. Only a ' +
  'person may read one: an agent reads what was said to it and what it said, and nothing else. The reply says ' +
  'whether the caller may, and why, rather than answering with an empty list to somebody who is not allowed to ' +
  'look — an empty list would say there are none. ?shape=page answers the same conversations with only what the ' +
  'chat draws of each: the two agents, the two counts of what is new, and the last message\'s id and its first ' +
  '600 characters, with "…" where the body was cut. Left out, every row is whole.'

/** How much of each row a list answers. See src/shared/short-lists.ts. */
const listShape = z.object({ shape: z.literal(PAGE_SHAPE, { error: PAGE_SHAPE_REFUSAL }).optional() })

const aPageOfAgentConversationList = listShape.extend({
  limit: z.coerce.number().int().min(AGENT_CONVERSATIONS_PAGE_SIZE).max(AGENT_CONVERSATIONS_PAGE_SIZE),
  cursor: z.string().max(2048).optional(),
  project: z.string().min(1).max(200).optional(),
})

/** One page of the chat's contact list, and what narrows it. */
const aPageOfTheContactList = z
  .object({
    limit: z.coerce
      .number({ error: 'limit must be a whole number of rows' })
      .int({ error: 'limit must be a whole number of rows' })
      .min(1, { error: 'limit must be 1 or more' })
      .max(CONTACT_LIST_MOST, { error: `limit must be ${String(CONTACT_LIST_MOST)} or less — that is the most this route answers in one page` })
      .optional(),
    offset: z.coerce
      .number({ error: 'offset must be a whole number of rows to skip' })
      .int({ error: 'offset must be a whole number of rows to skip' })
      .min(0, { error: 'offset must be 0 or more' })
      .optional(),
    name: z.string().max(200, { error: 'name must be 200 characters or fewer: it is the words typed in the filter box' }).optional(),
    project: z.string().min(1, { error: 'project must name a project, or be left out for every project' }).optional(),
  })
  .strict()

const CONTACT_LIST_NOTE =
  'THE CHAT\'S CONTACT LIST, ONE PAGE AT A TIME, in the order the list draws it. The chat ' +
  'reads the first screen of contacts and more as the person scrolls, instead of the whole list. The rows are ' +
  'the rows of GET /api/messages/contacts?shape=page, placed the same way. THE ORDER is the sides in `contactSides`, ' +
  'each side\'s groups in `contactGroups`, and each group\'s rows by `at`; a folded side or group has no rows in it. ' +
  'Inside a group, the rows the person placed by hand come first. Then come the rows whose `online` is true, and ' +
  'then the rest, each part newest message first. So a row that is offline is ordered by its newest message, not ' +
  'by when it was last online. ' +
  '`contacts` is the rows drawn on top, at most `limit` of them (' + String(CONTACT_LIST_PAGE) + ' when it is left ' +
  'out, ' + String(CONTACT_LIST_MOST) + ' at most); `folded` is every row folded under a starter on this page ' +
  'that its fold draws. `left` is how many rows on top come after this page, and `next` is the ' +
  'request for the next page, or null. ?name= keeps the rows whose name, or an agent\'s handle, holds the words ' +
  'typed, case folded, and ' +
  '?project= the rows with a message written in or about that project; both are worked out before the page is cut, ' +
  'so they find a row on any page. `rowsIn` is how many rows each group holds under them, folded rows included. ' +
  '`total` is every row with no narrowing, `inTheProject` how many ?project= keeps (null when it was not asked), ' +
  'and `matched` how many both keep. `unread` is the number on the circle over every row, as GET ' +
  '/api/messages/contacts answers it. A writer nobody registered is found by the name it is drawn under; a ' +
  'registered row whose registry row is gone has no name, and no words typed find it.'

const AS_A_SIDE_NOTE =
  'ONE CONVERSATION BETWEEN TWO AGENTS. The pair is the two agent ids joined by a ' +
  'tilde, which is not a character a handle may hold. ?as= names which of the two you are reading it as; LEAVE IT ' +
  'OUT to read the conversation as neither of them, both sides in one view, which is what a third party wants. ' +
  'READING WRITES NOTHING ON ANY MESSAGE: no mark moves and neither agent is told, because you are reading this ' +
  'and not taking part in it. THE READ ITSELF IS WRITTEN DOWN AND KEPT: one row saying who read it, which pair, ' +
  'which side and when. The reply also says when you last read this same conversation before now, or that you ' +
  'never have.'

const COMMENTS_NOTE =
  'EVERY COMMENT IN THIS PROJECT, newest first by when each was last changed. A comment is something said about a particular place: a passage of ' +
  'a report, a cell of a table, a whole page. Two kinds of row are in here and each says which it is. `annotation` ' +
  'is every comment written before messages and comments became one thing, kept exactly as it was written. ' +
  '`message` is every comment written since, which is a message that also says what on a page it is about. Ask ' +
  'this rather than GET /api/records?kind=annotation, which from this build on is half of them. Each comment comes ' +
  'back as the whole record it is, so a reader gets the words, what it points at and who it seemed to be for. ' +
  'Each also carries writtenOrder, its place in the order these comments were written, 1 for the first: by when ' +
  'it was written, then by the order it was stored in, so two written in the same second are told apart. ' +
  '?shape=page answers the same comments in the same order with only the fields the pages read: id, kind and ' +
  'writtenOrder, and of data only body, target, context and sentBy. recipientNames is the same either way. Left ' +
  'out, every row is whole.'

const GROUPS_NEW_NOTE =
  'WHAT THE GROUPS YOU BELONG TO HAVE GAINED SINCE YOU LAST LOOKED. A message that @s members ' +
  'reaches only them, so every other member reads what it missed here rather than being told. The answer is, for ' +
  'each group you are in, the messages written after your own read point in it, oldest first, with the point you ' +
  'held as `since` — null because you have never looked, when everything is new. Each message carries `whoSentIt`, ' +
  'the sender in the words every hand-over prints. `summary` is the summary GET /api/brief carries as ' +
  '`newInYourGroups`: at most 5 groups and the 3 newest messages of each, cut at 300 characters, without the lines ' +
  'Mole Office wrote. `text` is that summary printed, in the words the brief prints. `?move=1` moves the point to ' +
  'now in each group that had something new or had no point, after the answer is worked out, so the next read ' +
  'starts from this one; a group with nothing new keeps its point. Without it the read writes nothing and the ' +
  'same messages come back. The read point is the one already kept on the table a group read is recorded on. ' +
  '`?undelivered=1` leaves out of `summary` and `text` every message you sent and every one with a delivery to you, ' +
  'so they carry only what did not reach you one by one; a waiter asks for it when it hands messages over, because ' +
  'it hands every delivery over whole. A hand-over, `?move=1&undelivered=1`, answers without `groups`, because its ' +
  'callers read only `summary` and `text`; add `&groups=1` to have `groups` as well. Every other read carries ' +
  '`groups`, and `groups` is the same with `?undelivered=1` or without it.'

const READ_NOTE =
  'ONE MESSAGE and how far it got with each recipient. It writes nothing. WHO MAY READ IT: ' +
  'the owner and the secretaries read any message; an agent reads a message it sent, one ' +
  'addressed to it, or one sent to a group it was in when it was sent. Anybody else is refused with a 404 whose ' +
  'words are the same as for an id that names no message.'

const MARK_NOTE =
  'SAY HOW FAR A MESSAGE GOT WITH YOU. Body {"mark": "delivered"} or {"mark": "seen"}. You may only mark your own ' +
  'delivery, and a mark never moves backwards: a message already read does not become unread because a page ' +
  'loaded again. Marking one it is already at writes nothing and says so. "archived" is refused to every caller: ' +
  'it is Mole Office\'s own mark, set by the dead-letter sweep.'

const MARK_SEEN_NOTE =
  'SAY YOU HAVE SEEN SEVERAL MESSAGES AT ONCE: the marks for what is on a screen. Body {"messages": [ids]}, from 1 ' +
  `to ${String(SEEN_MARKS_IN_ONE_REQUEST_AT_MOST)} ids. Each is marked seen as POST /api/messages/:id/mark ` +
  '{"mark": "seen"} marks it, in the order given and in one transaction, and each mark that moved is announced on ' +
  'its own. The reply lists each mark. When one message cannot be marked, the request is refused with that ' +
  'message\'s refusal, and none of the list is marked.'

const NOT_NOW_NOTE =
  'PUT OFF THE OFFER A MESSAGE CARRIES TO TAKE YOU TO A PAGE: the Not now press. No body. The message stays ' +
  'unread: its delivery mark does not move, so it still counts as unread in the chat and on the Messages page. ' +
  `GET /api/messages?only=waiting-for-me&leads=1, the offers read, leaves it out for ${String(A_PUT_OFF_OFFER_COMES_BACK_AFTER_MINUTES)} ` +
  'minutes from the press, and then offers it again while it is still unread. Each press starts the wait again. ' +
  'Reading the message, or taking the offer, ends it. A secretary holding the person\u2019s grant may press it where ' +
  'this office\u2019s list of what the grant carries says so, the secretary card keeps it for the person by default, ' +
  'and any other agent is refused; it is pressed only on a message addressed to them that carries a lead. The ' +
  'reply says when it was put off and in how many seconds it comes back.'

// The note below follows a decision. The id stays in this comment: the note itself is shipped text.
const REMIND_ME_LATER_NOTE =
  'BRING A MESSAGE BACK ONCE, LATER: the Remind me later press beside Take me there. ' +
  `Body {choice}, one of ${REMIND_ME_LATER_CHOICES.join(', ')}. The office keeps the time, not the page: at that time ` +
  'Mole Office writes one line to you about the message, carrying the same offer, so it waits on you again in the ' +
  'chat, in Needs you and as an offer card, with no page open and after a restart. Until then the offer is put off. ' +
  'A new press replaces the time. The person presses it, proved as the person. A secretary holding the person’s ' +
  'grant may press it where this office’s list of what the grant carries says so, the secretary card keeps it for ' +
  'the person by default, and then the line written later says the secretary set the time. Any other agent, a raise ' +
  'that list does not carry and a test world’s stand-in are refused. The reply says the time it comes back as ' +
  'remindAt.'

const MARK_BROKEN_NOTE =
  'SAY AN AGENT\'S REPLY BROKE THE MARK ON YOUR MESSAGE: the "mark broken" press on the reply. The id is the ' +
  'agent\'s reply. Body {markedMessage}, the id of your message whose mark it broke: ' +
  'a message you wrote, marked "just-ask", "proposal-first", "align" or "give-options", and given to the agent that ' +
  'wrote the reply before it wrote it. It files one problem naming the message, the mark and the reply, and Mole Office tells the agent in a ' +
  'line to it alone, which its next hand-over carries. A second press on the same reply files nothing and answers ' +
  'with the first problem. Only the person may press it, proved as the person; the secretary card keeps it for them, ' +
  'so a raise carries it only where this office\'s list of what the grant carries says the grant presses it, and then ' +
  'the problem and the line to the agent say the secretary pressed it for the person. Any other agent is refused.'

/** The refusal for a caller asking for the office's own mark. Problem 0WUuvB0IhRfb. */
const ARCHIVED_IS_THE_OFFICES_MARK =
  'Archived is Mole Office\'s own mark. The dead-letter sweep sets it on a message nobody will read, and no caller ' +
  'may set it. Nothing was written.'

const START_AN_AGENT_NOTE =
  'START AN AGENT FOR A MESSAGE NOBODY IS ANSWERING. A message to an agent no session holds and no ' +
  'run is serving waits here instead of starting a fresh tool by itself, and the chat offers the person the press ' +
  'this route is behind. A secretary holding the person\u2019s grant may press it where this office\u2019s list of what ' +
  'the grant carries says so, the secretary card keeps it for the person by default, and any other agent is ' +
  'refused with a 403. IT ' +
  'STARTS NOTHING ITSELF \u2014 it writes down that a run may be started for this message, and the message worker ' +
  'starts it on its next pass, which keeps one path that starts a run. The reply says the moment and who pressed.'

const START_A_NEW_AGENT_NOTE =
  'START A NEW AGENT FOR ONE AGENT, wherever the person pressed it. The person\u2019s words of 7 September ' +
  '2026: \u542f\u52a8new agent\u9700\u8981\u5728\u804a\u5929\u6846\u3001contact\u3001\u53f3\u952e\u7b49\u591a\u4e2a\u4f4d\u7f6e\u751f\u6548 \u2014 the press works in the chat, on the ' +
  'contact row and in the right-click menu, and all three are this one act. It presses for every message to that ' +
  'agent that is being held for one, and answers with which. A secretary holding the person\u2019s grant may press it ' +
  'where this office\u2019s list of what the grant carries says so, the secretary card keeps it for the person by ' +
  'default, and any other agent is refused with a 403. IT STARTS ' +
  'NOTHING ITSELF: the message worker starts the run on its next pass. A press on an agent nothing is waiting for ' +
  'writes nothing and the reply says so rather than reporting a success about no message.'

const WOULD_THE_PRESS_CARRY_NOTE =
  'WHETHER THE PRESS TO START A NEW AGENT WOULD CARRY ANYTHING FOR THIS AGENT, read and not written. ' +
  '{"wouldCarry": true} when a message to it is waiting for the press, or comments are held for it while it is ' +
  'retired; false when the press would make nothing. It is the same reading the press makes, so the chat offers ' +
  'the press only where it would carry something.'

const PICTURE_LIMITS_NOTE =
  'WHAT MAY BE SENT AS A PICTURE IN A MESSAGE: the largest size in bytes, and the three types. Read it before you ' +
  'send one, so a person choosing a file is told the limit rather than refused after choosing. The numbers come ' +
  'from the same declarations the refusals use.'

const PICTURE_NOTE =
  'PUT A PICTURE WHERE A MESSAGE CAN POINT AT IT. Body {"bytes": "<the file, base64>"}. It writes NO record: it ' +
  'writes the file and hands back the path, and you then send an ordinary message through POST /api/records ' +
  'carrying {"pictures": [{"id": "p-1", "type": "image", "path": "<that path>", "alt": "<what it shows>"}]}. The ' +
  'two are separate acts so that a picture too big, or one that is not a picture at all, is refused before ' +
  'anything about a message is decided. A png, a jpeg or a webp, read from the bytes rather than from what you ' +
  'call them; an SVG is refused, because it is a document a browser runs. The size limit is ' +
  'MOLE_OFFICE_MESSAGE_PICTURE_MAX_BYTES and every refusal names both numbers.'

const FILE_NOTE =
  'PUT A FILE THAT IS NOT A PICTURE WHERE A MESSAGE CAN POINT AT IT. Body {"bytes": "<the file, base64>", ' +
  '"name": "<the name it was sent under>"}. Like the picture door it writes NO record: it writes the file and ' +
  'hands back the path, and the message then carries it in "pictures" as an image block whose alt is the name. ' +
  'Any bytes are taken. The stored name is a fresh one with the sent name\'s extension, which is what the reading ' +
  'door describes the file by. The size limit is the picture\'s, MOLE_OFFICE_MESSAGE_PICTURE_MAX_BYTES, and every ' +
  'refusal names both numbers.'

// ============================================================================ what a caller sends

const aPictureSent = z.object({ bytes: z.string().min(1) }).strict()
// THE BYTES MAY BE EMPTY HERE so that the decode, below, is what refuses an empty file, in its own words.
const aFileSent = z.object({ bytes: z.string(), name: z.string().min(1).max(MAX_REPORT_FILE_NAME) }).strict()

/**
 * The largest JSON body the picture route reads, from the same number the size check reads.
 *
 * Base64 is four bytes on the wire for every three of picture, and the JSON around it a little more
 * again — so the room here is four times the setting, plus a third, plus an allowance for the rest
 * of the body. A picture up to four times the limit therefore reaches `storeAMessagePicture`, which
 * refuses it naming both numbers, instead of meeting Fastify's own wordless refusal. The same
 * arithmetic and the same reason as `bodyLimitForAPicture` in api/participants.ts.
 */
const BODIES_THIS_ROUTE_WILL_READ = 4
const JSON_AROUND_A_PICTURE = 4096
function bodyLimitForAPicture(limit: number): number {
  return Math.ceil((limit * BODIES_THIS_ROUTE_WILL_READ * 4) / 3) + JSON_AROUND_A_PICTURE
}

/** What a caller reads when the body is past even that, in place of *Request body is too large*. */
function pastEvenTheBodyLimit(limit: number, bodyLimit: number, what: 'picture' | 'file'): string {
  return (
    `Nothing was read, because that request is bigger than this route reads at all. A ${what} in a message is at ` +
    `most ${String(limit)} bytes. This route stops reading at ${String(bodyLimit)} bytes of request, which is ` +
    `about ${String(limit * BODIES_THIS_ROUTE_WILL_READ)} bytes of ${what}. How big this one is was never ` +
    'measured, so nothing here says. Nothing was written. The limit is MOLE_OFFICE_MESSAGE_PICTURE_MAX_BYTES.'
  )
}

/** Fastify's own code for a body past the route's limit, which is the one refusal this route rewrites. */
const BODY_TOO_LARGE = 'FST_ERR_CTP_BODY_TOO_LARGE'

const whichParticipant = z.object({
  kind: z.enum(PARTICIPANT_KINDS),
  id: z.string().min(1),
})

/**
 * ONE PAGE OF A CONVERSATION: how many, and from where. `limit` alone is the newest page; `before` is
 * the page just older than a message; `after` is what came after a message, with `since` asking what
 * changed among the messages the page already holds, and `from` keeping only those from the oldest it holds on.
 */
const aPageOfAConversation = z.object({
  limit: z.coerce.number().int().min(1).max(A_CONVERSATION_PAGE_HOLDS_AT_MOST).optional(),
  before: z.string().min(1).optional(),
  after: z.string().min(1).optional(),
  since: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, { error: 'must be a local time written 2026-10-03 12:30:00, as `page.readAt` gives it' })
    .optional(),
  from: z.string().min(1).optional(),
})

/** A NARROWING OF A CONVERSATION: `my-unsent` answers only the reader's own comments in it that nobody has sent yet. */
const aNarrowingOfAConversation = z.object({ only: z.enum(['my-unsent']).optional() })

const whichWriter = z.object({
  writer: z.string().min(1),
})

const markBody = z.object({
  mark: z.enum(DELIVERY_MARKS),
})

const seenMarksBody = z
  .object({ messages: z.array(z.string().min(1)).min(1).max(SEEN_MARKS_IN_ONE_REQUEST_AT_MOST) })
  .strict()

const whichMessage = z.object({ id: z.string().min(1) })
const remindMeLaterBody = z.object({ choice: z.enum(REMIND_ME_LATER_CHOICES) }).strict()
const markBrokenBody = z.object({ markedMessage: z.string().min(1), part: z.number().int().min(0).optional() }).strict()

const whichPair = z.object({ pair: z.string().min(3) })

/** Whether the group read moves the reader's own read point. Criterion GM4. */
const whichGroupsRead = z.object({ move: z.literal('1').optional(), undelivered: z.literal('1').optional(), groups: z.literal('1').optional() }).strict()

const whichSide = z.object({ as: z.string().min(1).optional() })

/**
 * WHO IS ASKING, as a participant, or a refusal saying how to become one.
 *
 * Criterion M14: a message from an unknown participant is refused with the sentence saying how to
 * register. The same holds for reading a conversation: there is no conversation to read for somebody
 * neither registry holds, and answering with an empty one would say there was nothing said rather
 * than that nobody was asked about.
 */
function whoIsAsking(req: Parameters<typeof actorFrom>[0]): ParticipantRef {
  const actor = actorFrom(req)
  const me = participantForActor(actor)
  if (me === null) {
    throw new PanelError(
      `Nothing in either registry answers to the ${actor.type} "${actor.id}", so there is no pool of messages ` +
        'that belongs to you. GET /api/participants lists every person and every agent that keeps a standing ' +
        'inbox. An agent is registered by filing a record of kind "agent" with the handle you write under.',
      403,
    )
  }
  return me
}

/**
 * ONE AGENT'S STATUS AT HOME, as the status view answers it with scope=home. A read that throws, or that does not find
 * the agent, says it could not be read, as the status view's own failed readings do, and the conversation is still
 * answered: the heading then says "Could not be read" and draws no colour.
 */
function theStatusAtHome(id: string, workspaceId: string, actor: Actor, aliases: TheFiledAliases): PluginStatusReading<PluginAgentStatus> {
  try {
    const [agent] = readAgentStatus(workspaceId, actor, [id], 'home', aliases).agents
    return agent === undefined ? { available: false } : { available: true, value: agent }
  } catch {
    return { available: false }
  }
}

const aNewGroup = z.object({ name: z.string().min(1), side: z.enum(['human', 'agent']) }).strict()

/** -1 is up and 1 is down. One place at a time, because that is what the two presses are. */
const aStep = z.union([z.literal(-1), z.literal(1)])

const aChangedGroup = z
  .object({
    name: z.string().min(1).optional(),
    moveBy: aStep.optional(),
    /** The person's fold state. Criterion M121. */
    collapsed: z.boolean().optional(),
  })
  .strict()
  .refine((body) => body.name !== undefined || body.moveBy !== undefined || body.collapsed !== undefined, {
    message: 'needs a name, a move or a fold; it was sent none, so nothing would have happened',
  })

const aPlacement = z
  .object({ contact: z.string().min(1), group: z.string().min(1).optional(), moveBy: aStep.optional() })
  .strict()
  .refine((body) => body.group !== undefined || body.moveBy !== undefined, {
    message: 'needs a group to move it to or a move by one place; it was sent neither, so nothing would have happened',
  })

/**
 * The request that carries the next page of one query to a paged door (`GET /api/messages` or the chat's contact
 * list): the same query with the offset moved on. Built from what was asked rather than described in words, so a
 * caller can follow it.
 */
function theNextPage(door: string, query: unknown, nextOffset: number): string {
  const params = new URLSearchParams()
  if (typeof query === 'object' && query !== null) {
    for (const [name, value] of Object.entries(query as Record<string, unknown>)) {
      if (name !== 'offset' && typeof value === 'string') params.set(name, value)
    }
  }
  params.set('offset', String(nextOffset))
  return `GET ${door}?${params.toString()}`
}

// ============================================================================ the routes

export async function messageRoutes(app: FastifyInstance): Promise<void> {
  // READ ONCE, HERE, AND USED FOR BOTH THE LIMIT AND THE SENTENCE, for the reason api/participants.ts
  // reads its own once: two calls would be the same fact worked out twice, and a setting that
  // changed between them would put a number in the refusal that is not the number being enforced.
  const pictureLimit = maxMessagePictureBytes()
  const pictureBodyLimit = bodyLimitForAPicture(pictureLimit)

  /**
   * What the pool carries about each message's sender, from `theSendersReadOncePerAnswer`, and the group
   * it was sent to, from `theGroupForAHandOver`.
   */
  type SenderWords = TheSenderOfAHandOver & { fromGroup: ReturnType<typeof theGroupForAHandOver> }

  const queuedAgentIds = (reader: ReturnType<typeof theMessageReader>): string[] => {
    // The pool reads unknown stored marks as queued and unknown recipient kinds as agents.
    const otherMarks = DELIVERY_MARKS.filter((mark) => mark !== 'queued')
    const marks = otherMarks.map(() => '?').join(', ')
    const candidates = `FROM message_delivery d
      JOIN records r ON r.id = d.message_id
      JOIN agents a ON a.id = d.recipient_id
      WHERE r.workspace_id = ? AND r.kind = 'message' AND r.deleted_at IS NULL
        AND d.recipient_kind <> 'person' AND d.mark NOT IN (${marks})`
    if (reader.readsEveryMessage) {
      const rows = sqlite.prepare(`SELECT DISTINCT a.id AS id ${candidates}`).all(MESSAGE_CENTRE, ...otherMarks) as { id: string }[]
      return rows.map((row) => row.id)
    }
    const rows = sqlite.prepare(`SELECT DISTINCT d.message_id AS messageId, a.id AS id ${candidates}`).all(MESSAGE_CENTRE, ...otherMarks) as { messageId: string; id: string }[]
    const readable = theMessagesThisReaderMayRead(reader, [...new Set(rows.map((row) => row.messageId))])
    return [...new Set(rows.filter((row) => readable.has(row.messageId)).map((row) => row.id))]
  }

  app.get('/messages/queued-agent-ids', route('message.pool', 'remote', POOL_NOTE), async (req) => {
    workspaceOf(req)
    whoIsAsking(req)
    return { agentIds: queuedAgentIds(theMessageReader(actorFrom(req))) }
  })

  app.get('/messages/carryable-agent-ids', route('message.carryable-agent-ids', 'remote', enWave13y['server.carryableAgentIds']), async (req) => {
    const workspace = workspaceOf(req)
    whoIsAsking(req)
    return { agentIds: agentsThePressWouldCarryFor(queuedAgentIds(theMessageReader(actorFrom(req))), workspace) }
  })

  app.get('/messages', itChangesSomething(route('message.pool', 'remote', POOL_NOTE), (query) => query.markDelivered === '1'), async (req) => {
    const asked = parse(whichPool, req.query ?? {}, 'The narrowing asked for')
    // THE MOMENT a since read names, in the office's stored form. The schema has already refused one that names no
    // moment (`SINCE_REFUSAL`), so this is the moment the reply says it read.
    const sinceOffice = asked.since === undefined ? null : theMomentASinceNames(asked.since)
    const sinceSaid = sinceOffice === null ? {} : { since: sinceOffice }
    // A RUN READING ITS INBOX SENDS WHAT IT HOLDS FIRST, so it never reads an answer to words it has not sent
    // (lib/turn-drafts.ts). A hook's read after each step leaves them held, or nothing would wait for the turn's end.
    if (asked.only === 'waiting-for-me' && asked.leaveHeld === undefined) sendTheHeldDraftsOfThisRequestsRun(req)
    // EVERY MESSAGE LIVES IN THE MESSAGE CENTRE AND BELONGS TO NO PROJECT, so the project a request
    // names no longer narrows this door. `?projects=<id>` asks for one project's view, and `?projects=all` is every project.
    // Which projects a value names is `theProjectsAsked`'s answer, the one every `?projects=` door asks: an id that names
    // no project is refused there with a sentence, and so is the message centre, which is no project.
    // A PROJECT HEADER NAMING NO PROJECT IS STILL REFUSED, as at every door: it is a mistake in the request, and a caller
    // is told so rather than answered as if it had named nothing (problem Z1UaYRGkHBxa).
    // The narrowings by sender and by contact read the agents' own records in it (wave 13y round 91, gap 6).
    const thePagesProject = workspaceOf(req)
    const projectsAsked = asked[PROJECTS_QUERY]
    const across = projectsAsked === undefined ? null : theProjectsAsked(projectsAsked, theMessageReader(actorFrom(req)))
    const workspaceId =
      projectsAsked === undefined || across === null || asksForEveryProject(projectsAsked) ? MESSAGE_CENTRE : across[0]!.id
    const me = whoIsAsking(req)
    const reader = theMessageReader(actorFrom(req))
    // WHO SENT EACH ONE, in the words every hand-over prints (problem ynGL0myEnAbi), AND HOW THAT
    // SENDER ASKS TO BE ADDRESSED. The dsh hook passes both to the envelope
    // unchanged. One sender is read once per answer, however many messages it wrote, by the reader the
    // queue's door uses too (wave 13y round 49). The door kept a map of its own, a second copy of that rule.
    const senderWords = theSendersReadOncePerAnswer()
    // AND THE GROUP EACH ONE WAS SENT TO, or null for a direct message, as item 5 of
    // a decision says.
    // The dsh hook passes it to the envelope, whose first line names the group. One group is read once
    // per answer.
    const groupsRead = new Map<string, ReturnType<typeof theGroupForAHandOver>>()
    const withTheirSenders = (entries: readonly PoolEntry[]): (PoolEntry & SenderWords)[] =>
      entries.map((one) => {
        const words = senderWords(one.sentBy)
        const groupKey = one.toGroup ?? ''
        let fromGroup = groupsRead.get(groupKey)
        if (fromGroup === undefined) {
          fromGroup = theGroupForAHandOver(one.toGroup)
          groupsRead.set(groupKey, fromGroup)
        }
        return { ...one, ...words, fromGroup }
      })
    if (asked.checkpoint === '1') {
      if (asked.only !== 'waiting-for-me' || Object.keys(asked).some(key => !['only', 'checkpoint', 'limit'].includes(key))) {
        return { messages: [], workspaceId, checkpoint: { supported: false, because: 'A checkpoint reads full queued letters for its own run and marks nothing.' } }
      }
      const { ids, ...page } = checkpointPage(actorFrom(req).sessionId, me, thePagesProject, asked.limit)
      return { messages: withTheirSenders(onlyTheMessagesThisReaderMayRead(reader, theseMessagesOfThePool(ids))), ...page, workspaceId }
    }
    // IDS, TITLES AND WHEN WORDS MAY STILL CHANGE UNLESS THE WHOLE ENTRY WAS ASKED FOR. A plain call answers the
    // narrow entry, exactly as `narrow=1` does; `full=1` and `markDelivered=1` ask for the whole
    // entry. The selection and `only` are the same either way.
    type NarrowPoolEntry = Pick<PoolEntry, 'id' | 'title' | 'wordsMayChangeUntil'>
    const withoutTheWords = (entries: (PoolEntry & SenderWords)[]): (NarrowPoolEntry | (PoolEntry & SenderWords))[] =>
      asked.full === '1' || asked.markDelivered === '1'
        ? entries
        : entries.map((one) => ({ id: one.id, title: one.title, wordsMayChangeUntil: one.wordsMayChangeUntil }))
    // THE MESSAGES PAGE'S NARROWINGS AND ITS PAGE, worked out over every message the rest of this
    // door keeps and before the page is cut, so a search finds a message
    // wherever it is in the pool. They run before the words are taken off, because `words` reads
    // them. A call that asks for none of them is answered exactly as before.
    const narrowed =
      asked.sender !== undefined ||
      asked.contact !== undefined ||
      asked.group !== undefined ||
      asked.since !== undefined ||
      asked.state !== undefined ||
      asked.words !== undefined
    // A CALL THAT NAMES NO limit IS ANSWERED ONE PAGE (package SR, round 2 of line 14c). The route used to build every
    // message of the office for a call with no page and answer them all: GET /api/messages was 11.2 MB on the made-up
    // office and held a PATCH behind it for 2.1 to 2.3 s, and ?full=1 was 280.3 MB and held it for 4.1 to 4.3 s. The
    // page is the largest one a caller may ask for, so a caller that already built for a page sees no change, and the
    // reply's `left` and `next` say how to read the rest. A caller that needs every message follows `next`.
    const pageLimit = asked.limit ?? POOL_PAGE_DEFAULT
    // A CALL THAT NAMED NO limit GETS A next THAT NAMES THE PAGE IT KEPT, so following it keeps the same page size and the
    // no-page answer's next is the page a caller that asked for that limit gets. The other fields are carried as asked.
    const theQueryForAPage = asked.limit === undefined
      ? { ...(req.query as Record<string, unknown>), limit: String(pageLimit) }
      : req.query
    /** One page of the messages kept, and the numbers every page carries. `total` is how many there were before the narrowings. */
    const aPageOf = <T extends { deliveries: readonly DeliveryOnTheWire[] }>(total: number, kept: readonly T[]): { page: T[] } & PoolPage => {
      const offset = asked.offset ?? 0
      const page = kept.slice(offset, offset + pageLimit)
      const left = Math.max(0, kept.length - offset - page.length)
      return {
        page,
        total,
        matched: kept.length,
        returned: page.length,
        left,
        truncated: left > 0,
        next: left > 0 ? theNextPage('/api/messages', theQueryForAPage, offset + page.length) : null,
        unreadForYou: kept.filter((one) => one.deliveries.some((d) => sameParticipant(d.to, me) && d.mark !== 'seen'))
          .length,
      }
    }
    // A PERSON'S PAGE OF OFFERS BUILDS ONLY ITS OWN MESSAGES. An agent's read and a read with other narrowings
    // continue through the same rules as before.
    if (!narrowed && asked.only === 'waiting-for-me' && asked.leads === '1' &&
        asked.markDelivered === undefined && asked.leaveHeld === undefined && workspaceId === MESSAGE_CENTRE &&
        me.kind === 'person' && reader.readsEveryMessage) {
      const nowMs = Date.now()
      const putOff = theOffersPutOffFor(me, nowMs)
      const offset = asked.offset ?? 0
      const maker = asked.offerFrom === undefined ? undefined : participantFromKey(asked.offerFrom)
      const { ids, total } = aPageOfWaitingLeads(me, workspaceId, pageLimit, offset, [...putOff.keys()], maker)
      const messages = withoutTheWords(withTheirSenders(theseMessagesOfThePool(ids)))
      const left = Math.max(0, total - offset - messages.length)
      const first = putOff.size === 0 ? null : Math.min(...putOff.values())
      return {
        messages, total, matched: total, returned: messages.length, left, truncated: left > 0,
        next: left > 0 ? theNextPage('/api/messages', theQueryForAPage, offset + messages.length) : null,
        unreadForYou: total, workspaceId, only: asked.only,
        offersComeBackInSeconds: first === null ? null : Math.ceil((first - nowMs) / 1000),
        keptBackByAReview: null,
      }
    }
    // A GROUP READ FROM A MOMENT ON IS NARROWED IN THE DATABASE, so the whole pool is counted but no message the moment
    // leaves out is built (GS-1). `total` is the number the same read without `since` gives, because it is the same
    // reader rule (`onlyTheMessagesThisReaderMayRead`) over the same pool (`thePoolCountedFor`) that the whole-pool read
    // applies; the kept messages are that rule over `messagesInAGroupAfter`, which asks the group's index and the moment
    // in one statement. A project's view, `only` and `leads` still read the whole pool, where the same `since` test runs
    // in `passesThePageNarrowings`.
    if (
      asked.group !== undefined &&
      sinceOffice !== null &&
      asked.sender === undefined &&
      asked.contact === undefined &&
      asked.state === undefined &&
      asked.words === undefined &&
      asked.only === undefined &&
      asked.leads === undefined &&
      asked.offerFrom === undefined &&
      workspaceId === MESSAGE_CENTRE
    ) {
      const counted = onlyTheMessagesThisReaderMayRead(reader, thePoolCountedFor(me))
      const kept = onlyTheMessagesThisReaderMayRead(reader, messagesInAGroupAfter(asked.group, sinceOffice))
      const { page, ...numbers } = aPageOf(counted.length, kept)
      return { messages: withoutTheWords(withTheirSenders(page)), ...numbers, ...sinceSaid, workspaceId }
    }
    // A PAGE OF EVERY MESSAGE, WITH NO NARROWING, IS COUNTED FROM THE IDS AND ONLY ITS OWN MESSAGES ARE BUILT (round 89 of
    // wave 13y). It is what the Messages page asks first. The door built every message of the office whole for it, with
    // its words and its delivery rows, and kept fifty: a median of 808.7 ms on a made-up office of the live size. The count
    // needs each message's id and the reader's own delivery rows (`thePoolCountedFor`), and the same `aPageOf` cuts the
    // page, so the answer is the one the whole pool gives. A project's view, `only` and `leads` still read the whole pool.
    if (!narrowed && asked.only === undefined && asked.leads === undefined && asked.offerFrom === undefined && workspaceId === MESSAGE_CENTRE) {
      const counted = onlyTheMessagesThisReaderMayRead(reader, thePoolCountedFor(me))
      const { page, ...numbers } = aPageOf(counted.length, counted)
      return { messages: withoutTheWords(withTheirSenders(theseMessagesOfThePool(page.map((one) => one.id)))), ...numbers, workspaceId }
    }
    // THE READER'S OWN UNSEEN MESSAGES ARE ASKED FOR BY NAME (acceptance finding 26). Every other
    // narrowing still reads the pool: they are questions about the whole project. The filter below
    // is unchanged and still decides what is kept, so the answer is the same either way.
    // ONLY THE MESSAGES THIS READER MAY READ, before anything is counted (decided on 28 September 2026, wave 13j): an
    // agent reads the ones it is a party to, and the owner and the secretaries read every one. So
    // `total`, `matched` and every other number below counts only what this reader may see.
    // AND NOT A COMMENT A REVIEW KEEPS BACK FROM AN AGENT: one a review not yet sent holds, the
    // way the worker holds it, and one a sent review's message carries, so the words are handed over once. The hook
    // reads this list, so it leaves them out too. `keptBackByAReview` says how many of each, and why.
    // AN AGENT'S READ OF THE WHOLE POOL BUILDS ONLY THE MESSAGES IT MAY READ (`thePoolThisReaderMayRead`, round 143 of wave
    // 13y): it built every message of the office to keep the few it is a party to.
    const waitingForMe = asked.only === 'waiting-for-me' ? messagesWaitingFor(workspaceId, me) : null
    const keptBack = waitingForMe === null ? null : whatAReviewKeepsFromTheWaitingList(me, waitingForMe)
    const mayRead =
      waitingForMe === null || keptBack === null
        ? thePoolThisReaderMayRead(reader, workspaceId)
        : onlyTheMessagesThisReaderMayRead(
            reader,
            waitingForMe.filter((one) => !keptBack.held.has(one.id) && !keptBack.carried.has(one.id)),
          )
    const keptBackByAReview = keptBack === null ? null : whatAReviewKeptBack(keptBack.held.size, keptBack.carried.size)
    const sayWhatAReviewKeptBack = keptBackByAReview === null ? {} : { keptBackByAReview }
    // `?leads=1` KEEPS ONLY THE ENTRIES THAT CARRY A LEAD on every path below, so they are kept here, before each sender's
    // words are read. It read the words of 106 senders for an answer that kept none of their messages (wave 13x round
    // 13). The filters below still apply the same rule and keep the same entries in the same order.
    const maker = asked.offerFrom === undefined ? undefined : participantFromKey(asked.offerFrom)
    const byMaker = maker === undefined ? mayRead : maker === null ? [] : mayRead.filter((one) => {
      const from = one.offerMadeBy === undefined ? one.sentBy : one.offerMadeBy
      return from !== null && sameParticipant(from, maker)
    })
    const found = asked.leads === '1' ? byMaker.filter(carriesALead) : byMaker
    const pool = withTheirSenders(found)
    const thePage = (entries: (PoolEntry & SenderWords)[]): { messages: (NarrowPoolEntry | (PoolEntry & SenderWords))[] } & Partial<PoolPage> => {
      const byWho = {
        ...(asked.sender === undefined ? {} : { sender: asked.sender }),
        ...(asked.contact === undefined ? {} : { contact: asked.contact }),
      }
      // BY THE AGENTS' OWN RECORDS IN THE PAGE'S PROJECT, as the contacts door names them (wave 13y round 91, gap 6).
      // `workspaceId` here is the message centre unless `?projects=` names one, and that is no project.
      const who = theNarrowingsByWho(thePagesProject, byWho)
      const kept = entries.filter((one) =>
        passesThePageNarrowings(
          one,
          {
            ...byWho,
            ...(asked.group === undefined ? {} : { group: asked.group }),
            ...(asked.since === undefined || sinceOffice === null ? {} : { since: sinceOffice }),
            ...(asked.state === undefined ? {} : { state: asked.state }),
            ...(asked.words === undefined ? {} : { words: asked.words }),
          },
          who,
        ),
      )
      const { page, ...numbers } = aPageOf(entries.length, kept)
      return { messages: withoutTheWords(page), ...numbers }
    }
    /**
     * THE WORDS THIS READ HANDS OVER, MARKED DELIVERED WHEN THE READER SAYS SO (?markDelivered=1, wave 13u round 24).
     *
     * A reader that read its messages here and never marked them left every delivery `queued`, and the dead-letter
     * sweep counted those messages as never delivered. A plain read still marks nothing: the hook after a Claude Code
     * step reads this door for a count alone, and the person's offers panel reads it too, and neither hands a run the
     * words. An agent's read that marked everything it listed once left 54 messages that the waiter, which looks only
     * for `queued`, never handed over (criterion M127). So the mark is the reader's own say, in the same call that
     * hands it the words: only the page returned, only the reader's own rows, and only `delivered`. `seen` stays the
     * recipient's mark, one message at a time at POST /api/messages/:id/mark.
     */
    const handedOver = (page: { messages: (NarrowPoolEntry | (PoolEntry & SenderWords))[] } & Partial<PoolPage>) => {
      if (asked.markDelivered !== '1') return page
      // THE SAME HOOK CAN RUN INSIDE AN OFFICE-STARTED RUN. Its session record, rather than its
      // agent's handle, tells those deliveries apart from the live-session deliveries we remind.
      const run = me.kind === 'agent' ? theRunAWriteCameFrom(actorFrom(req).sessionId) : null
      const moved = markManyDelivered(
        page.messages.filter((one): one is PoolEntry & SenderWords => 'deliveries' in one && one.deliveries.some((d) => sameParticipant(d.to, me) && !aMarkSaysItWasRead(d.mark))).map((one) => one.id),
        me,
        undefined,
        me.kind === 'agent' ? { because: theMessageReadTookIt(), ...(run === null ? {} : { run: run.run }) } : undefined,
      )
      // THE ANSWER SHOWS THE MARKS AS THEY ARE NOW, so the reader is not handed the `queued` it has just moved.
      const now = new Map(theDeliveryRowsOf(moved, me).map((one) => [one.messageId, one.row]))
      const messages = page.messages.map((one) => {
        const row = now.get(one.id)
        return row === undefined || !('deliveries' in one) ? one : { ...one, deliveries: one.deliveries.map((d) => (sameParticipant(d.to, me) ? row : d)) }
      })
      return { ...page, messages, markedDelivered: moved }
    }
    const read = pool
    if (asked.only === undefined) return { ...thePage(asked.leads === '1' ? read.filter(carriesALead) : read), ...sinceSaid, workspaceId }
    // THE SAME ROWS, FEWER OF THEM. Nothing here is worked out that the whole pool does not carry:
    // a delivery to the reader not marked seen, a delivery to an agent still marked queued, or a
    // message addressed to the reader or to nobody in any read state.
    const kept =
      asked.only === 'waiting-for-me'
        ? read.filter((one) => one.deliveries.some((d) => sameParticipant(d.to, me) && d.mark !== 'seen'))
        : asked.only === 'queued-for-agents'
          ? read.filter((one) => one.deliveries.some((d) => d.to.kind === 'agent' && d.mark === 'queued'))
          : asked.only === 'waiting-for-my-answer'
          // WAITING FOR YOUR ANSWER, by the one rule in src/shared/messages.ts
          // (`theQuestionsWaitingForTheAnswerOf`), worked out over every project and kept here to this one. Each sender and
          // recipient is named by the agents' own records in the page's project, as the contacts door names them (wave 13y
          // round 91, gap 5). `workspaceId` here is the message centre unless `?projects=` names one, and that is no project.
          ? ((waiting) => read.filter((one) => waiting.has(one.id)))(theIdsWaitingForTheAnswerOf(me, workspaceOf(req)))
          // YOUR BOARD AND THE OPEN BOARD: a message with no delivery rows is a comment somebody
          // left on a page for nobody in particular, and it is yours to read. A message addressed
          // only to somebody else is not, and a narrowed call leaves it out rather than shipping
          // it for a page to throw away.
          : read.filter((one) => one.deliveries.length === 0 || one.deliveries.some((d) => sameParticipant(d.to, me)))
    // AND ONLY THE ENTRIES THAT CARRY A LEAD, when that is asked. The offers panel draws nothing else:
    // `offersWaitingFor` skips an entry without a lead before it looks at anything, by the same
    // `carriesALead` rule. The filter keeps the order, so the offers drawn are the same.
    if (asked.leads === '1' && asked.only === 'waiting-for-me') {
      // THE OFFERS READ. It also leaves out an offer this reader put off with Not now a short while ago
      // (`theOffersPutOffFor`; the wait is `A_PUT_OFF_OFFER_COMES_BACK_AFTER_MINUTES`), and says in how many seconds the first of those comes back,
      // so the page can read again then. Every other read, and every unread count, still holds the
      // message: Not now leaves it unread.
      const nowMs = Date.now()
      const putOff = theOffersPutOffFor(me, nowMs)
      const offers = kept.filter((one) => carriesALead(one) && !putOff.has(one.id))
      const first = putOff.size === 0 ? null : Math.min(...putOff.values())
      return {
        ...handedOver(thePage(offers)),
        ...sinceSaid,
        workspaceId,
        only: asked.only,
        offersComeBackInSeconds: first === null ? null : Math.ceil((first - nowMs) / 1000),
        ...sayWhatAReviewKeptBack,
      }
    }
    return { ...handedOver(thePage(asked.leads === '1' ? kept.filter(carriesALead) : kept)), ...sinceSaid, workspaceId, only: asked.only, ...sayWhatAReviewKeptBack }
  })

  /**
   * A PICTURE ON ITS WAY INTO A MESSAGE. Criterion M65.
   *
   * ---------------------------------------------------------------------------------------
   * WHY THIS IS A SECOND DOOR WHEN WRITING A MESSAGE HAS EXACTLY ONE
   * ---------------------------------------------------------------------------------------
   *
   * It is not a second door for a message. Nothing here writes a record: it writes a FILE and hands
   * back where it put it, and the message that points at that file goes through POST /api/records
   * like every other message, with the same rules about who may write to whom.
   *
   * They are two acts because the refusals belong to different things. "That is 30 MB" and "those
   * bytes are not a picture" are facts about a file, and a person meets them while choosing one —
   * before they have typed a word, and with nothing about a message decided. Folding the bytes into
   * the record write would mean a message refused for the shape of its attachment, with the words
   * already typed and no way to say which half was wrong.
   *
   * ---------------------------------------------------------------------------------------
   * IT IS `remote` BECAUSE THAT IS THE WHOLE POINT OF IT
   * ---------------------------------------------------------------------------------------
   *
   * The person's words ask for a screenshot taken on their other machine to reach an agent here without a file
   * copied across by hand first. A door that only answered on loopback would answer nothing that
   * matters: the picture is coming from the other machine, through
   * MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES, exactly as the words are.
   */
  /**
   * WHAT MAY BE SENT, so a composer can say it before it refuses anybody. Criterion M65.
   *
   * The person's criterion asks for the size and type limits to be said in the composer BEFORE a send is
   * refused rather than after, and a browser cannot know either of them: the size is a setting of
   * this installation, and the types are what the sniffing reader accepts. Both are published here,
   * from the same two declarations the refusals use, so the sentence in the composer and the rule
   * that enforces it cannot come apart.
   *
   * IT IS STATIC AND SITS BESIDE `/messages/:id`. A message id is twelve characters of nanoid's
   * alphabet and is never the word "pictures", and the router prefers the written segment to the
   * parameter, so nothing is shadowed that could otherwise be reached.
   */
  app.get('/messages/pictures', route('message.picture.limits', 'remote', PICTURE_LIMITS_NOTE), async () => ({
    picture: {
      maxBytes: maxMessagePictureBytes(),
      types: Object.keys(UPLOADABLE_AVATAR_TYPES),
      said: MESSAGE_PICTURE_TYPES_READ,
    },
  }))

  app.post(
    '/messages/pictures',
    {
      bodyLimit: pictureBodyLimit,
      // FASTIFY'S OWN REFUSAL DOES NOT REACH A CALLER OF THIS ROUTE. Everything else is handed to
      // the one error handler the server installs, so this adds a sentence and changes nothing else.
      errorHandler: (error, request, reply) => {
        if ((error as { code?: unknown }).code === BODY_TOO_LARGE) {
          return reply.status(413).send({ error: pastEvenTheBodyLimit(pictureLimit, pictureBodyLimit, 'picture') })
        }
        return app.errorHandler(error, request, reply)
      },
      ...route('message.picture', 'remote', PICTURE_NOTE),
    },
    async (req, reply) => {
      const sent = parse(aPictureSent, req.body ?? {}, 'The picture')
      // BASE64 FOR THE REASON THE AVATAR DOOR IS: there is no multipart parser in this server and no
      // dependency that gives one. `Buffer.from` never throws on bad base64 — it drops what it
      // cannot read — so what the bytes turn out to be is decided by sniffing them, below, and not
      // by whether this decode complained.
      const workspaceId = workspaceOf(req)
      const stored = storeAMessagePicture(Buffer.from(sent.bytes, 'base64'), workspaceId)
      reply.code(201)
      return { picture: stored }
    },
  )

  app.post(
    '/messages/files',
    {
      bodyLimit: pictureBodyLimit,
      // THE SAME SENTENCE IN PLACE OF FASTIFY'S OWN, for the reason the picture route gives.
      errorHandler: (error, request, reply) => {
        if ((error as { code?: unknown }).code === BODY_TOO_LARGE) {
          return reply.status(413).send({ error: pastEvenTheBodyLimit(pictureLimit, pictureBodyLimit, 'file') })
        }
        return app.errorHandler(error, request, reply)
      },
      ...route('message.file', 'remote', FILE_NOTE),
    },
    async (req, reply) => {
      const sent = parse(aFileSent, req.body ?? {}, 'The file')
      // NOTHING SNIFFS THESE BYTES, so the decode refuses base64 it cannot read whole rather than drop what it cannot read.
      const stored = storeAMessageFile(decodeReportFileBase64(sent.bytes), sent.name, workspaceOf(req))
      reply.code(201)
      return { file: stored }
    },
  )

  app.get('/messages/forced', route('message.forced', 'remote', FORCED_NOTE), async (req) => {
    const me = whoIsAsking(req)
    // WHERE THIS READER IS, MEASURED ON THIS VERY REQUEST and never taken from anything they sent.
    // It is what decides whether a message narrowed to one viewer is for them. Criterion M62 and
    // Criterion M62 holds the person's words: an emergency may be sent to one screen alone.
    return { messages: forcedMessagesFor(me, writtenFrom(req)) }
  })

  /**
   * WHAT THE GROUPS THIS READER BELONGS TO HAVE GAINED. Criterion GM4.
   *
   * IT IS THE READ A MEMBER THAT WAS NOT @'d MAKES. A group message that @s members reaches only
   * them, so the rest of the group learns what was said by asking here. Every project, because a
   * group follows the conversations and not the project on screen, the same width GET /api/groups
   * reads.
   */
  app.get('/messages/groups', itChangesSomething(route('message.groups-new', 'remote', GROUPS_NEW_NOTE), (query) => query.move === '1'), async (req) => {
    const workspaceId = workspaceOf(req)
    const me = whoIsAsking(req)
    const asked = parse(whichGroupsRead, req.query ?? {}, 'Whether to move the read point')
    // A MEMBER READS ONLY WHAT WAS SENT WHILE IT WAS IN THE GROUP, unless it reads every message
    // . The read point still moves for every group in the answer.
    // THE SUMMARY IS THE BRIEF'S, worked out by the same `whatYourGroupsGained` from this same read and
    // printed by the same `groupNewsText`, so a woken agent reads what a starting one reads.
    const actor = actorFrom(req)
    // `?undelivered=1` leaves out of the summary what reached this reader one by one: a waiter's and dsh's hand-over ask
    // for it, because they hand every delivery over whole (message RFv1V8oxkYGF). The full read is unchanged.
    const gained = whatYourGroupsGained(actor.id, me, theMessageReader(actor), asked.move === '1', asked.undelivered === '1')
    // A HAND-OVER ANSWERS WITHOUT THE FULL READ unless it asks for it (wave 13y round 114). Its two callers,
    // the waiter and dsh's hook, read only `summary` and `text`. The busiest live reader's answers, the full read with
    // them, had a median of 889,574 bytes, at 693 calls in a day.
    const handOver = asked.move === '1' && asked.undelivered === '1'
    return {
      me,
      ...(handOver && asked.groups !== '1' ? {} : { groups: gained.read }),
      workspaceId,
      summary: gained.news,
      text: groupNewsText(gained.news),
    }
  })

  /**
   * THE CONTACT ROWS AND THE NUMBER ON THE CIRCLE, worked out once, for the two doors that answer them.
   *
   * GET /api/messages/contacts answers the rows and the number; GET /api/messages/circle answers the
   * number alone. Both call this, so the circle a closed panel draws is the circle an open panel
   * draws, by construction and not by two computations agreeing.
   */
  function theContactRowsAndTheCircle(me: ParticipantRef, reader: AMessageReader, workspaceId: string, aliases: TheFiledAliases = theFiledAliasesReadOnce(sqlite)): {
    contacts: ContactLine[]
    agents: ReturnType<typeof everyAgentById>
    everyone: KnownParticipant[]
    unread: TheCircle['unread']
  } {
    // THE POOL IS READ ONCE FOR THE WHOLE DOOR: once for the contacts themselves and again for every
    // group's unread count, rather than once per group on top of `contactsFor`'s own read. Before
    // this, `unreadInAGroup` was called with no pool, so `messagesInAGroup` underneath it read every
    // message of every project again for each group this reader is in — the same shape commit
    // f64f6153 already fixed in GET /api/groups, left behind here. Problem 9UeL9VeVPn33.
    // ONLY THIS READER'S PART OF THE POOL IS READ, not every message of every project: option 3 of one of
    // the owner's decisions. It gives the same contacts, and the same group counts,
    // because a group's unread count only counts messages with a delivery row to this reader, and
    // those are all in it. See `theMessagesOfOneReader` and
    // tests/the-contacts-come-from-the-readers-own-messages.test.ts.
    // AND A ROW FOR EVERY WRITER NOBODY REGISTERED, which `contactsFor` adds beside the registered
    // ones. There used to be a separate section called "The board" holding those messages; it was
    // removed, so every message is now in a conversation. What the circle
    // counts is still what the panel can open, because both are these rows. Criterion M25.
    // EVERY AGENT'S REGISTRY ROW IS READ ONCE, for the folding inside `contactsFor` and for the
    // placing below, rather than once per agent contact in each (problem zo_hyUBLSAVJ).
    // `theContactsOfOneReader` is the one reading of these rows; the Embassy asks it too.
    // ONLY THE MESSAGES THIS READER MAY READ go into the rows. Every unread
    // count is of delivery rows addressed to the reader, which it is always a party to, so no count
    // moves; only a row's last line can.
    // IN THE PROJECT ASKED ABOUT, so a message stored under an agent's own record there is in that agent's row, as the
    // browser names it (wave 13y round 89).
    const { contacts, pool, agents, everyone } = theContactsOfOneReader(me, reader, workspaceId, aliases)
    // THE NUMBER ON THE CIRCLE IS WORKED OUT FROM THE ROWS UNDER IT, and is never counted again over
    // the delivery table. Criterion M19: the mark on the circle agrees with the rows the panel draws.
    //
    // IT USED TO BE ITS OWN COUNT, and the two could disagree with nothing failing — the defect
    // CLAUDE.md calls one fact worked out in two places. That count asked the delivery table for
    // every row addressed to this reader that did not say seen, with no filter for the message kind
    // and no regard for whether the panel could open the message. A message in a group and a message
    // from Mole Office are both in it and in neither list, so the circle could stand at a number the
    // reader had no row to press. The fix is the third of CLAUDE.md's three: derive one from the
    // other, and delete the second.
    //
    // AND IT IS TWO NUMBERS RATHER THAN ONE, CRITERION M32. The number on the circle is
    // the contacts' unread MESSAGES plus the NUMBER OF
    // GROUPS holding anything unread. A group of nine unread messages adds one, not nine, and a
    // conversation between two agents adds nothing at all because the person is not in it. The two halves
    // are sent apart because the person's settings choose between drawing them added together and drawing
    // them as two bubbles; adding them here as well would be the same sum in two places.
    // EVERY PROJECT, THE SAME WIDTH AS THE MESSAGES BESIDE IT. Decision `t5DlN5-uTZoT`. The two
    // halves of the circle's number used to count over different widths; problem `m1ea9ihnnu9e`.
    const groups = groupsFor(me, EVERY_PROJECT).map((one) => unreadInAGroup(one.id, me, EVERY_PROJECT, pool))
    return {
      contacts,
      agents,
      everyone,
      unread: {
        messages: contacts.reduce((sum, one) => sum + one.unread, 0),
        groups: groups.filter((count) => count > 0).length,
      },
    }
  }

  /**
   * WHAT A CLOSED CHAT PANEL DRAWS, AND NOTHING ELSE: who is reading and the number on the circle.
   *
   * A closed panel draws the circle button alone. Its picture and how the number is drawn come from
   * the reader's own registry row, which the page reads anyway; the number and who is reading come
   * from here. The rows are worked out and not sent, because the number is added up from them.
   */
  app.get('/messages/circle', route('message.circle', 'remote', CIRCLE_NOTE), async (req): Promise<TheCircle> => {
    const workspaceId = workspaceOf(req)
    const me = whoIsAsking(req)
    return { me, unread: theContactRowsAndTheCircle(me, theMessageReader(actorFrom(req)), workspaceId).unread, workspaceId }
  })

  /**
   * EVERY CONTACT ROW WITH WHERE IT SITS, criterion M29: its key, its group and its place in the group. The
   * arrangement is worked out from the same list the reply carries, so a contact can never be in a group the reply
   * does not draw or missing from every group — which is what keeps the tab count of M19 equal to the sum of the
   * groups. Both contact doors place their rows with this. Each row says whether it is online in the page's project,
   * which is what puts it before the rows that are not (wave 13y round 91, item 22).
   */
  function theContactsPlaced(me: ParticipantRef, contacts: readonly ContactLine[], agents: ReturnType<typeof everyAgentById>, workspaceId: string, aliases?: TheFiledAliases) {
    const toPlace = asContactsToPlace(contacts, agents)
    const personalMarks = agentMarksFor(me)
    const online = theOnesOnline(me, toPlace, agents, workspaceId, aliases)
    const placed = placeTheContacts(me, toPlace, online)
    const where = new Map(placed.map((one) => [one.key, one]))
    return contacts.map((one) => {
      const key = keyOfContact(one)
      const sits = where.get(key)
      // A CONTACT WITH NOWHERE TO SIT IS IMPOSSIBLE, because `placeTheContacts` was given this
      // very list. Saying so loudly rather than defaulting is the fourth rule: a fallback here
      // would put a contact in a group nothing chose and nothing would say it had happened.
      if (sits === undefined) {
        throw new PanelError(`The contact "${key}" was left out of every group. Nothing was read.`, 500)
      }
      return { ...one, key, group: sits.group, at: sits.at, online: online(key), ...(one.who?.kind === 'agent' ? { personalTags: personalMarks.get(one.who.id) ?? [] } : {}) }
    })
  }

  /** Which of these contacts are online in this project, asked by a contact's key (`whichContactsAreOnline`). */
  function theOnesOnline(me: ParticipantRef, contacts: readonly ContactToPlace[], agents: ReturnType<typeof everyAgentById>, workspaceId: string, aliases?: TheFiledAliases): (key: string) => boolean {
    const whos = contacts.flatMap((one) => (one.kind === null || one.id === null ? [] : [{ kind: one.kind, id: one.id }]))
    const online = whichContactsAreOnline(whos, workspaceId, me, agents, undefined, aliases)
    return (key) => online.has(key)
  }

  app.get('/messages/contacts', route('message.contacts', 'remote', CONTACTS_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const me = whoIsAsking(req)
    const asked = parse(listShape, req.query ?? {}, 'The shape asked for')
    const aliases = theFiledAliasesReadOnce(sqlite)
    const { contacts, agents, unread } = theContactRowsAndTheCircle(me, theMessageReader(actorFrom(req)), workspaceId, aliases)
    // THE NUMBER ON THE CIRCLE comes with the rows from `theContactRowsAndTheCircle`, which says how
    // it is worked out.
    return {
      me,
      contacts: theContactsPlaced(me, contacts, agents, workspaceId, aliases).map((row) => (asked.shape === PAGE_SHAPE ? aContactRowForThePage(row) : row)),
      contactGroups: groupsOf(me),
      // THE TWO LOCKED TOP GROUPS, with the fold state on each. Criteria M119 and M121. The headings
      // are the person's words and are declared rather than stored; only the fold can be the person's.
      contactSides: sidesOf(me),
      unread,
      workspaceId,
    }
  })

  app.get('/messages/contact-list', route('message.contact-list', 'remote', CONTACT_LIST_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const me = whoIsAsking(req)
    const asked = parse(aPageOfTheContactList, req.query ?? {}, 'The page of the contact list asked for')
    const aliases = theFiledAliasesReadOnce(sqlite)
    const { contacts, agents, everyone, unread } = theContactRowsAndTheCircle(me, theMessageReader(actorFrom(req)), workspaceId, aliases)
    const placed = theContactsPlaced(me, contacts, agents, workspaceId, aliases)
    const contactGroups = groupsOf(me)
    const contactSides = sidesOf(me)
    // WHAT THE FILTER BOX FINDS A ROW BY: the name it draws, which is the registry's name or the name a writer nobody
    // registered is drawn under, and an agent's handle. The panel finds the rows it holds by the same rule
    // (`theTypedWordsFindARow` in src/web/components/ContactChooser.tsx). A registered row whose registry row is gone
    // has no name and no handle to find.
    const known = new Map(everyone.map((one) => [participantKey(one.who), one]))
    const project = asked.project ?? null
    const typed = (asked.name ?? '').trim()
    const inTheProject = project === null ? placed : placed.filter((one) => one.projects.includes(project))
    const kept = typed === '' ? inTheProject : inTheProject.filter((one) => {
      if (one.who === null) return theTypedWordsFindAContact({ kind: null, name: unregisteredName(one.unregistered ?? { typed: null, said: null }) }, typed)
      const found = known.get(participantKey(one.who))
      return found !== undefined && theTypedWordsFindAContact({ kind: one.who.kind, name: found.name, handle: found.handle }, typed)
    })
    const onTop = theRowsOnTopInDrawnOrder(kept, contactGroups, contactSides)
    const offset = asked.offset ?? 0
    const page = onTop.slice(offset, offset + (asked.limit ?? CONTACT_LIST_PAGE))
    const left = Math.max(0, onTop.length - offset - page.length)
    return {
      me,
      contacts: page.map((one) => aContactRowForThePage(one.row)),
      folded: page.flatMap((one) => one.started.map((row) => aContactRowForThePage(row))),
      contactGroups,
      contactSides,
      rowsIn: Object.fromEntries(contactGroups.map((group) => [group.key, kept.filter((one) => one.group === group.key).length])),
      total: placed.length,
      inTheProject: project === null ? null : inTheProject.length,
      matched: kept.length,
      returned: page.length,
      left,
      next: left > 0 ? theNextPage('/api/messages/contact-list', req.query, offset + page.length) : null,
      name: typed === '' ? null : typed,
      project,
      unread,
      workspaceId,
    }
  })

  app.post('/messages/contact-groups', route('contact.group.make', 'remote', MAKE_A_GROUP_NOTE), async (req, reply) => {
    const me = whoIsAsking(req)
    const body = parse(aNewGroup, req.body ?? {}, 'The group')
    const made = makeAContactGroup(me, body.name, body.side)
    void reply.code(201)
    return { group: made, groups: groupsOf(me) }
  })

  app.patch(
    '/messages/contact-groups/:key',
    route('contact.group.change', 'remote', CHANGE_A_GROUP_NOTE),
    async (req) => {
      const me = whoIsAsking(req)
      const which = parse(z.object({ key: z.string().min(1) }).strict(), req.params, 'The group asked for')
      const body = parse(aChangedGroup, req.body ?? {}, 'The change')
      if (body.name !== undefined) renameAContactGroup(me, which.key, body.name)
      if (body.moveBy !== undefined) moveAContactGroup(me, which.key, body.moveBy)
      if (body.collapsed !== undefined) setAContactGroupCollapsed(me, which.key, body.collapsed)
      return { groups: groupsOf(me), contactSides: sidesOf(me) }
    },
  )

  app.post(
    '/messages/contact-placements',
    route('contact.placement', 'remote', PLACE_A_CONTACT_NOTE),
    async (req) => {
      const workspaceId = workspaceOf(req)
      const me = whoIsAsking(req)
      const body = parse(aPlacement, req.body ?? {}, 'The move')
      // THE CONTACTS AS THE CONTACTS DOOR READS THEM IN THE PAGE'S PROJECT (wave 13y round 91, gap 5). A message stored
      // under an agent's own record there is that agent's, so the row moved is the row the chat drew, in its place.
      const contacts = theContactsOfOneReader(me, null, workspaceId).contacts.map(asAContactToPlace)
      // A MOVE IS A MOVE IN THE ORDER THE GROUP IS DRAWN IN, in the page's project, so the rows that are online are read
      // first, as the contact doors read them.
      const online = theOnesOnline(me, contacts, everyAgentById(), workspaceId)
      if (body.group !== undefined) moveAContact(me, contacts, body.contact, body.group)
      if (body.moveBy !== undefined) moveAContactBy(me, contacts, body.contact, body.moveBy, online)
      return { contacts: placeTheContacts(me, contacts, online), groups: groupsOf(me), contactSides: sidesOf(me) }
    },
  )

  app.get('/messages/unregistered', itChangesSomething(route('message.unregistered', 'remote', UNREGISTERED_NOTE)), async (req) => {
    const workspaceId = workspaceOf(req)
    const me = whoIsAsking(req)
    const asked = parse(whichWriter, req.query ?? {}, 'The writer asked about')
    const writer = unregisteredFromKey(asked.writer)
    if (writer === null) {
      throw new PanelError(
        `"${asked.writer}" does not name a writer. Use the \`writer\` key a contact row carries; ` +
          `every one of them begins with "${UNREGISTERED_PREFIX}".`,
        400,
      )
    }
    // A CLAIMED AGENT ID MAY BE AN AGENT'S OWN RECORD in the project asked about, and then its messages are that agent's
    // and none is a writer nobody registered (wave 13y round 89).
    const everyone = withTheRecordsOfTheseIds(everybodyRegistered(), writer.said?.kind === 'agent' ? [writer.said.id] : [], workspaceId)
    const said = conversationWithUnregistered(writer, me, EVERY_PROJECT, everyone)
    // A PERSON'S READ MOVES THEIR QUEUED ONES TO DELIVERED, the same rule a conversation follows: the
    // messages have reached their screen. None becomes seen, because seen is the reader saying so.
    // AN AGENT'S READ MOVES NOTHING (criterion M127): the waiter and the worker hand an agent only
    // what is still queued, so marking it here would mean nobody ever gives the agent the words.
    const stillQueued = said
      .filter((one) => one.deliveries.some((d) => d.to.kind === me.kind && d.to.id === me.id && d.mark === 'queued'))
      .map((one) => one.id)
    const moved = me.kind === 'person' ? markManyDelivered(stillQueued, me) : []
    const messages = moved.length === 0 ? said : conversationWithUnregistered(writer, me, EVERY_PROJECT, everyone)
    const newest = messages[messages.length - 1]
    return {
      me,
      // THE WRITER AS ITS NEWEST MESSAGE HAS IT, which is the writer its contact row holds (wave 13y round 86). A key
      // naming a claimed id carries no typed line, so the writer of the key alone left the panel no name to draw for a
      // writer that typed one. Every message here has the key asked for, so the answer names the same writer.
      writer: (newest === undefined ? null : unregisteredWriterOf(newest, everyone)) ?? writer,
      messages,
      markedDelivered: moved,
      workspaceId,
    }
  })

  app.get('/messages/conversation', itChangesSomething(route('message.conversation', 'remote', CONVERSATION_NOTE)), async (req) => {
    const workspaceId = workspaceOf(req)
    const me = whoIsAsking(req)
    const asked = parse(whichParticipant, req.query ?? {}, 'The participant asked about')
    // THE PAGE ASKED FOR, checked before anything is marked. No `limit` is the whole conversation.
    const readAt = nowStamp()
    const pageAsked = parse(aPageOfAConversation, req.query ?? {}, 'The page asked for')
    const narrowed = parse(aNarrowingOfAConversation, req.query ?? {}, 'The narrowing asked for').only === 'my-unsent'
    if (narrowed && [pageAsked.limit, pageAsked.before, pageAsked.after, pageAsked.since, pageAsked.from].some((one) => one !== undefined)) {
      throw new PanelError('`only=my-unsent` answers your unsent comments and not a page, so it takes no `limit`, `before`, `after`, `since` or `from`. Nothing was read or marked.', 400)
    }
    if (pageAsked.before !== undefined && pageAsked.after !== undefined) {
      throw new PanelError('Ask for `before` or for `after`, not both. Nothing was read or marked.', 400)
    }
    if (pageAsked.limit === undefined && (pageAsked.before !== undefined || pageAsked.after !== undefined || pageAsked.since !== undefined)) {
      throw new PanelError('`before`, `after` and `since` page a conversation, so they need a `limit` as well. Nothing was read or marked.', 400)
    }
    if (pageAsked.since !== undefined && pageAsked.after === undefined) {
      throw new PanelError('`since` asks what changed among the messages a page holds, so it needs `after` as well. Nothing was read or marked.', 400)
    }
    if (pageAsked.from !== undefined && pageAsked.since === undefined) {
      throw new PanelError('`from` keeps only the changed messages from the oldest one a page holds, so it needs `since` as well. Nothing was read or marked.', 400)
    }
    // AN AGENT ASKED ABOUT MAY BE NAMED BY ITS ID OR ITS HANDLE, criterion I2: the query is an
    // arriving reference, so it goes through the one resolver, and from here on the conversation is
    // read by the registry id it answers. Since the mint (I1) a new agent's id is not its handle.
    // A name two agents answer to is the resolver's own refusal. A person is read by id, as before.
    const named = asked.kind === 'agent' ? theAgentAnArrivingReferenceNames(asked.id, 'reading') : null
    const them: ParticipantRef = named === null ? asked : { kind: 'agent', id: named.agent.id }
    const theirs = readParticipant(them)
    // THE SENTENCE QUOTES THE ID ASKED FOR, and a reader who never typed it is told the same without it, in the short
    // reason the chat draws (wave 13y round 93).
    if (theirs === null) {
      throw new PanelError(`No ${participantWord(asked.kind)} in this installation answers to "${asked.id}".`, 404, undefined, undefined,
        `No ${participantWord(asked.kind)} in this office answers to this name, so there is nothing to read.`)
    }
    // WITH EACH SIDE'S OWN RECORD in the project asked about, so a message stored under it is in this conversation, as
    // the browser names its writer (wave 13y round 89).
    const aliases = theFiledAliasesReadOnce(sqlite)
    const everyone = withTheOwnRecordsOf(everybodyRegistered(aliases), [me, them], workspaceId)
    const { limit } = pageAsked
    // A READ OF ONE PAGE BUILDS ONLY THAT PAGE (`aPageOfTheConversation`); a read with no `limit`
    // builds the whole conversation, as it always did.
    const conversation = limit === undefined && !narrowed ? conversationBetween(me, them, EVERY_PROJECT, everyone) : null
    // WHEN A PERSON READS, every message here has reached their screen, so the ones still queued for
    // them become delivered. Not seen: that is the reader saying they read it, and this route cannot know.
    // A READ OF ONE PAGE MARKS THE WHOLE CONVERSATION THE SAME WAY. The page holds the newest messages
    // and can scroll to the rest, and a message to the person must never stay queued because it sits
    // on a page nobody has scrolled to; the worker would then still think nobody has seen it. A page's
    // read finds them from the person's queued delivery rows alone, not by building the conversation.
    // WHEN AN AGENT READS, NOTHING MOVES (criterion M127). A message to an agent is moved by the hand
    // that gives it the words: its waiter's take, the run the worker starts, or its own one-message
    // mark; a line Mole Office wrote is moved by the worker, which starts no run for it. The waiter and
    // the worker look only for queued rows, so a mark moved here was never handed on.
    const stillQueued =
      me.kind !== 'person'
        ? []
        : conversation === null
          ? theQueuedOnesOfTheConversation(me, them, everyone, EVERY_PROJECT)
          : conversation.messages
              .filter((one) => one.deliveries.some((d) => d.to.kind === me.kind && d.to.id === me.id && d.mark === 'queued'))
              .map((one) => one.id)
    const moved = me.kind === 'person' ? markManyDelivered(stillQueued, me) : []
    // ONLY THE MESSAGES THIS READER MAY READ. A conversation holds the
    // reader's own messages, and also a notice about one of them, which may be addressed to the
    // other side; an agent that is not a party to such a notice is not shown it.
    const reader = theMessageReader(actorFrom(req))
    // ONE ANSWERING READING for the two fields below. Null when the other side is a person. It is the message worker's
    // reading, so it is the same from every project (wave 13y round 112).
    const reading = them.kind === 'agent' ? theAnsweringReadingOfTheWorker(them.id, aliases) : null
    // THE OTHER AGENT'S WHOLE STATUS, read at home IN THE SAME MOMENT AS THE ANSWERING READING: nothing is awaited between
    // the two, so the Cannot reach notice and the dot, the personal words and the work line beside the name are of one
    // moment (wave 13y round 115). The chat makes no status read of its own. Null for a person and for Mole Office.
    const status = them.kind === 'agent' && !isMoleOffice(them) ? theStatusAtHome(them.id, workspaceId, actorFrom(req), aliases) : null
    // A PAGE IS BUILT AFTER THE MARKING, so it shows the new marks with no second read.
    const paged =
      limit === undefined
        ? null
        : aPageOfTheConversation(me, them, everyone, EVERY_PROJECT, { ...pageAsked, limit }, (list) => onlyTheMessagesThisReaderMayRead(reader, list), readAt)
    // THE NARROWED READ IS BUILT AFTER THE MARKING TOO, from the reader's own comments alone.
    const mine = narrowed ? theUnsentOnesOfTheConversationFrom(me, them, everyone, EVERY_PROJECT, (list) => onlyTheMessagesThisReaderMayRead(reader, list)) : null
    const every =
      conversation === null
        ? []
        : onlyTheMessagesThisReaderMayRead(
            reader,
            // THE MOVED MESSAGES ARE READ AGAIN, AND ONLY THEY, so the reply shows their new marks. A
            // mark does not change which conversation a message is in.
            withTheseMessagesReadAgain(conversation.messages, moved, EVERY_PROJECT),
          )
    return {
      me,
      them,
      messages: paged === null ? (mine ?? every) : paged.messages,
      // SAID ONLY BY A NARROWED READ, so a read without it is the same as before.
      ...(narrowed ? { only: 'my-unsent' as const } : {}),
      // WHAT THE PAGE IS, or null for a read of the whole conversation.
      page: paged === null ? null : paged.page,
      markedDelivered: moved,
      // WHICH MIND WOULD ANSWER IF SOMETHING WERE SENT NOW. Criterion H3: the header of the
      // conversation says whether the agent somebody has open is answering, or a run Mole Office
      // starts. It is here rather than on the presence read because it is a fact about answering
      // rather than about being online, and because this is the read the header already makes.
      // Null when the other side is a person: nobody starts a run for a person.
      answering: reading === null ? null : reading.answering,
      // WHETHER THE OFFICE COULD NOT TELL, read from the same reading as answering, so the chat can
      // say "could not tell" apart from "cannot reach" (problem TOoUy7fMbg1P). Null for a person.
      couldNotTell: reading === null ? null : whatAReadingSaysOfReach(reading)?.was === 'could not tell',
      // WHAT HAPPENS NEXT TO A MESSAGE WAITING FOR THE AGENT, from the same reading, criterion M86. The chat
      // draws it under the reader's newest waiting message until the worker writes its own reason on the row.
      // Null when the other side is a person.
      whatHappensToAWaitingMessage:
        reading === null ? null : whatHappensToAWaitingMessage('handle' in theirs ? theirs.handle : them.id, reading),
      // THE AGENT'S WHOLE STATUS, read with `answering` above. Null for a person and for Mole Office.
      status,
      // WHETHER THE AGENT HOLDS WORDS TO THIS READER NOW, in a turn draft it has not sent (lib/turn-drafts.ts). The chat
      // draws its Replying from this alone. Null when the other side is a person.
      replying: reading === null ? null : theAgentIsReplyingTo(them.id, me),
      workspaceId,
    }
  })

  app.get('/messages/between-agents', route('message.between-agents', 'remote', BETWEEN_AGENTS_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const me = participantForActor(actorFrom(req))
    const asked = parse(listShape, req.query ?? {}, 'The shape asked for')
    const query = (req.query ?? {}) as Record<string, unknown>
    const pageAsked = query['limit'] === undefined ? null : parse(aPageOfAgentConversationList, req.query, 'The page asked for')
    const because = whyReadingSomebodyElsesIsRefused(me)
    if (because !== null) return { conversations: [], mayRead: false, because, workspaceId, ...(pageAsked === null ? {} : { page: { next: null } }) }
    if (pageAsked !== null) {
      const page = aPageOfAgentConversations(me, workspaceId, pageAsked.project ?? null, pageAsked.cursor)
      return {
        conversations: asked.shape === PAGE_SHAPE ? page.conversations.map(aBetweenAgentsRowForThePage) : page.conversations,
        page: page.page,
        mayRead: true,
        because: CHAT_WORDS.readingSomebodyElses,
        workspaceId,
      }
    }
    // WHO IS ASKING IS HANDED IN, so each conversation can say how much of it is new to them.
    // Criterion M32 puts a grey bubble on the Between agents tab when there is anything new, and
    // what "new" means here is the time this reader last opened the conversation — there is
    // nothing of theirs in it to be unread. `conversationsBetweenAgents` says why.
    const whole = conversationsBetweenAgents(EVERY_PROJECT, me, workspaceId)
    return {
      // THE PAGE'S SHORT LIST IS THE WHOLE LIST WITH FIELDS LEFT OUT: the same rows in the same
      // order, each cut by `aBetweenAgentsRowForThePage`.
      conversations: asked.shape === PAGE_SHAPE ? whole.map(aBetweenAgentsRowForThePage) : whole,
      mayRead: true,
      because: CHAT_WORDS.readingSomebodyElses,
      workspaceId,
    }
  })

  app.get('/messages/between/:pair', itChangesSomething(route('message.as-a-side', 'remote', AS_A_SIDE_NOTE)), async (req) => {
    const workspaceId = workspaceOf(req)
    const me = participantForActor(actorFrom(req))
    const because = whyReadingSomebodyElsesIsRefused(me)
    if (because !== null) throw new PanelError(because, 403)
    const asked = parse(whichPair, req.params, 'The pair asked about')
    const named = pairFrom(asked.pair)
    if (named === null) {
      throw new PanelError(
        `"${asked.pair}" does not name two agents. A pair is the two agent ids with a tilde between them, as ` +
          '"builder-x~checker-y".',
        400,
      )
    }
    // EACH SIDE OF THE PAIR MAY BE NAMED BY ITS ID OR ITS HANDLE, criterion I2: the path is an
    // arriving reference, so each goes through the one resolver and is read by the registry id it
    // answers from here on. Since the mint (I1) a new agent's id is not its handle. A string the
    // resolver finds nobody for is kept as sent, and the 404 below names it. The list of conversations
    // between agents reads each side with the same function (wave 13y round 129, item 67).
    const theAgentNamed = theAgentTheDoorToOnePairReads
    const pair: [ParticipantRef, ParticipantRef] = [theAgentNamed(named[0]), theAgentNamed(named[1])]
    // ONE AGENT NAMED TWICE, once by its handle and once by its id, is not a pair either.
    if (pair[0].id === pair[1].id) {
      throw new PanelError(
        `"${asked.pair}" does not name two agents. A pair is the two agent ids with a tilde between them, as ` +
          '"builder-x~checker-y".',
        400,
      )
    }
    // NO SIDE AT ALL IS A READING, NOT A MISTAKE. Criterion M72: the person reads a conversation between two
    // agents as a third party, both sides in one view, taking neither of their viewpoints. `as=`
    // left out, or naming NEITHER_SIDE, is that reading; `as=` naming an agent that is not in the
    // pair is still a mistake and still says so.
    const side = parse(whichSide, req.query ?? {}, 'The side to read it as')
    const pageAsked = parse(aPageOfAConversation, req.query ?? {}, 'The page asked for')
    if (pageAsked.before !== undefined && pageAsked.after !== undefined) {
      throw new PanelError('Ask for `before` or for `after`, not both. Nothing was read or marked.', 400)
    }
    if (pageAsked.limit === undefined && (pageAsked.before !== undefined || pageAsked.after !== undefined || pageAsked.since !== undefined)) {
      throw new PanelError('`before`, `after` and `since` page a conversation, so they need a `limit` as well. Nothing was read or marked.', 400)
    }
    if (pageAsked.since !== undefined && pageAsked.after === undefined) {
      throw new PanelError('`since` asks what changed among the messages a page holds, so it needs `after` as well. Nothing was read or marked.', 400)
    }
    if (pageAsked.from !== undefined && pageAsked.since === undefined) {
      throw new PanelError('`from` keeps only the changed messages from the oldest one a page holds, so it needs `since` as well. Nothing was read or marked.', 400)
    }
    const neutral = side.as === undefined || side.as === NEITHER_SIDE
    const sideNamed = neutral ? null : theAgentNamed({ kind: 'agent', id: String(side.as) })
    const asSide = sideNamed === null ? null : (pair.find((one) => one.id === sideNamed.id) ?? null)
    if (!neutral && asSide === null) {
      // THE TWO AGENTS ARE NAMED BY THE HANDLES ON THEIR ROWS, which the caller may send as they are;
      // a side no row answers is shown as it was sent.
      const handleOf = (one: ParticipantRef): string => (readParticipant(one) as { handle?: string } | null)?.handle ?? one.id
      throw new PanelError(
        `"${String(side.as)}" is not one of the two agents in this conversation. Read it as ${handleOf(pair[0])}, as ` +
          `${handleOf(pair[1])}, or with no side at all to read it as neither of them.`,
        400,
      )
    }
    // THE SENTENCE QUOTES THE ID SENT, and a reader who never typed it is told the same without it, in the short reason
    // the chat draws, as the conversation door does (wave 13y round 94).
    for (const one of pair) {
      if (readParticipant(one) === null) {
        throw new PanelError(`No durable agent in this installation answers to "${one.id}".`, 404, undefined, undefined,
          'No agent in this office answers to one of these two names, so there is nothing to read.')
      }
    }
    // WHEN THIS READER LAST OPENED IT, READ BEFORE THIS READ IS WRITTEN. Otherwise the answer would
    // be "you read this a moment ago", which the reader can see for themselves.
    const aliases = theFiledAliasesReadOnce(sqlite)
    const key = pairKey(pair[0], pair[1])
    const before = me === null ? null : whenTheyLastRead(me, key, EVERY_PROJECT, aliases)
    const everyone = withTheOwnRecordsOf(everybodyRegistered(aliases), pair, workspaceId)
    const readAt = nowStamp()
    const page = pageAsked.limit === undefined ? null : aPageOfTheConversation(
      pair[0], pair[1], everyone, EVERY_PROJECT, { ...pageAsked, limit: pageAsked.limit }, (messages) => messages, readAt,
    )
    // AND THE READ ITSELF, ON A TABLE THAT IS KEPT. `api_calls` also carries it and is pruned after
    // a fortnight, which is what problem `xdcPntH9rxw_` measured; this row is the durable one.
    if (me !== null) recordThatSomebodyRead(me, key, asSide, workspaceId, undefined, aliases)
    return {
      between: pair,
      /** Which of the two this was read as, or null because it was read as neither. */
      asSide,
      // THE CONVERSATION IS READ WITH THE PARTICIPANTS, as the talk door reads it (wave 13y round 91, gap 7): a message
      // stored under either agent's handle or its own record in this project is that agent's.
      messages: page === null ? conversationBetween(pair[0], pair[1], EVERY_PROJECT, everyone).messages : page.messages,
      page: page?.page ?? null,
      readWasRecorded: true,
      /** The last time this reader opened this conversation before now, or null when never. */
      readBefore: before,
      says: asSide === null ? CHAT_WORDS.readingBothSides : CHAT_WORDS.readingSomebodyElses,
      workspaceId,
    }
  })

  app.get('/messages/comments', route('message.comments', 'remote', COMMENTS_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const reader = theMessageReader(actorFrom(req))
    const asked = parse(listShape, req.query ?? {}, 'The shape asked for')
    // ONE BUILD AT A TIME FOR THIS PROJECT AND READER, AND NONE WHILE NOTHING HAS BEEN WRITTEN (lib/comments-answer.ts).
    const whole = await theCommentsAnswer(`${workspaceId}\n${JSON.stringify(reader)}`, () => {
      // A COMMENT THAT IS A MESSAGE IS SHOWN ONLY TO A READER WHO MAY READ IT.
      // An annotation is not a message and is kept as it is.
      const comments = onlyTheMessagesThisReaderMayRead(reader, commentRecordsIn(workspaceId))
      return { comments: withTheOrderWritten(comments), recipientNames: recipientNamesOfComments(comments, workspaceId), workspaceId }
    })
    // THE PAGE'S SHORT LIST IS CUT FROM THE KEPT ANSWER, on copies: the same build serves both shapes,
    // and the kept answer stays whole for the next reader who asks for it whole.
    return asked.shape === PAGE_SHAPE ? { ...whole, comments: whole.comments.map(aCommentRowForThePage) } : whole
  })

  // WHO IS ASKING DECIDES WHAT A PERSON'S PRESENCE SAYS, since M20: a person who has made themselves
  // invisible is here to an agent they have written to and away to every other. `participantForActor`
  // rather than `whoIsAsking`, because a caller neither registry holds may still read presence — it
  // is simply told the least, which is what an unplaceable caller has earned.
  app.get('/presence', route('presence.all', 'remote', PRESENCE_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const asked = parse(presenceOf, req.query ?? {}, 'The participants asked about')
    const askedBy = participantForActor(actorFrom(req))
    if (asked.scope !== undefined && asked.of === undefined) throw new PanelError('scope=home reads the participants named in of, and of is left out. Name them, as of=agent:<id>,person:<id>. Nothing was read.', 400)
    const presence = asked.of === undefined ? everybodysPresence(workspaceId, new Date(), askedBy)
      : asked.scope === 'home' ? thePresenceAtHome(asked.of, workspaceId, actorFrom(req), new Date())
      : thePresenceOf(asked.of, workspaceId, new Date(), askedBy)
    return { presence, workspaceId }
  })

  app.get('/presence/:kind/:id', route('presence.one', 'remote', ONE_PRESENCE_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const who = parse(whichParticipant, req.params, 'The participant asked about')
    return {
      presence: participantPresence(who, workspaceId, new Date(), participantForActor(actorFrom(req))),
      workspaceId,
    }
  })

  app.get('/messages/:id', route('message.read', 'remote', READ_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const which = parse(whichMessage, req.params, 'The message asked for')
    // REFUSED, WITH ONE SENTENCE FOR "NOT YOURS" AND "NOT THERE", to a reader who may not read it
    // .
    refuseAMessageThisReaderMayNotRead(theMessageReader(actorFrom(req)), which.id, 'refuse')
    return { message: readMessage(which.id, workspaceId) }
  })

  app.post('/agents/:id/start-a-new-agent', route('agent.start-a-new-agent', 'remote', START_A_NEW_AGENT_NOTE), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const actor = actorFrom(req)
    // A SECRETARY HOLDING THE PERSON'S GRANT MAY PRESS THIS FOR THEM, where this office's list of what the grant carries
    // says it does. It starts the person's new agent, with the starter and the press a person's own press gives it, and
    // the change rows name the secretary and the grant. The card keeps this door by default.
    const carried = actor.type === 'agent' && aRaiseCarriesIt(actor)
    if (actor.type !== 'human' && !carried) {
      await reply.code(403).send({
        error:
          `Starting a new agent is the person\u2019s press, and this request comes from "${actor.id}". Nothing was ` +
          'written. Whatever is waiting is still waiting, and the person can press it in the chat, on the contact row or ' +
          'in the right-click menu.',
      })
      return reply
    }
    const who = parse(whichParticipant, { kind: 'agent', id: (req.params as { id: string }).id }, 'The agent asked about')
    return startANewAgentFor(who.id, workspaceId, carried ? THE_PERSON : actor.id, actor)
  })

  app.get('/agents/:id/start-a-new-agent', route('agent.start-a-new-agent.would-carry', 'remote', WOULD_THE_PRESS_CARRY_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const who = parse(whichParticipant, { kind: 'agent', id: (req.params as { id: string }).id }, 'The agent asked about')
    return { wouldCarry: wouldThePressCarryAnything(who.id, workspaceId) }
  })

  app.post('/messages/:id/start-an-agent', route('message.start-an-agent', 'remote', START_AN_AGENT_NOTE), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const actor = actorFrom(req)
    // ONLY A PERSON PRESSES THIS, OR A SECRETARY HOLDING THE PERSON'S GRANT where this office's list of what the grant
    // carries says it does. A new agent may start only after a press confirms it,
    // and the one pressing in the person's chat is the person. An agent with no grant is refused by name and told what
    // to do instead, because the message it is asking about is still there to be read. The card keeps this door.
    const carried = actor.type === 'agent' && aRaiseCarriesIt(actor)
    if (actor.type !== 'human' && !carried) {
      await reply.code(403).send({
        error:
          `Starting an agent for a message is the person\u2019s press, and this request comes from ` +
          `"${actor.id}". Nothing was written. The message is still waiting and the person can press it in the chat.`,
      })
      return reply
    }
    const which = parse(whichMessage, req.params, 'The message asked for')
    // THE EXPECTED TIME, TYPED OR NOT. Criterion F10: an expected time typed by whoever starts the
    // task is what the expected-time reminder judges the run by. Left out means nobody typed one,
    // and then nothing is reminded about the run — no default exists to guess a deadline from.
    const said = (req.body ?? {}) as { expectedMinutes?: unknown }
    const typed = said['expectedMinutes']
    const expectedMinutes =
      typed === undefined ? undefined : typeof typed === 'number' && Number.isInteger(typed) && typed > 0 ? typed : null
    if (expectedMinutes === null) {
      await reply.code(400).send({
        error:
          'The expected time is a whole number of minutes, as {"expectedMinutes": 60}. Leave it out when nobody ' +
          'typed one and nothing will be reminded about the run.',
      })
      return reply
    }
    const { wrote, ...result } = askForARunFor(which.id, workspaceId, actor.id, actor, expectedMinutes)
    if (wrote) return result
    const sentence = nothingWrittenSentence({ kind: 'already-stored' })
    return { ...result, says: sentence, nothingWritten: sentence }
  })

  app.post('/messages/:id/mark', route('message.mark', 'remote', MARK_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const me = whoIsAsking(req)
    const which = parse(whichMessage, req.params, 'The message asked for')
    const body = parse(markBody, req.body ?? {}, 'The mark')
    // ARCHIVED IS THE OFFICE'S OWN MARK, refused before anything is read or written (problem 0WUuvB0IhRfb).
    if (body.mark === 'archived') throw new PanelError(ARCHIVED_IS_THE_OFFICES_MARK, 403)
    // THE MESSAGE IS READ FIRST so an id naming nothing is refused the way every other route
    // refuses it, rather than as a missing delivery row.
    //
    // AND IT IS READ WHEREVER IT IS FILED, criterion M76. The person's finding of 7 September 2026: standing
    // in one project they could not mark read a message filed in another, so it stayed unread after
    // they had read it. The person's chat covers every project — it draws messages from all of them —
    // so the project the reader happens to stand in is not part of "this reader has read this
    // message". The mark itself has no project and never has.
    //
    // A READER WHO MAY NOT READ IT IS REFUSED FIRST, in the one sentence that does not say whether the id
    // names a message, as GET /api/messages/:id refuses one. Until 29 September 2026
    // this door answered "No message has the id" before asking, which told a stranger which ids exist.
    // This door follows a decision. It asks nothing about the project, so any project header,
    // or none, still marks.
    refuseAMessageThisReaderMayNotRead(theMessageReader(actorFrom(req)), which.id, 'refuse')
    readMessageWhereverItIs(which.id)
    // THE PROJECT ASKED FROM NAMES ONLY WHICH CONTACT ROWS A SEEN MARK IS ANNOUNCED WITH (wave 13y round 91, gap 4).
    const outcome = markDelivery(which.id, me, body.mark, workspaceId)
    return { message: readMessageWhereverItIs(which.id).message, ...outcome, workspaceId }
  })

  app.post('/messages/seen', route('message.mark-seen', 'remote', MARK_SEEN_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const me = whoIsAsking(req)
    const body = parse(seenMarksBody, req.body ?? {}, 'The seen marks')
    // EACH MESSAGE IS ASKED ABOUT AS THE DOOR FOR ONE MESSAGE ASKS, before anything is written: a reader who may not
    // read it is refused in the sentence that does not say whether the id names a message, and an id naming nothing
    // is refused as every other route refuses it.
    const reader = theMessageReader(actorFrom(req))
    for (const id of body.messages) {
      refuseAMessageThisReaderMayNotRead(reader, id, 'refuse')
      readMessageWhereverItIs(id)
    }
    return { marks: markManySeen(body.messages, me, workspaceId), workspaceId }
  })

  app.post('/messages/:id/not-now', route('message.not-now', 'remote', NOT_NOW_NOTE), async (req, reply) => {
    workspaceOf(req)
    const actor = actorFrom(req)
    // ONLY A PERSON PRESSES NOT NOW, OR A SECRETARY HOLDING THE PERSON'S GRANT where this office's list of what the grant
    // carries says it does. The offer is drawn on a person's screen, and the press answers it there; under the grant it
    // puts off the person's offer, never one made to the secretary. The card keeps this door by default.
    const carried = actor.type === 'agent' && aRaiseCarriesIt(actor)
    if (actor.type !== 'human' && !carried) {
      await reply.code(403).send({
        error:
          `Not now is the person's answer to an offer drawn on their screen, and this request comes from "${actor.id}". ` +
          'Nothing was written.',
      })
      return reply
    }
    const me = carried ? { kind: 'person' as const, id: THE_PERSON } : whoIsAsking(req)
    const which = parse(whichMessage, req.params, 'The message asked for')
    // A READER WHO MAY NOT READ IT IS REFUSED FIRST, in the sentence that does not say whether the id names a
    // message, as the mark door refuses one.
    refuseAMessageThisReaderMayNotRead(theMessageReader(actor), which.id, 'refuse')
    return { ...putOffALeadOffer(which.id, me), messageId: which.id }
  })

  app.post('/messages/:id/remind-me-later', route('message.remind-me-later', 'remote', REMIND_ME_LATER_NOTE), async (req) => {
    workspaceOf(req)
    const actor = actorFrom(req)
    // THE PERSON, OR A SECRETARY THEIR GRANT CARRIES FOR THEM. The press sets when a line is written to the
    // person, so a press under the grant moves the person's delivery and never the secretary's own. The card keeps this
    // door, so an office that changed nothing refuses the secretary in the check's words.
    if (!thePersonIsProved(actor) && !aRaiseCarriesIt(actor)) {
      assertThePersonIsProved(actor, 'Remind me later', 'The person presses it in the chat.')
    }
    const me: ParticipantRef = actor.elevationUsed === true ? { kind: 'person', id: THE_PERSON } : whoIsAsking(req)
    const which = parse(whichMessage, req.params, 'The message asked for')
    const body = parse(remindMeLaterBody, req.body ?? {}, 'The choice')
    refuseAMessageThisReaderMayNotRead(theMessageReader(actor), which.id, 'refuse')
    // WHO SET THE TIME, so the line the office writes later says the secretary set it where the secretary did.
    return remindMeLater(which.id, me, body.choice, { kind: actor.type, id: actor.id })
  })

  app.post('/messages/:id/mark-broken', route('message.mark-broken', 'remote', MARK_BROKEN_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const actor = actorFrom(req)
    // ONLY THE PERSON, PROVED. The mark is theirs, so only they say a reply broke it. A
    // secretary holding their grant may say it for them where this office's list of what the grant carries says so;
    // the card keeps it, so an office that changed nothing refuses that secretary in the check's words.
    if (!thePersonIsProved(actor) && !aRaiseCarriesIt(actor)) {
      assertThePersonIsProved(actor, '"Mark broken"', 'The person presses it on the reply in the chat.')
    }
    const which = parse(whichMessage, req.params, 'The reply')
    const body = parse(markBrokenBody, req.body ?? {}, 'The marked message')
    const reader = theMessageReader(actor)
    refuseAMessageThisReaderMayNotRead(reader, which.id, 'refuse')
    refuseAMessageThisReaderMayNotRead(reader, body.markedMessage, 'refuse')
    return fileAMarkBrokenPress(which.id, body.markedMessage, actor, workspaceId, body.part)
  })
}
