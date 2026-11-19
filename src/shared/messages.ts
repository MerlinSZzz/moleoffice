// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { TWELVE_ID_CHARACTERS } from './record-id-shape.ts'
import { OFFICE_PAGE_PATH_SOURCE } from './office-address.ts'
import { content, readStoredWord, sayInEnglish, type Say, type WordKey } from './i18n.ts'
import { theBranchedLine } from './office-lines.ts'
import { CIRCLE_PICTURES, type CirclePicture } from './circle-pictures.ts'
/**
 * ONE MESSAGE POOL: WHO SENT IT, WHO IT IS TO, WHERE IT POINTS, AND HOW FAR IT GOT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A MESSAGE IS NOW
 * ---------------------------------------------------------------------------------------
 *
 * A message used to be a line on a board: a body, a name typed into `from`, and a flag saying the
 * owner had read it. Criterion M1 of `design/messages/ACCEPTANCE.md` makes it the one thing every
 * conversation, every board row and every comment on a page is made of. So a message now also says
 * who sent it as a participant, who it is addressed to, and — when it is a comment — what on a page
 * it is about.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE EACH FACT LIVES, AND WHY IT IS ONLY IN ONE PLACE
 * ---------------------------------------------------------------------------------------
 *
 * `sentBy`, `to` and `target` are fields of the record. A delivery mark is NOT: it is a row in
 * `message_delivery`, one per recipient. The reason is that a mark changes — queued becomes
 * delivered becomes seen — and a record field cannot change without a revision. Ten marks moving on
 * one message would be ten revisions of a message nobody edited.
 *
 * WHEN IT WAS SENT IS THE RECORD'S OWN `created_at` AND THERE IS NO SECOND COPY. Sending a message
 * is creating it, so a `sentAt` field would be the same fact written twice, free to disagree with
 * the first. `sentAt` is on the shape a reader gets back, worked out from `created_at`, so a caller
 * never has to know that.
 *
 * ---------------------------------------------------------------------------------------
 * `from` IS STILL THE WORDS SOMEBODY WROTE, AND `sentBy` IS WHO THEY WERE
 * ---------------------------------------------------------------------------------------
 *
 * Invariant 8 of USER.md: what a person wrote is kept exactly as typed, and what Mole Office made
 * of it sits beside it and never instead of it. Measured on the live database on 4 September 2026:
 * all 25 message records carry a `from` line, and they say things like "claude-code · session
 * touch", "panelx · resource sweep" and "claude-code, wave 5". Several of those name nothing in
 * either registry. Rewriting that field into a participant reference would delete twenty-five
 * written lines and invent an identity for the ones that have none.
 *
 * So `from` keeps its meaning and its rows, and `sentBy` is the new, strict, addressable half.
 */

import { type AgentRuntime, type ParticipantKind, type ParticipantRef, isParticipantKind, participantWord } from './participants.ts'
// WHETHER A RUNNING SESSION OF ONE RUNTIME CAN BE REACHED, measured, with the version and the date.
// The one declaration; `whatAnUrgentMessageGets` below reads it rather than restating it.
import { ADDRESS_NAME_WORDS_RENAMED, nowSaid } from './renamed-words.ts'
// WHERE CHINESE TAKES A SPACE, the office's one rule; a lead sentence asks it where a name meets its words.
import { gapBetween, wordWithSpacedValues } from './spacing.ts'
import { HOW_TO_WAKE } from './waking.ts'
import type { TheDeadLetterSummarySaid } from './dead-letter-lines.ts'
import type { TheDeadLetterSweepSaid } from './groups.ts'
// A PICTURE IN A MESSAGE IS THE SAME SHAPE A PICTURE IN A REPORT IS, and it is imported rather than
// described again here. Criterion M64 says "the way a report does", and one declaration is what
// makes that true instead of nearly true.
import type { ImageBlock } from './types.ts'
import { aPiece, whatIsNotCovered } from './intent.ts'
import { nameTarget, spanNamedBy, wordsNamedBy, type Context } from './targets.ts'
import { MESSAGE_CENTRE } from './workspaces.ts'
import { theFlagsOf, type AMarkedPartOnTheWire, type IntentMark } from './intent-mark.ts'
import { readMessageLabel, type MessageLabel } from './message-label.ts'
import { A_PUT_OFF_OFFER_COMES_BACK_AFTER_MINUTES } from './short-lists.ts'
import { CUT_MARK, shortenToWords } from './shortening.ts'

// ============================================================================ delivery marks

/**
 * HOW FAR A MESSAGE GOT WITH ONE RECIPIENT. Four words, listed in the order a mark may move.
 *
 * Three of them happen one after the other: a message is written (queued), something that serves
 * the recipient reads it (delivered), and the recipient says they have read it (seen).
 *
 * THE FOURTH, `archived`, IS SET ONLY BY MOLE OFFICE, AND ONLY FROM `queued`. Problem 0WUuvB0IhRfb. It
 * means nobody read the message and nobody will be woken for it. The dead-letter sweep sets it on an
 * office notice whose addressee is retired (`archiveADelivery` in src/server/lib/messages.ts). "Seen"
 * would be false there, so it has a word of its own. It is not a step after `seen`. It sits between
 * `queued` and `delivered` in this list, so the forward-only rule reads it truthfully: a delivered or
 * seen row never moves back to archived, and an archived row that somebody does read later moves on
 * to delivered. The mark door refuses it to every caller (`DELIVERY_MARKS_A_CALLER_MAY_SET`).
 */
export const DELIVERY_MARKS = ['queued', 'archived', 'delivered', 'seen'] as const

/** One of the four. */
export type DeliveryMark = (typeof DELIVERY_MARKS)[number]

/** The marks a caller may ask the mark door for. `archived` is the office's own, so it is not here. */
export const DELIVERY_MARKS_A_CALLER_MAY_SET = ['queued', 'delivered', 'seen'] as const satisfies readonly DeliveryMark[]

/** A mark a caller may name: every mark but `archived`. */
export type ACallersDeliveryMark = (typeof DELIVERY_MARKS_A_CALLER_MAY_SET)[number]

/**
 * THE MOST MESSAGES ONE REQUEST TO POST /api/messages/seen MAY MARK. The server writes a request's
 * marks in one transaction, and answers nobody else until it ends, so the list has an end. The chat
 * sends the marks for what is on its screen in requests of at most this many.
 */
export const SEEN_MARKS_IN_ONE_REQUEST_AT_MOST = 100

/**
 * WHETHER A MARK SAYS THAT SOMETHING SERVING THE RECIPIENT READ THE MESSAGE: `delivered` or `seen`.
 *
 * `queued` and `archived` both say nobody read it. Every reader that asks "has anybody been handed
 * these words" asks this, so an archived row is never counted as handed over.
 */
export function aMarkSaysItWasRead(mark: DeliveryMark): mark is 'delivered' | 'seen' {
  return mark === 'delivered' || mark === 'seen'
}

/** What a reader sees for one mark, and what the product says when they ask what it means. */
export interface DeliveryWord {
  /** The word on the screen. */
  word: string
  /** The whole sentence. */
  sentence: string
  /**
   * The shape drawn beside the owner's own message.
   *
   * A sent message gets a small tick, and one still in the queue gets a clock. M113 moved the clock before the row
   * exists, and a decision added muted double ticks for delivery and green double ticks for
   * read. These shapes are named
   * here rather than chosen in the component, so the drawing and the sentence cannot come apart.
   *
   * `words` draws the mark's word itself and no glyph. An archived message was read by nobody, so no
   * tick may stand beside it.
   */
  shape: 'clock' | 'tick' | 'double-tick' | 'read' | 'words'
}

/**
 * The four readings, keyed by the stored word.
 *
 * A `Record` keyed by the value rather than an array, so a word added to `DELIVERY_MARKS` with no
 * reading does not compile. That is the same guard `PRESENCE` in shared/lifecycle.ts uses.
 *
 * Each mark's `word` and `sentence` are read from the word lists (keys `delivery.<mark>.word` and
 * `delivery.<mark>.sentence`) with `readStoredWord`. The Messages page and the chat both read them
 * here, in the reader's language; the server reads the English.
 */
export const DELIVERY: Readonly<Record<DeliveryMark, DeliveryWord>> = {
  /**
   * SHAPE CHANGED FROM `clock` TO `tick` ON 11 September 2026. Criterion M113, the person's picture of the
   * sequence: ◷ → ✓ → ✓✓, or ◷ → !. Before this the clock stood here, meaning *written down at the
   * server, not yet read*; the person's words asked for a clock to mean something earlier than that — *not
   * yet written down at all*, the moment between the press and the server's answer, which this row
   * cannot describe because it does not exist until the server has already written the row. That
   * earlier moment is drawn by Chat.tsx itself, locally, before any row like this one exists; once
   * this row exists the server has the message, which is what the person's single tick means.
   * A decision extends M113: queued is one muted tick, delivered is two muted ticks, and read is
   * two green ticks. The separate read shape keeps green tied to the recipient's act.
   */
  //
  // THE WORDS ARE READ FROM THE WORD LISTS (section R8b of src/shared/words) each time they are
  // read, in the page's language in a browser and in English under Node, so the stored sentence the
  // server writes with a mark's word stays English (readStoredWord).
  queued: {
    get word() { return readStoredWord('delivery.queued.word') },
    get sentence() { return readStoredWord('delivery.queued.sentence') },
    shape: 'tick',
  },
  delivered: {
    get word() { return readStoredWord('delivery.delivered.word') },
    get sentence() { return readStoredWord('delivery.delivered.sentence') },
    shape: 'double-tick',
  },
  seen: {
    get word() { return readStoredWord('delivery.seen.word') },
    get sentence() { return readStoredWord('delivery.seen.sentence') },
    shape: 'read',
  },
  // ARCHIVED IS DRAWN IN WORDS AND NEVER AS A TICK, because nobody read the message (problem 0WUuvB0IhRfb).
  archived: {
    get word() { return readStoredWord('delivery.archived.word') },
    get sentence() { return readStoredWord('delivery.archived.sentence') },
    shape: 'words',
  },
}

/** True when this word is one of the four. */
export function isDeliveryMark(value: unknown): value is DeliveryMark {
  return typeof value === 'string' && (DELIVERY_MARKS as readonly string[]).includes(value)
}

// ============================================================================ who worked a recipient out

/**
 * WHICH WRITER WORKED A DELIVERY ROW'S RECIPIENT OUT, or null because the writer named them.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A ROW SAYS THIS AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * `message_delivery.inferred_by` is the one place a row says that somebody had to work its recipient
 * out rather than being told. Two writers do that, and each writes its own name here:
 *
 *   `INFERRED_BY_THE_MIGRATION`  the backfill in src/server/db/message-delivery-migration.ts, which
 *                                addressed every message written before the pool existed to the
 *                                owner, because a line on the message board was always for the owner.
 *   `INFERRED_BY_THE_DOOR`       the write door in src/server/lib/messages.ts, which turned what a
 *                                writer chose — a run — into the agent that run worked as.
 *
 * A row whose recipient the writer named outright carries null: `to` with no chosen run names them,
 * and `toGroup` names the group whose membership was who it reached. Nothing was worked out, so
 * nothing is claimed.
 *
 * ---------------------------------------------------------------------------------------
 * ONE ANSWER, ASKED BY EVERY WRITER
 * ---------------------------------------------------------------------------------------
 *
 * This is the only statement of which messages count as having had a recipient worked out. The door
 * writes the answer on each row it makes, and the migration asks the same function to decide which
 * rows written before the column existed still need a stamp. Two copies of the answer would drift,
 * which is USER.md's ninth invariant.
 */
export const INFERRED_BY_THE_MIGRATION = '0115_how_far_a_message_got'

/** The write door, which worked the recipient out from the run the writer chose. */
export const INFERRED_BY_THE_DOOR = 'the message door'

/**
 * THE ROUTING, WHICH ADDED A RECIPIENT BECAUSE THE ADDRESSEE COULD NOT BE REACHED, follows the secretary's decision
 * `J1Qge4JH87bv` and one more. When a message's addressee is retired, or nothing is answering
 * as it, Mole Office also gives the message to the first reachable participant up the addressee's chain of starters.
 * That copy's delivery row is a recipient the writer did not name, so the row says who worked it out, exactly as the
 * door and the migration rows do.
 */
export const INFERRED_BY_THE_ROUTING = 'the routing'

/** What `inferred_by` should hold for a message whose stored `data` is this, or null. */
export function inferredByFor(data: Record<string, unknown>): string | null {
  // A GROUP NAMES ITS OWN MEMBERSHIP, so the writer named who it reached. This is asked first
  // because a message to a group carries no `to` and must never be read as one nobody addressed.
  const group = data['toGroup']
  if (typeof group === 'string' && group !== '') return null
  // A RUN THE WRITER CHOSE IS RESOLVED BY THE OFFICE, and this is asked before `to` on purpose. The
  // create door writes the resolved agent into `to` as well, so a chosen message carries both; the
  // agent id in `to` is the office's reading of the choice and not a name the writer typed.
  const chosen = data['chosenRecipient']
  if (chosen !== undefined && chosen !== null) return INFERRED_BY_THE_DOOR
  // THE WRITER NAMED THEM OUTRIGHT.
  const named = data['to']
  if (Array.isArray(named) && named.length > 0) return null
  // NOBODY NAMED ANYBODY: a line on the board was for the owner, and the backfill read it that way.
  return INFERRED_BY_THE_MIGRATION
}

/**
 * THE READING FOR ONE STORED MARK, WHICH IS WHAT A SCREEN DRAWS.
 *
 * A word no table knows comes back named out loud rather than passed through, which is the rule
 * `tests/the-machine-word-gate.test.ts` holds every reading function to: a reading function that
 * hands back what it was given lets a stored token reach a screen unread.
 */
export function deliveryWord(mark: unknown): DeliveryWord {
  if (isDeliveryMark(mark)) return DELIVERY[mark]
  return {
    word: `unknown delivery mark: ${String(mark)}`,
    sentence: `Nothing in Mole Office knows the delivery mark ${String(mark)}, so how far this message got cannot be said.`,
    shape: 'clock',
  }
}

/**
 * THE READING FOR ONE DELIVERY ROW, WHICH IS WHAT A SCREEN DRAWS BESIDE THE TICK OR THE CLOCK.
 *
 * The row's own sentence is the reading. The general one above is what is left when the row has
 * none. A read row also starts with the read sentence: its retained hand-over sentence alone would
 * hide the recipient's later act.
 *
 * WHY. Problem `HfBVX-es5qip`. The three marks are a ladder — written, delivered, they said
 * they read it — and since 4 September 2026 a line Mole Office wrote is marked `delivered` with no
 * run behind it, because leaving it queued would put a clock beside a message that is never going
 * anywhere. The old general reading of `delivered` said something serving the recipient had read
 * the message, and of those rows that was not true. The row's own sentence below is what
 * fixes that. The fourth word, `archived`, came later and is for another case only: an office notice
 * to a retired addressee, which the dead-letter sweep sets and which nobody reads.
 *
 * The row already carries the truth: *Mole Office wrote this line to say what happened in this group
 * … No run was started for it and nothing was spent.* So the row's sentence is what is drawn, and
 * the general one stays for rows that have none. Only a `seen` row adds its general sentence: the
 * recipient said it was read, while a delivered office notice still makes no such claim.
 *
 * THE SENTENCE IS BUILT HERE AND NOT ON THE SCREEN. It used to be built in the chat panel, which
 * wrote the general reading and then the row's sentence after it, so the panel said the thing that
 * was not true and then said what had really happened. A second screen drawing a mark would have
 * written that rule again, and the two would then be free to disagree.
 */
export function deliveryReading(row: { mark: unknown; because: string | null }): DeliveryWord {
  const reading = deliveryWord(row.mark)
  if (row.because === null || row.because.trim() === '') return reading
  // A LINE THE OFFICE MARKED READ does not start with the reader's act, and is not drawn green, which is the reader's own act.
  if (row.mark === 'seen' && isMarkedReadByTheOffice(row.because)) {
    return { ...reading, sentence: row.because, shape: DELIVERY.delivered.shape }
  }
  return { ...reading, sentence: row.mark === 'seen' ? `${reading.sentence} ${row.because}` : row.because }
}

const MARKED_READ_BY_THE_OFFICE = 'Mole Office marked this line read, and its reader did not, because '

/**
 * THE SENTENCE OF A LINE THE OFFICE MARKED READ, because the one matter it asks its reader to answer was answered by
 * another door (`markReadByTheOffice` in lib/messages.ts). `why` ends the sentence: who answered, and when.
 */
export function theOfficeMarkedItRead(why: string): string {
  return MARKED_READ_BY_THE_OFFICE + why
}

/** A row the office marked read, recognised from the same words the writer uses. */
export function isMarkedReadByTheOffice(because: string | null): because is string {
  return because !== null && because.startsWith(MARKED_READ_BY_THE_OFFICE)
}

// ============================================================================ addressing

/**
 * WHO A MESSAGE IS TO. A list of participants, each named by kind and id and by nothing else.
 *
 * Criterion M1: *A message references a participant by (kind, id) and nothing else.* A handle is a
 * name somebody may change; an id is not.
 */
export type Addressees = readonly ParticipantRef[]

/** How many recipients one message may carry. Several more than this is a group (M11). */
export const RECIPIENT_MAX = 20

/**
 * THE WHOLE BODY THAT WRITES A MESSAGE, for every line that tells somebody how to write one. A message is written at
 * POST /api/records with `kind` and `title` at the top, and who it is for and what it says inside `data`. `address`
 * is `{toGroup: <a group id>}` or `{to: [<an addressee>]}`, and `says` stands for the words. Lines that named the
 * fields without this shape led writers to put `toGroup` beside `kind`, where the record door refuses it, so each
 * line shows this body and none writes its own.
 */
export function theBodyThatWritesAMessage(address: { toGroup: string } | { to: ParticipantRef[] }, says: string): string {
  return JSON.stringify({ kind: 'message', title: '<a title>', data: { ...address, body: says } })
}

/**
 * WHY A `toGroup` THAT IS NOT A GROUP ID IS REFUSED, in the sentence the refusal carries.
 *
 * Criterion M11 gives a conversation several subscribers, and part 2e built it. Until then this
 * constant said groups were not built at all and every use of the field was refused; what is left of
 * that rule is the shape check, because the questions only the database can answer — does this group
 * exist, is anybody in it, is the sender a member — are asked in src/server/lib/groups.ts.
 */
export const A_GROUP_IS_NAMED_BY_ITS_ID =
  'Who a message is addressed to is one group, named by its id inside data, as in ' +
  theBodyThatWritesAMessage({ toGroup: 'aB3dEf7hIjKl' }, '<what you say>') +
  '. GET /api/groups lists every group in this project, with the id of each.'

/**
 * WHY A `since` THAT NAMES NO MOMENT IS REFUSED. It takes the office's own time, to the second, or an ISO time that
 * carries its own zone; anything else would be a guess about which moment the caller meant.
 */
export const SINCE_REFUSAL =
  'since must name a moment, as the office\u2019s own time 2026-11-14 22:20:35, or as an ISO time with its zone ' +
  '2026-11-14T22:20:35Z. Those are the two forms; a bare date and a time without a zone name no moment.'

/**
 * WHY A `since` WITH NO `group` IS REFUSED: the narrowing is of one group's messages, so without a group there is
 * nothing for it to narrow.
 */
export const SINCE_WITHOUT_GROUP_REFUSAL =
  'since narrows one group\u2019s messages, so send it with group: ?group=<the group id>&since=<the moment>. ' +
  'Without a group it narrows nothing.'

/**
 * WHY A MESSAGE ADDRESSED TO MOLE OFFICE ITSELF IS REFUSED.
 *
 * Mole Office is a participant so that the lines saying a group was opened, a member was added or two
 * claims are in conflict have a sender (M11). Nothing serves it: there is no run to start and nobody
 * to read what arrives, so a message to it would sit with a clock beside it for ever.
 */
export const NOTHING_ANSWERS_FOR_MOLE_OFFICE =
  'Mole Office itself cannot be written to. It writes the lines saying a group was opened, a member was added or ' +
  'two claims are in conflict, and nothing is running to read a reply. Write to the person or the agent you mean.'

/**
 * WHY A MESSAGE THAT NAMES NOBODY AND POINTS AT NOTHING IS REFUSED, in the sentence the refusal
 * carries.
 *
 * IT USED TO BE STORED AS ADDRESSED TO THE OWNER. That reading was right about what a line on the
 * message board has always been, and wrong about where to put it: it wrote an interpretation into
 * the canonical field with nothing saying it was one, so a reader could not tell a message
 * addressed to the owner on purpose from one addressed to the owner by that rule. USER.md's eighth
 * invariant is that what Mole Office made of somebody's words is shown BESIDE them, never instead
 * of them. Decision 4 of Mole Office note `naAgvqb86gFU` is corrected to this, and problem
 * `16ZZLBHM_VsT` is where the published schema and the door disagreed about it: the schema said
 * refused and the door stored it.
 *
 * THE PATH TO THE OWNER IS NOT LOST, ONLY THE GUESS. An agent writing a line for the person still
 * writes it; it names the person. The messages already in the corpus keep the migration's reading, and each
 * of their delivery rows now says which migration worked the recipient out.
 */
export const NOBODY_NAMED_AND_NOTHING_POINTED_AT =
  'This message names nobody and points at nothing, so it would reach nobody and be about nothing. Add `to` inside ' +
  'data, the person or agent it is for, as in ' +
  theBodyThatWritesAMessage({ to: [{ kind: 'person', id: 'owner' }] }, '<what you say>') +
  '. Or add `target` inside data, the place on a page it is a comment on. A line meant for the owner names the ' +
  'owner: nothing here works out who you meant, because a recipient nobody wrote down would be a guess stored as ' +
  'a fact. GET /api/participants lists every person and every durable agent, with the id of each.'

/**
 * A MESSAGE THAT SAYS WHAT IT QUOTES IN `target` OR IN `quotes`, NEVER IN BOTH.
 *
 * `quotesOf` below reads both fields as one list. Holding both would store one
 * answer in two places, and `target` would also make the message a comment on its place while the
 * list does not.
 */
export const A_MESSAGE_QUOTES_IN_TARGET_OR_IN_QUOTES =
  'This message has both `target` and `quotes`. Send one of them. Use `target` for a comment left on one place; ' +
  'the message then shows that place as its quote. Use `quotes` for a message that quotes several things. ' +
  'Nothing was written.'

/**
 * WHY A MESSAGE THAT QUOTES THINGS AND NAMES NOBODY IS REFUSED.
 *
 * `NOBODY_NAMED_AND_NOTHING_POINTED_AT` above would be false about it, because it does point at
 * things. It is still refused, because a message with `quotes` is not a comment left on those
 * places (see `quotesOf`), so without `to` nobody would ever be shown it.
 */
export const QUOTES_AND_NOBODY_NAMED =
  'This message quotes things and names nobody, so nobody would be shown it. A message with `quotes` is not a ' +
  'comment left on those places. Add `to` inside data, beside `quotes`, the person or agent it is for, as in ' +
  theBodyThatWritesAMessage({ to: [{ kind: 'person', id: 'owner' }] }, '<what you say>') +
  ', or `toGroup` in its place. GET /api/participants lists every person and every durable agent, with the id ' +
  'of each.'

/** Why one addressee is refused, or null when it is usable. */
export function whyAddresseeIsRefused(value: unknown): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return 'Each addressee is an object saying which kind of participant it is and which one, as {"kind": "agent", "id": "builder"}.'
  }
  const ref = value as { kind?: unknown; id?: unknown }
  if (!isParticipantKind(ref.kind)) {
    // THE VALUE IS NOT ECHOED BACK. The refusal a caller gets names the path — data.to[0].kind — so
    // they can see what they sent, and echoing an unrecognised word into a sentence is the shape the
    // machine-word gate exists to stop.
    return 'This addressee does not say which kind of participant it is. A message is addressed to a person or to an agent, as {"kind": "agent", "id": "builder"}.'
  }
  if (typeof ref.id !== 'string' || ref.id.trim() === '') {
    return 'An addressee needs the id of the person or agent it names. An empty id addresses nobody.'
  }
  return null
}

/** Why a whole addressee list is refused, or null when it is usable. */
export function whyAddresseesAreRefused(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return 'Who a message is to is a list, even when there is one recipient in it.'
  }
  if (value.length === 0) {
    return 'A message with nobody to send it to is not a message. Name at least one person or agent.'
  }
  if (value.length > RECIPIENT_MAX) {
    return `A message may name at most ${String(RECIPIENT_MAX)} recipients, and this one names ${String(value.length)}. Several more than that is a group: open one and address that.`
  }
  const seen = new Set<string>()
  for (const one of value) {
    const because = whyAddresseeIsRefused(one)
    if (because !== null) return because
    const ref = one as ParticipantRef
    const key = participantKey(ref)
    if (seen.has(key)) {
      return `${ref.id} is named twice among the recipients. One recipient has one delivery mark, so naming them twice would be two answers to one question.`
    }
    seen.add(key)
  }
  return null
}

// ============================================================================ a message that asks the person

/**
 * A MESSAGE THAT ASKS THE PERSON SOMETHING, AND WHICH OF THOSE WAIT FOR THE PERSON'S ANSWER.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIELD: `asksThePerson`
 * ---------------------------------------------------------------------------------------
 *
 * Answer 10 to wave 13k's proposal (report n9Mjk3c_sJRu): messages that ask the person
 * something get a short list of their own. Mole Office cannot tell from the words that a message
 * asks something. A question mark is not a question, and a question can be written without one. So
 * the writer says it, with `asksThePerson: true`, when it writes the message. Nothing guesses.
 *
 * The name says what it is about: a message that asks THE PERSON, not any recipient. A message to
 * an agent that asks that agent something needs no mark, because the agent's run answers it anyway.
 *
 * THREE ANSWERS, AND NULL IS ONE OF THEM. True means the writer said it asks. False means the writer
 * said it does not. Absent means nobody said, which is every message written before the field
 * existed. A reader never treats absent as false: an old message is not "asks nothing", it is
 * "nobody recorded whether it asks".
 *
 * WHAT IS REFUSED, each in the sentence below:
 *   - the field on a message whose `to` names no person, or that goes to a group;
 *   - setting, changing or taking the field off after the message is written (lib/records.ts,
 *     `patchRecord`), because the person has already been handed the message as it was.
 * A value that is not true or false is refused by the kind's own type check.
 *
 * ---------------------------------------------------------------------------------------
 * WAITING FOR YOUR ANSWER, WORKED OUT HERE AND NOWHERE ELSE
 * ---------------------------------------------------------------------------------------
 *
 * A message waits for your answer when all four hold:
 *   1. its writer set `asksThePerson` to true;
 *   2. you are a person, and it was addressed to you (it has a delivery row to you);
 *   3. it has a sender that is not you;
 *   4. you have written nothing to that sender since: no later message from you names that sender
 *      among its recipients. Every project counts, because a conversation is the same in each.
 *
 * WHY YOUR NEXT MESSAGE, AND NOT A MARK. Answering is writing back, and that act is already stored.
 * A separate "answered" mark would be a second fact that could disagree with the first: you could
 * write back and forget the mark, or mark it and never write back. Reading the message does not
 * answer it either, so the unread mark is not used.
 *
 * WHAT THIS RULE CANNOT TELL. Any message you write to that sender after the question counts as the
 * answer, even one about something else. An answer written in a group, or to somebody else, does
 * not count. Both limits are what the stored messages can support; nothing is inferred beyond them.
 *
 * `theQuestionsWaitingForTheAnswerOf` below is the one function. The server calls it for
 * GET /api/messages?only=waiting-for-my-answer, and every page that shows these messages reads that
 * door.
 */

/** Why the field is refused on a message that is not addressed to a person. */
export const ASKS_THE_PERSON_NEEDS_A_PERSON =
  '`asksThePerson` says whether this message asks the person something, so it goes only on a message whose `to` ' +
  'names a person, as [{"kind": "person", "id": "owner"}]. This message names no person. Leave the field out, ' +
  'or add the person to `to`. Nothing was written.'

/** Why the field is refused on a message to a group. */
export const ASKS_THE_PERSON_NOT_IN_A_GROUP =
  '`asksThePerson` goes only on a message addressed to a person by name in `to`, not on a message to a group. ' +
  'A question for the person is written to the person. Nothing was written.'

/** Why a later write may not set, change or take off the field. */
export const ASKS_THE_PERSON_IS_SET_WHEN_WRITTEN =
  '`asksThePerson` is set when a message is written, and it may not be set, changed or taken off afterwards, ' +
  'because the person has already been given the message as it was written. Write a new message instead. ' +
  'Nothing was written.'

/**
 * Why a later write may not set, change or take off who sent a message (problem KBKHHtTTnaMY). The create path makes the
 * sender whoever wrote it, and Mole Office only from the office's own code. A sender changed afterwards would put another
 * name on words already given, and would let a message pass for one of the office's own.
 */
export const WHO_SENT_A_MESSAGE_IS_SET_WHEN_WRITTEN =
  '`sentBy` is set when a message is written, to whoever wrote it, and it may not be set, changed or taken off ' +
  'afterwards, because who sent a message is who wrote it. Write a new message instead. Nothing was written.'

/**
 * Why a caller may not write `foldedInto`. Mole Office writes it when it folds its own old lines in a group under one
 * newer line of its own (scripts/fold-the-old-dead-letter-lines.ts). A caller who could write it could hide any line.
 */
export const ONLY_THE_OFFICE_FOLDS_A_LINE =
  '`foldedInto` is written by Mole Office when it folds its own old lines in a group under one newer line. A caller ' +
  'may not set, change or take it off, on a new message or an old one. Nothing was written.'

/** Why a record may not become a message that names a sender other than whoever changes its kind. */
export const A_RECORD_BECOMES_A_MESSAGE_FROM_ITS_WRITER =
  'A record that becomes a message may name no sender but whoever changes its kind, because who sent a message is ' +
  'who wrote it, and this one carries a `sentBy` that names somebody else (a kind that does not hold `sentBy` keeps ' +
  'it in `extra`). Take that `sentBy` out first, or write a new message instead. Nothing was written.'

/** What a stored message says about asking the person: true, false, or null because nobody said. */
export function asksThePersonOf(data: Record<string, unknown>): boolean | null {
  const held = data['asksThePerson']
  return typeof held === 'boolean' ? held : null
}

/**
 * Why the field is refused on this message, or null when it may stand. It is asked of the data that
 * will be stored, before anything is written. A message without the field is never refused here.
 */
export function whyAsksThePersonIsRefused(data: Record<string, unknown>): string | null {
  if (!Object.hasOwn(data, 'asksThePerson')) return null
  const group = data['toGroup']
  if (typeof group === 'string' && group !== '') return ASKS_THE_PERSON_NOT_IN_A_GROUP
  const to = data['to']
  const namesAPerson =
    Array.isArray(to) &&
    to.some((one: unknown) => typeof one === 'object' && one !== null && (one as { kind?: unknown }).kind === 'person')
  return namesAPerson ? null : ASKS_THE_PERSON_NEEDS_A_PERSON
}

/**
 * THE MESSAGES WAITING FOR THIS READER'S ANSWER, by id. The rule is in the section above.
 *
 * `oldestFirst` is every message the reader sent or was handed, in the order they were written. The
 * order decides what "since" means, so the caller passes them oldest first and in the order they were
 * stored when two share a second.
 */
export function theQuestionsWaitingForTheAnswerOf(
  reader: ParticipantRef,
  oldestFirst: readonly Pick<MessageOnTheWire, 'id' | 'sentBy' | 'deliveries' | 'asksThePerson'>[],
): Set<string> {
  const waiting = new Map<string, string[]>()
  if (reader.kind !== 'person') return new Set()
  for (const one of oldestFirst) {
    const sender = one.sentBy
    if (sender === null) continue
    if (sameParticipant(sender, reader)) {
      // THE READER WROTE BACK: every question from each recipient of this message is answered.
      for (const delivery of one.deliveries) waiting.delete(participantKey(delivery.to))
      continue
    }
    if (one.asksThePerson !== true) continue
    if (!one.deliveries.some((delivery) => sameParticipant(delivery.to, reader))) continue
    const key = participantKey(sender)
    waiting.set(key, [...(waiting.get(key) ?? []), one.id])
  }
  return new Set([...waiting.values()].flat())
}

/** One participant as one string, for a map key or a comparison. Never stored. */
export function participantKey(who: ParticipantRef): string {
  // JOINED RATHER THAN INTERPOLATED, so it is plain that this is a key and not a sentence. Nothing
  // draws it: it is a map key and a comparison, and the words a reader sees come from the tables
  // above.
  return [who.kind, who.id].join(':')
}

/** Read a key back. Returns null when the string is not one this file wrote. */
export function participantFromKey(key: string): ParticipantRef | null {
  const at = key.indexOf(':')
  if (at <= 0) return null
  const kind = key.slice(0, at)
  const id = key.slice(at + 1)
  if (!isParticipantKind(kind) || id === '') return null
  return { kind, id }
}

/** True when the two references name the same participant. */
export function sameParticipant(a: ParticipantRef, b: ParticipantRef): boolean {
  return a.kind === b.kind && a.id === b.id
}

/**
 * THE TWO PARTICIPANTS A CONVERSATION IS BETWEEN, IN ONE ORDER WHICHEVER WAY ROUND THEY ARE ASKED.
 *
 * A conversation between the owner and an agent is the same conversation read from either end, so
 * the key that names it cannot depend on who is asking.
 */
export function conversationKey(a: ParticipantRef, b: ParticipantRef): string {
  const two = [participantKey(a), participantKey(b)].sort()
  return two.join('|')
}

// ============================================================================ what a reader gets

/** One recipient and how far the message got with them. */
export interface DeliveryOnTheWire {
  to: ParticipantRef
  mark: DeliveryMark
  /** When this row's mark and sentence were last written, together, as a local wall-clock stamp. */
  at: string
  /**
   * WHERE IT STANDS, in one sentence, or null because nobody has written one.
   *
   * The mark says how far the message got; this says why it is there. A message still showing a
   * clock because the agent's tool is not installed and one still showing a clock because two runs
   * are already going are different facts, and criterion M6 says the reader is told which.
   */
  because: string | null
  /** The session record of the run that took this message, or null because none has. */
  run: string | null
}

// ============================================================================ the routed line

/**
 * WHY ONE RUNG IN THE CHAIN OF STARTERS COULD NOT BE REACHED. A decision says it is read off the registry for a retired
 * agent, and off the chat's own answering mark for one nothing is answering as. The words are
 * the two halves of that decision, and they live here once so every surface reads the same sentence.
 */
export type RoutedWas = 'retired' | 'nothing answering'

/** One rung the walk passed over, and the reading's own full sentence for it. */
export interface RoutedPassedOver {
  who: ParticipantRef
  because: string
}

/**
 * THE OWNER ENDINGS, with the owner's name and what the walk stopped at. Every field is a registry
 * NAME taken at send time, which is what a person reads; the walk keeps the ids beside it.
 *
 * THE CLAUSE WITHOUT ITS TAIL IS THE REASON THE WALK STOPPED. `theOwnerClause` below gives it, so the
 * owner-reached sentence and the owner-is-the-sender sentence share one wording and cannot drift.
 */
export type TheOwnerEnding =
  | { how: 'no secretary'; owner: string }
  | { how: 'nobody reachable'; owner: string }
  | { how: 'nobody started'; owner: string; stoppedAt: string }
  | { how: 'a name no single agent answers'; owner: string }
  | { how: 'a loop'; owner: string }
  | { how: 'the addressee holds the secretary card'; owner: string }

/**
 * THE ENDING THE WALK CAME TO, with the names the last sentence reads.
 *
 * `the sender` is the brief's no-copy sentence for a rung that was reached. `the owner is the sender`
 * is the same fact when the walk ended at the owner and the person who would receive the copy is the
 * one who sent it: the tail says so instead of claiming the sender was up the chain.
 */
export const NO_REACHABLE_OWNER_ENDING = 'no owner can receive' as const
export const PERSON_OWNER_ROUTING_ENDING = 'the owner is a person' as const
export const OWNERLESS_ROUTING_ENDING = 'an ownerless addressee' as const
export const BROKEN_OWNERS_ROUTING_ENDING = 'an interrupted ownership chain' as const

export type TheRoutedEnding =
  | { how: typeof NO_REACHABLE_OWNER_ENDING }
  | { how: typeof PERSON_OWNER_ROUTING_ENDING }
  | { how: typeof OWNERLESS_ROUTING_ENDING }
  | { how: typeof BROKEN_OWNERS_ROUTING_ENDING; stoppedAt: string }
  | { how: 'an owner'; reached: string }
  | { how: 'an owner whose reach is uncertain'; reached: string }
  | { how: 'an owner waiting'; reached: string }
  | { how: 'the owner sent it' }
  | { how: 'a starter'; reached: string }
  // A RUNG THE OFFICE COULD NOT TELL ABOUT ENDS THE WALK AND GETS THE COPY (problem `TOoUy7fMbg1P`).
  // The walk passes a rung only when it is known to be unreachable, the same rule as for the
  // addressee, so the copy goes no further up on "could not tell" alone.
  | { how: 'a starter it could not tell about'; reached: string }
  | { how: 'the sender' }
  | TheOwnerEnding
  | { how: 'the owner is the sender'; ending: TheOwnerEnding }
  // THE DEAD-LETTER SWEEP'S TWO ENDINGS (problem 0WUuvB0IhRfb). Only the sweep writes them, never a send.
  // The first is an agent's letter whose walk ended at the owner: the secretary the person named to take
  // the dead letters receives it instead, and `ending` keeps why the walk stopped. The second is a letter
  // from the person: it is given to that secretary with no walk.
  | { how: 'the dead-letter secretary instead of the owner'; reached: string; ending: TheOwnerEnding }
  | { how: 'the dead-letter secretary'; reached: string }

/**
 * ONE ADDRESSEE THAT COULD NOT BE REACHED, as the message record keeps it. Written by the office and
 * never by a caller. `for` names the addressee the entry is about, `because` keeps the reading's own
 * sentence, `to` is the one participant the copy went to (null when that is the sender, who needs no
 * copy), and `line` is the finished line every surface prints.
 */
export interface RoutedAddressee {
  for: ParticipantRef
  because: string
  to: ParticipantRef | null
  passedOver: readonly RoutedPassedOver[]
  line: string
  /**
   * WHAT THE LINE WAS BUILT FROM, so a page can say it in its own language. Problem t_ox8XMOvu7a.
   *
   * `line` is the English an agent reads, and it stays as it was stored. A page draws
   * `theRoutedLineToDraw`, which builds the line again from this in the page language. Absent on a
   * message routed before 30 September 2026, whose page draws the stored English `line`.
   */
  said?: TheRoutedLineSaid
  /**
   * THE ONE MESSAGE THAT TOLD `to` ABOUT THIS LETTER, by its id, or absent because `to` was given the letter
   * itself. Problem wN3CEhHxRKO3. Only the dead-letter sweep writes it. The sweep routes many old letters at
   * once, so it gives each receiver ONE message that lists them, and makes no delivery row for `to` on the
   * letter. `routedCopiesOf` leaves such an entry out for that reason.
   */
  inSummary?: string
}

/** The facts `theRoutedLine` builds one line from: registry names taken at send time, and the readings. */
export interface TheRoutedLineSaid {
  addressee: string
  was: RoutedWas
  passedOver: readonly { name: string; was: RoutedWas }[]
  ending: TheRoutedEnding
  /**
   * WHEN THE DEAD-LETTER SWEEP ROUTED THE LETTER, as a local wall-clock stamp, or absent because it was
   * routed when it was sent. Problem 0WUuvB0IhRfb. The first sentence then says when Mole Office looked,
   * not "when this was sent", which would be false. The sweep also reads it to leave a letter it has
   * already handled alone.
   */
  sweptAt?: string
}

/** Each reading's clause. Read through `readStoredWord`, so under Node it is English and on a page it is the page's language. */
function routedClause(was: RoutedWas): string {
  return was === 'retired'
    ? readStoredWord('chatEnglish.routed.was.retired')
    : readStoredWord('chatEnglish.routed.was.nothingAnswering')
}

/**
 * WHY THE WALK ENDED AT THE OWNER, up to but not including the comma that says what happened next.
 *
 * ONE PLACE, so the sentence for the owner receiving the copy and the sentence for the owner being
 * the sender cannot say two different things about one walk.
 */
/**
 * ONE WORD OF THE ROUTED LINE WITH ITS NAMES IN IT, each name spaced from the Chinese around it by the one
 * spacing rule (`wordWithSpacedValues`, src/shared/spacing.ts): "发送时联系不上 Kiln", never "联系不上Kiln". The
 * English is unchanged, because the rule only moves a join where a value meets a Chinese character.
 */
function routedWord(key: WordKey, values: Record<string, string>): string {
  return wordWithSpacedValues((k: WordKey, v: Record<string, string>) => readStoredWord(k, v), key, values)
}

function theOwnerClause(addressee: string, ending: TheOwnerEnding): string {
  const named = { addressee: content(addressee) }
  switch (ending.how) {
    case 'no secretary':
      return routedWord('chatEnglish.routed.owner.noSecretary', named)
    case 'nobody reachable':
      return routedWord('chatEnglish.routed.owner.nobodyReachable', named)
    case 'nobody started':
      return routedWord('chatEnglish.routed.owner.nobodyStarted', { stoppedAt: content(ending.stoppedAt) })
    case 'a name no single agent answers':
      return routedWord('chatEnglish.routed.owner.aNameNoSingleAgentAnswers', named)
    case 'a loop':
      return routedWord('chatEnglish.routed.owner.aLoop', named)
    case 'the addressee holds the secretary card':
      return routedWord('chatEnglish.routed.owner.holdsTheSecretaryCard', named)
  }
}

/**
 * THE ONE FUNCTION THAT BUILDS A ROUTED LINE, word for word, from the decisions above.
 *
 * Every surface prints `line` and never builds it again. The first sentence names the addressee and
 * the reading; then one sentence for each rung the walk passed over, in the order it met them; then
 * the sentence saying where the message went instead. The clause for a rung comes from the reading's
 * `was` and never from its full sentence, so the same reading always reads the same short way.
 */
export function theRoutedLine(what: TheRoutedLineSaid, inASummary = false): string {
  const addressee = content(what.addressee)
  const first =
    what.sweptAt === undefined
      ? routedWord('chatEnglish.routed.first', { addressee, why: routedClause(what.was) })
      : routedWord('deadLetterRouting.firstSwept', { addressee, why: routedClause(what.was), at: content(what.sweptAt) })
  const passed = what.passedOver.map((one) =>
    routedWord('chatEnglish.routed.passedOver', { name: content(one.name), why: routedClause(one.was) }),
  )
  const last = ((): string => {
    const ending = what.ending
    // A LETTER THE SWEEP ROUTED IN A SUMMARY (problem wN3CEhHxRKO3) was not given to its receiver one by one, so
    // the three endings the sweep summarises say that the receiver was told in one message instead.
    if (inASummary) {
      switch (ending.how) {
        case 'an owner':
          return routedWord('deadLetterRouting.summary.ownerReached', { reached: content(ending.reached), addressee })
        case 'an owner whose reach is uncertain':
          return routedWord('deadLetterRouting.summary.ownerUncertain', { reached: content(ending.reached), addressee })
        case 'an owner waiting':
          return routedWord('deadLetterRouting.summary.ownerWaiting', { reached: content(ending.reached), addressee })
        case 'a starter':
          return routedWord('deadLetterRouting.summary.aStarter', { reached: content(ending.reached), addressee })
        case 'a starter it could not tell about':
          return routedWord('deadLetterRouting.summary.couldNotTell', { reached: content(ending.reached), addressee })
        case 'the dead-letter secretary instead of the owner':
          return routedWord('deadLetterRouting.summary.secretaryInsteadOfTheOwner', {
            because: theOwnerClause(what.addressee, ending.ending),
            reached: content(ending.reached),
            owner: content(ending.ending.owner),
          })
        default:
          break
      }
    }
    switch (ending.how) {
      case NO_REACHABLE_OWNER_ENDING:
        return routedWord('chatEnglish.routed.ending.ownerUnavailable', { addressee })
      case PERSON_OWNER_ROUTING_ENDING:
        return routedWord('chatEnglish.routed.ending.personOwner', { addressee })
      case OWNERLESS_ROUTING_ENDING:
        return routedWord('chatEnglish.routed.ending.ownerless', { addressee })
      case BROKEN_OWNERS_ROUTING_ENDING:
        return routedWord('chatEnglish.routed.ending.ownerBroken', { addressee, stoppedAt: content(ending.stoppedAt) })
      case 'an owner':
        return routedWord('chatEnglish.routed.ending.ownerReached', { reached: content(ending.reached), addressee })
      case 'an owner whose reach is uncertain':
        return routedWord('chatEnglish.routed.ending.ownerUncertain', { reached: content(ending.reached), addressee })
      case 'an owner waiting':
        return routedWord('chatEnglish.routed.ending.ownerWaiting', { reached: content(ending.reached), addressee })
      case 'the owner sent it':
        return readStoredWord('chatEnglish.routed.ending.ownerSender')
      case 'a starter':
        return routedWord('chatEnglish.routed.ending.aStarter', { reached: content(ending.reached), addressee })
      case 'a starter it could not tell about':
        return routedWord('chatEnglish.routed.ending.couldNotTell', { reached: content(ending.reached), addressee })
      case 'the sender':
        return readStoredWord('chatEnglish.routed.ending.theSender')
      case 'the owner is the sender':
        return routedWord('chatEnglish.routed.ending.ownerIsTheSender', { because: theOwnerClause(what.addressee, ending.ending) })
      case 'the dead-letter secretary instead of the owner':
        return routedWord('deadLetterRouting.ending.secretaryInsteadOfTheOwner', {
          because: theOwnerClause(what.addressee, ending.ending),
          reached: content(ending.reached),
          owner: content(ending.ending.owner),
        })
      case 'the dead-letter secretary':
        return routedWord('deadLetterRouting.ending.secretary', { reached: content(ending.reached) })
      default:
        return routedWord('chatEnglish.routed.ending.theOwner', {
          because: theOwnerClause(what.addressee, ending),
          owner: content(ending.owner),
        })
    }
  })()
  // English runs sentences on with a space. A Chinese sentence ends in its own full stop and takes
  // none, so the joiner is a word as well.
  return [first, ...passed, last].join(readStoredWord('chatEnglish.routed.between'))
}

/**
 * THE ROUTED LINE A PAGE DRAWS, in the page language where it can be. Problem t_ox8XMOvu7a.
 *
 * Built again from `said` by the one builder above, so the page and the stored line say one thing in
 * two languages. A message routed before `said` was stored has only its English `line`, and that is
 * what is drawn for it: the office does not guess the facts back out of a sentence.
 */
export function theRoutedLineToDraw(entry: RoutedAddressee): string {
  return entry.said === undefined ? entry.line : theRoutedLine(entry.said, entry.inSummary !== undefined)
}

/**
 * THE ROUTED LINE AS THE CHAT DRAWS IT UNDER ONE MESSAGE: `theRoutedLineToDraw`, and after it what the
 * sender can do, when `whatTheSenderCanDo` has a sentence for it. `routed` is every entry on the message.
 */
export function theRoutedLineInTheChat(entry: RoutedAddressee, routed: readonly RoutedAddressee[]): string {
  const line = theRoutedLineToDraw(entry)
  const canDo = whatTheSenderCanDo(entry, routed)
  return canDo === null ? line : [line, canDo].join(readStoredWord('chatEnglish.routed.between'))
}

/**
 * WHAT THE PERSON CAN DO ABOUT THEIR OWN LETTER THAT NOBODY ELSE WAS GIVEN, or null. Row 49 of report
 * rFBoQG6mAEI0: the line said why no copy was made and stopped there.
 *
 * Only for the owner-is-the-sender ending, which only the person sending reads (`RoutedLine` draws a
 * `to: null` entry for the sender alone). A retired addressee's letter waits for the secretary the person
 * names to take the dead letters, because rule (c) of the sweep gives it to that secretary
 * (`whatTheSweepDoesWithALetter`); a letter to an agent that is not answering stays with it.
 *
 * NULL ONCE A LATER ENTRY FOR THE SAME ADDRESSEE GAVE THE LETTER TO SOMEBODY, which is the sweep's entry
 * after a secretary was named. Telling the person to name one would then be false. It is drawn on the
 * page and never stored, so the stored `line` stays what was true when the letter was sent.
 */
export function whatTheSenderCanDo(entry: RoutedAddressee, routed: readonly RoutedAddressee[]): string | null {
  const said = entry.said
  if (entry.to !== null || said === undefined || said.ending.how !== 'the owner is the sender') return null
  const givenSince = routed.some((one) => one.to !== null && one.for.kind === entry.for.kind && one.for.id === entry.for.id)
  if (givenSince) return null
  return said.was === 'retired'
    ? routedWord('chatEnglish.routed.youCan.nameASecretary', { where: readStoredWord('settingsPanel.title.deadletters') })
    : routedWord('chatEnglish.routed.youCan.wait', { addressee: content(said.addressee) })
}

/**
 * THE ENDINGS THE DEAD-LETTER SWEEP MAY PUT IN A SUMMARY: the ones whose line says who received the letter up
 * the chain. Problem wN3CEhHxRKO3. `theRoutedLine` has a summary sentence for each of them and for no other.
 */
export function anEndingASummaryMayTell(ending: TheRoutedEnding): boolean {
  return ending.how === 'an owner' || ending.how === 'an owner whose reach is uncertain' || ending.how === 'an owner waiting' || ending.how === 'a starter' || ending.how === 'a starter it could not tell about' || ending.how === 'the dead-letter secretary instead of the owner'
}

/**
 * ONE ADDRESSEE THE OFFICE COULD NOT TELL ABOUT, as the reply to the sender carries it (problem
 * `TOoUy7fMbg1P`). A process of the addressee's session is alive and its transcript could not be
 * read, so Mole Office cannot tell whether it is answering. The message is not routed for it: no
 * copy goes up its chain of starters, and nothing is stored in `data.routed`. `because` is the
 * reading's own sentence; `line` is the plain sentence for the sender, built by `theCouldNotTellLine`.
 */
export interface NotRoutedAddressee {
  for: ParticipantRef
  because: string
  line: string
}

/**
 * THE SENTENCE A SENDER READS WHEN THE OFFICE COULD NOT TELL WHETHER THE ADDRESSEE IS ANSWERING.
 *
 * It is true on every path that reaches it: the addressee keeps the letter, and no routed entry and
 * no extra delivery row is written for it, whether its chain would have led to a starter, the
 * secretary or the owner.
 */
export function theCouldNotTellLine(addressee: string): string {
  return `Mole Office could not tell whether ${addressee} is answering, so it did not also give this message to anybody else.`
}

/**
 * THE SHORT REASON A SEND TO A RETIRED AGENT GIVES: one sentence naming the retired addressees.
 *
 * "Pike is retired." for one, "Pike and Fern are retired." for two, and "Pike, Fern and Cedar are
 * retired." for three or more. The names are the ones `theRoutedLine` used, so the short reason and the finished
 * line name the same agent the same way, by criterion M113a.
 *
 * AN EMPTY LIST GIVES AN EMPTY SENTENCE, because there is no retired addressee to name. The one
 * caller sets the reason only when the send's own routing said a retired addressee was found, so
 * this is a guard rather than a path a reader reaches.
 */
export function theRetiredAddresseesReason(names: readonly string[]): string {
  if (names.length === 0) return ''
  const named =
    names.length === 1
      ? names[0]!
      : names.length === 2
        ? `${names[0]!} and ${names[1]!}`
        : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]!}`
  return `${named} ${names.length === 1 ? 'is' : 'are'} retired.`
}

/**
 * THE REASON AN AGENT WAS RETIRED, READY TO END A SENTENCE: trimmed, and ending with one mark that
 * ends a sentence.
 *
 * The retire door stores the reason the person typed, with or without a final stop. Four sentences
 * put it after "retired: ", and three of them go on with a sentence of their own. Each used to join
 * it its own way, so one path read "done Nothing new…" and another read "done..". This is the one
 * place that joins it now (problem `sKI5Xh2kZn31`). A reason that already ends in ".", "!",
 * "?", "。", "！" or "？" is given back as typed, trimmed; any other reason gets "." added.
 *
 * A REASON THAT TRIMS TO NOTHING GIVES null, because it is not a reason. Each caller then writes its
 * sentence as it does when no reason was recorded at all.
 */
export function theReasonAsOneSentence(typed: string): string | null {
  const trimmed = typed.trim()
  if (trimmed === '') return null
  return /[.!?。！？]$/u.test(trimmed) ? trimmed : `${trimmed}.`
}

/** The routed entries off a stored message's `data`, in the order the office wrote them. */
export function routedOf(data: Record<string, unknown>): readonly RoutedAddressee[] {
  const held = data['routed']
  if (!Array.isArray(held)) return []
  const out: RoutedAddressee[] = []
  for (const one of held) {
    if (typeof one !== 'object' || one === null || Array.isArray(one)) continue
    const entry = one as Record<string, unknown>
    const forThis = oneParticipantRef(entry['for'])
    // THE ENTRY IS KEPT ONLY WHEN IT CAN BE READ WHOLE. A row edited by hand rather than written by
    // the routing is dropped rather than half-drawn: a line naming no addressee or a copy naming a
    // participant nobody can look up is worse than no line, because a reader would act on it.
    if (forThis === null) continue
    if (typeof entry['because'] !== 'string' || typeof entry['line'] !== 'string') continue
    const to = entry['to'] === null ? null : oneParticipantRef(entry['to'])
    if (entry['to'] !== null && to === null) continue
    const passedOver: RoutedPassedOver[] = []
    let sound = true
    if (Array.isArray(entry['passedOver'])) {
      for (const rung of entry['passedOver']) {
        const who = typeof rung === 'object' && rung !== null && !Array.isArray(rung) ? oneParticipantRef((rung as Record<string, unknown>)['who']) : null
        const because = typeof rung === 'object' && rung !== null && !Array.isArray(rung) ? (rung as Record<string, unknown>)['because'] : undefined
        if (who === null || typeof because !== 'string') {
          sound = false
          break
        }
        passedOver.push({ who, because })
      }
    } else {
      sound = false
    }
    if (!sound) continue
    const said = oneRoutedSaid(entry['said'])
    // A SUMMARY'S ID IS A NON-EMPTY STRING. Any other value there is not read whole, so the entry is dropped.
    const inSummary = entry['inSummary']
    if (inSummary !== undefined && (typeof inSummary !== 'string' || inSummary === '')) continue
    out.push({
      for: forThis,
      because: entry['because'],
      to,
      passedOver,
      line: entry['line'],
      ...(said === null ? {} : { said }),
      ...(typeof inSummary === 'string' ? { inSummary } : {}),
    })
  }
  return out
}

/**
 * EVERY PARTICIPANT THE ROUTING GAVE A COPY OF THIS MESSAGE TO, in the order it chose them: each routed `to`,
 * except an entry the sweep told about in a summary (problem wN3CEhHxRKO3), whose receiver got one message for
 * many letters and no copy of this one. The write door and the messages migration both read the copies here.
 */
export function routedCopiesOf(data: Record<string, unknown>): ParticipantRef[] {
  return routedOf(data)
    .filter((one) => one.inSummary === undefined)
    .map((one) => one.to)
    .filter((one): one is ParticipantRef => one !== null)
}

const ROUTED_WAS: readonly RoutedWas[] = ['retired', 'nothing answering']
const OWNER_ENDINGS: readonly TheOwnerEnding['how'][] = [
  'no secretary',
  'nobody reachable',
  'nobody started',
  'a name no single agent answers',
  'a loop',
  'the addressee holds the secretary card',
]

/**
 * One stored `said`, or null because it cannot be read whole. The entry is still drawn then, from its
 * English `line`, which is true on its own; only the page-language form is lost.
 */
function oneRoutedSaid(value: unknown): TheRoutedLineSaid | null {
  const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
  const isText = (v: unknown): v is string => typeof v === 'string' && v !== ''
  const isWas = (v: unknown): v is RoutedWas => ROUTED_WAS.includes(v as RoutedWas)
  const ownerEnding = (v: unknown): TheOwnerEnding | null => {
    if (!isObject(v) || !OWNER_ENDINGS.includes(v['how'] as TheOwnerEnding['how']) || !isText(v['owner'])) return null
    if (v['how'] === 'nobody started') return isText(v['stoppedAt']) ? { how: 'nobody started', owner: v['owner'], stoppedAt: v['stoppedAt'] } : null
    return { how: v['how'] as Exclude<TheOwnerEnding['how'], 'nobody started'>, owner: v['owner'] }
  }
  if (!isObject(value) || !isText(value['addressee']) || !isWas(value['was']) || !Array.isArray(value['passedOver'])) return null
  const passedOver: { name: string; was: RoutedWas }[] = []
  for (const rung of value['passedOver']) {
    if (!isObject(rung) || !isText(rung['name']) || !isWas(rung['was'])) return null
    passedOver.push({ name: rung['name'], was: rung['was'] })
  }
  const held = value['ending']
  if (!isObject(held)) return null
  let ending: TheRoutedEnding | null
  switch (held['how']) {
    case NO_REACHABLE_OWNER_ENDING:
      ending = { how: NO_REACHABLE_OWNER_ENDING }
      break
    case PERSON_OWNER_ROUTING_ENDING:
      ending = { how: PERSON_OWNER_ROUTING_ENDING }
      break
    case OWNERLESS_ROUTING_ENDING:
      ending = { how: OWNERLESS_ROUTING_ENDING }
      break
    case BROKEN_OWNERS_ROUTING_ENDING:
      ending = isText(held['stoppedAt']) ? { how: BROKEN_OWNERS_ROUTING_ENDING, stoppedAt: held['stoppedAt'] } : null
      break
    case 'an owner':
    case 'an owner whose reach is uncertain':
    case 'an owner waiting':
    case 'a starter':
    case 'a starter it could not tell about':
      ending = isText(held['reached']) ? { how: held['how'], reached: held['reached'] } : null
      break
    case 'the owner sent it':
      ending = { how: 'the owner sent it' }
      break
    case 'the sender':
      ending = { how: 'the sender' }
      break
    case 'the owner is the sender': {
      const inner = ownerEnding(held['ending'])
      ending = inner === null ? null : { how: 'the owner is the sender', ending: inner }
      break
    }
    case 'the dead-letter secretary instead of the owner': {
      const inner = ownerEnding(held['ending'])
      ending = inner === null || !isText(held['reached']) ? null : { how: held['how'], reached: held['reached'], ending: inner }
      break
    }
    case 'the dead-letter secretary':
      ending = isText(held['reached']) ? { how: held['how'], reached: held['reached'] } : null
      break
    default:
      ending = ownerEnding(held)
  }
  if (ending === null) return null
  // A SWEPT ENTRY CARRIES WHEN IT WAS SWEPT. A value that is there and is not a stamp is not read whole.
  if (value['sweptAt'] !== undefined && !isText(value['sweptAt'])) return null
  return {
    addressee: value['addressee'],
    was: value['was'],
    passedOver,
    ending,
    ...(isText(value['sweptAt']) ? { sweptAt: value['sweptAt'] } : {}),
  }
}

/** One stored value as a participant reference, or null because it is not one. */
export function oneParticipantRef(value: unknown): ParticipantRef | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const said = value as Record<string, unknown>
  if (!isParticipantKind(said['kind'])) return null
  if (typeof said['id'] !== 'string' || said['id'] === '') return null
  return { kind: said['kind'], id: said['id'] }
}

/**
 * EVERY PARTICIPANT REFERENCE IN A STORED `to` LIST, in the order it was written.
 *
 * An entry that is not a reference is left out and nothing is guessed. It is here, in a file that
 * opens no database, so that the write door (src/server/lib/messages.ts) and the messages migration
 * (src/server/db/message-delivery-migration.ts) read one stored `to` the same way.
 */
export function refsOfRecipients(value: unknown): ParticipantRef[] {
  if (!Array.isArray(value)) return []
  const out: ParticipantRef[] = []
  for (const one of value) {
    const ref = oneParticipantRef(one)
    if (ref !== null) out.push(ref)
  }
  return out
}

/** One message, as every screen and every caller reads it. */
export interface MessageOnTheWire {
  id: string
  workspaceId: string
  /** Who sent it, in the registries. Null on a row written before this field existed and never backfilled. */
  sentBy: ParticipantRef | null
  /** The line whoever wrote it typed, kept exactly. Null when they typed none. */
  from: string | null
  /** Who it is addressed to, worked out from the delivery rows, which are the only copy. */
  to: readonly ParticipantRef[]
  /**
   * THE GROUP IT WAS ADDRESSED TO, or null because it was addressed to participants by name.
   *
   * `to` above still says who it reached — the members at the moment it was sent — and this says how
   * they were named. A reader needs both: a message to a group belongs in that group's conversation
   * and in no private one, and nothing else on this shape could tell the two apart.
   */
  toGroup: string | null
  /**
   * THE MEMBERS MOLE OFFICE DELIVERED A GROUP LINE TO, when it narrowed them, or absent because it did
   * not (problem 0WUuvB0IhRfb). The dead-letter sweep's line is delivered only to the secretary named to
   * take the dead letters, or to nobody, and every member still reads it in the group. A page reads
   * this to say so, rather than saying the line reached everybody in the group.
   */
  deliveredOnlyTo?: readonly ParticipantRef[]
  /**
   * WHAT A DEAD-LETTER SWEEP DID, as facts, on the sweep's own line, or null because this is not such a
   * line or it was written before the facts were stored. `theSweepFactsOf` in shared/dead-letter-lines.ts
   * reads it, and a page says the line's sentence from it in the page's language.
   */
  deadLetterSweepSaid?: TheDeadLetterSweepSaid | null
  /**
   * WHICH LETTERS FOR RETIRED AGENTS ONE SWEEP ROUTED TO ONE RECEIVER, as facts, on the one message that told
   * the receiver, or null because this is not such a message. Problem wN3CEhHxRKO3. `theSummaryFactsOf` in
   * shared/dead-letter-lines.ts reads it, and a page says the message in the page's language.
   */
  deadLetterSummarySaid?: TheDeadLetterSummarySaid | null
  /** What is being said. */
  body: string
  /** The record's own title, which the board draws. */
  title: string
  /**
   * WHEN IT WAS SENT: the record's `created_at`, not a second stored field.
   */
  sentAt: string
  /**
   * THE RUNG THE WRITER HELD WHEN THIS WAS READ, or null because no role narrows the writer.
   *
   * Criterion P6, answer 1: in principle a high-rank agent writes to the person, but there is no hard
   * constraint, and any registered agent may. There is no gate; this is the mark that
   * lets the person see at a glance which rung wrote.
   *
   * IT IS READ, NOT STORED. The role is read off the registry when the message is read, so a message
   * from an agent whose rung changed says what that agent is now rather than what it was. A stored
   * copy would be the same fact in two places, and the older one would be the one on the screen.
   *
   * Null for a person, for a writer no registry holds, and for a message written before this.
   */
  sentByRole: string | null
  /**
   * THE STARTER THIS MESSAGE WENT ROUND, or null because it went round nobody.
   *
   * Criterion P7, point (c): a report goes to the starter by default. A
   * started agent that writes to the person directly is ACCEPTED and MARKED: nothing is refused and
   * nothing is hidden, and this says which starter's chain it came out of.
   *
   * It is set only when the writer has a starter recorded, the message is addressed to a person, and
   * that starter is not also addressed. A message to the starter as well went round nobody.
   */
  wentRoundItsStarter: ParticipantRef | null
  /** What on a page it is about, when it is a comment. Null when it is not. */
  target: unknown
  /**
   * WHAT IT QUOTES, in order, or an empty list. Worked out by `quotesOf` and by nothing else, so a
   * page draws the quotes from this and never reads `target` for them.
   */
  quotes: readonly Context[]
  /** Positions in the body, or null when quotes precede the words. */
  quotePositions: readonly number[] | null
  /** Where it offers to take the reader, when it carries an offer. Null when it does not. */
  lead: unknown
  /**
   * TRUE WHEN THIS IS A COMMENT AND NOBODY HAS BEEN HANDED ITS WORDS YET.
   *
   * ---------------------------------------------------------------------------------------
   * IT IS A COMMENT'S QUESTION, AND IT IS NOT THE DELIVERY MARK
   * ---------------------------------------------------------------------------------------
   *
   * Writing a message is sending it, so this is false on every message that is not a comment. A
   * comment is different: a person writes several during a review and sends them together
   * afterwards, so between those two acts the comment exists and has gone to nobody. Every comment
   * left during a review is shown, and each one shows that it is not sent yet. Criterion M28.
   *
   * IT IS NOT `queued`. A message's delivery mark says how far it got with one recipient after it
   * was sent; this says whether it was sent at all. The two look alike on a comment nobody has sent
   * and come apart the moment one is: a sent comment can sit at `queued` for as long as it takes a
   * run to start.
   *
   * ONE READER ANSWERS IT, and it is the one the review column already uses: a message carrying the
   * comment's words that is past `queued`, or the marker written for a comment whose words went out
   * before Mole Office recorded which conversation carried them. Working it out a second way here
   * is what the retired `annotation.data.state` field was, and it drifted.
   */
  notSentYet: boolean
  /**
   * THE WHOLE SENTENCE BEHIND A LINE MOLE OFFICE WROTE, or null because there is nothing more to say.
   *
   * Criterion M34. The `body` of such a line is a few words — "Agent run ended" — and this is the
   * sentence naming the run, the minutes or the reason, drawn as the block's hover text. Null on
   * every message a person or an agent wrote: it is not a place for a longer version of what
   * somebody said.
   */
  saidInFull: string | null
  /**
   * WHICH OF MOLE OFFICE'S OWN LINES THIS IS, by the name it has in `SYSTEM_LINES`, or null on a
   * message a person or an agent wrote.
   *
   * IT IS A STRING AND NOT `SystemLineKind`, because a stored row can hold a kind that has since
   * left the table: the old `theOfficeReadThePersonsWordsAsAnItem` lines are still stored, and a
   * reader that trusted the table would refuse to name them. A page reads it to tell the five lines
   * that wrap on a phone (`THE_CHECKLIST_LINES` in shared/groups.ts) from every other line.
   */
  notice: string | null
  /**
   * WHICH RUN THESE WORDS CAME OUT OF AND WHICH TOOL RAN IT, or null because nothing here knows.
   *
   * A message carries which tool its agent's run used, drawn as a small claude, codex or opencode
   * tag beside the conversation.
   *
   * NULL IS THE ANSWER IN TWO DIFFERENT-LOOKING CASES AND IT IS RIGHT IN BOTH. A message a person
   * wrote came out of no run. A message from a run whose session record never said which tool it
   * was cannot be marked either, because the only honest mark names a tool somebody recorded. A
   * screen draws nothing here rather than a guess.
   *
   * IT IS ON THE MESSAGE SO THE PANEL NEEDS NO SECOND REQUEST. `fromRun` is the session record id
   * the worker files on a reply; the runtime is read from that record, once for a whole page of
   * messages, in `whatTheProjectSays` in src/server/lib/messages.ts.
   */
  ranBy: { run: string; runtime: AgentRuntime; model: string | null } | null
  /**
   * WHERE THIS MESSAGE WAS WRITTEN FROM, or null because nobody recorded it. Criterion M63.
   *
   * Criterion M63, which holds the person's question: can Mole Office tell which machine and which browser a
   * message was written from?
   *
   * NULL MEANS NOBODY RECORDED IT, NOT THAT IT CAME FROM NOWHERE. Every message written before
   * 6 September 2026 carries none, and a screen draws nothing rather than a guess — the same rule
   * `ranBy` above answers to.
   *
   * `how` SAYS WHETHER `machine` IS A NAME OR AN ADDRESS, so a screen can print the address as an
   * address rather than as a machine somebody called `192.0.2.10`.
   */
  writtenFrom: { machine: string | null; how: string; program: string | null } | null
  /**
   * WHERE IT WAS WRITTEN: the project and the page, as the request named them. Every message is kept in the message
   * centre and belongs to no project, and this is the mark of where it was said. A key is
   * present only
   * when it was named. Null only on a message nobody marked, which the move into the message centre leaves none of.
   */
  writtenIn?: { project?: string; page?: string } | null
  /** The project its writer said it is about, or null because the writer said none. */
  aboutProject?: string | null
  /**
   * SENT AS AN EMERGENCY. Criterion M62. False on every ordinary message and on every message
   * written before this existed.
   */
  urgent: boolean
  /**
   * WHETHER THE WRITER SAID THIS MESSAGE ASKS THE PERSON SOMETHING. True: it asks. False: the writer
   * said it does not. Null: the writer said nothing, which is every message written before the field
   * existed and every comment of the older kind. Null is not false. Read by `asksThePersonOf`; the
   * whole rule is on `whyAsksThePersonIsRefused` below.
   */
  asksThePerson: boolean | null
  /**
   * THE MARK THE PERSON PUT ON THIS MESSAGE, and the one sentence of what the agent must do when the mark asks
   * something. Both are absent on a message with no mark, so its entry is what it was before
   * the mark existed; `whatTheMarkAsks` is absent on a message marked none, which asks nothing. Read by
   * `theIntentOnTheWire` in shared/intent-mark.ts.
   */
  intent?: IntentMark
  whatTheMarkAsks?: string
  /**
   * THE PERSON'S OWN LABEL ON THIS MESSAGE, its word and colour. Absent on a message with none, so its entry is what it
   * was before labels existed. It asks nothing of the agent, which reads its word as text. Read by `theLabelOnTheWire`
   * in shared/message-label.ts.
   */
  label?: MessageLabel
  /**
   * THE PERSON'S INSTRUCTION FOR THE FLAG THE MESSAGE USES when it is one of their own flags, worked out from their
   * row as this read hands the message over. Absent on a message with no label, and on a flag with no instruction.
   */
  whatTheLabelAsks?: string
  /**
   * THE RUNS OF THIS MESSAGE'S WORDS THE PERSON MARKED, each with its flag's name and the person's instruction as
   * handed over, or absent on a message with no parts. Read by `theMarkedPartsOnTheWire` in shared/intent-mark.ts.
   */
  markedParts?: readonly AMarkedPartOnTheWire[]
  /** The person's own name for "No mark", beside the parts, for the line naming the words no part covers. */
  noMarkName?: string
  /**
   * THE ONE VIEWER THIS WAS NARROWED TO, or null because it was narrowed to nobody. Criterion M62.
   *
   * Both halves may be null on their own: a machine and no program is every program on that
   * machine. Whether a given screen is the one named is answered on the SERVER, where the reader's
   * machine is measured; this is on the wire so a screen can say what a message was narrowed to.
   */
  onlyOn: { machine: string | null; program: string | null } | null
  /**
   * THE BROWSER'S OWN ID FOR THE PRESS THAT SENT THIS, or null because it carries none. Problem
   * KzLydNEm4HYX. After a send whose answer was lost, the chat finds its own letter by this id and
   * never by its words. Mole Office stores it as sent and uses it for nothing else.
   */
  sendId: string | null
  /**
   * THE WORDS WERE CHANGED AFTER THE MESSAGE WAS WRITTEN: when, by whom, and the words as first written, or null
   * because nobody changed them, by point 2 of a decision. Read through `editedOf`.
   */
  edited: MessageEdited | null
  /**
   * UNTIL WHEN ITS WRITER MAY STILL CHANGE THE WORDS, as an ISO time with its zone. The server works it out from the time
   * it was written and the edit window, and refuses a change after it whatever a screen drew, by point 2 of a
   * decision. Null in two different cases, and the chat offers no Edit in either: nobody may
   * change the words (a line from Mole Office, or a writer nobody could name), or the message is a comment nobody has
   * been handed yet (`notSentYet`), which has no window and whose writer edits it in the review pane at any age.
   */
  wordsMayChangeUntil: string | null
  /**
   * THE PICTURES THIS MESSAGE CARRIES, oldest field first, or an empty list because it carries none.
   *
   * Criterion M64: a picture can be sent in the chat. An answer with a
   * screenshot in it is one message, not a message plus a report.
   *
   * EMPTY IS NOT NULL HERE, and that is deliberate: a message with no pictures and a message written
   * before this field existed are the same fact — nothing to draw — so a screen has one case rather
   * than two. Every other absent field on this shape says *nobody recorded it*, which is a different
   * statement and keeps its null.
   *
   * THEY ARE THE SAME `ImageBlock` A REPORT IS MADE OF, so the same drawing code reads them and the
   * same door serves the bytes. HOW they are drawn is not here: that is a choice each browser makes
   * for itself, in src/shared/messagepictures.ts.
   */
  pictures: readonly ImageBlock[]
  /** One row per recipient. */
  deliveries: readonly DeliveryOnTheWire[]
  /**
   * WHO COULD NOT BE REACHED WHEN THIS WAS SENT, AND WHO RECEIVED IT INSTEAD.
   *
   * The routing follows the secretary's decision `J1Qge4JH87bv` and one more. The addressee is
   * kept in `to` and in `data.to`; this is where the office also gave the words to somebody up the addressee's chain of
   * starters. One entry per addressee that could not be reached, and empty on every message nobody had to route. The
   * reader prints the entry's `line` and never builds it again.
   *
   * OPTIONAL BECAUSE A MESSAGE WRITTEN BEFORE THE ROUTING HAS NONE. Every reader asks `routedOf`,
   * which answers an empty list for an absent field, and `asMessage` always puts the read list on the
   * wire, so a surface sees the same empty list either way.
   */
  routed?: readonly RoutedAddressee[]
  /**
   * WHERE THE PRESS TO START A NEW AGENT CARRIED THIS MESSAGE, as stored facts, or an empty list because it
   * never did. Problem hqbovBMnTu-z: the chat draws a visible line from these, in the page's language.
   */
  carriedTo?: readonly CarriedTo[]
  /** The run this message is about, where the office wrote it about one (a check asked for, a finish told). Criterion M93. */
  aboutRun?: string | null
  /**
   * THE MESSAGE THIS LINE IS ABOUT, where the office wrote a notice about a conversation. Criterion
   * M128: such a notice is a system line in the conversation it is about, and this is how the reader
   * finds that conversation without the notice being addressed to the agent in it. Null on every
   * message that is not such a notice.
   */
  aboutMessage?: string | null
  /**
   * WHO MADE THE OFFER THIS MESSAGE CARRIES, or null because nobody recorded it. The writer of every message except
   * one that Remind me later brought back: that line is the office's, and the offer in it is still the first
   * sender's. `whoMadeTheOffer` in src/server/lib/messages.ts reads it, so the chat and the lead card name one sender.
   */
  offerMadeBy?: ParticipantRef | null
  /**
   * THE LINE THIS ONE IS FOLDED INTO, by its id, or null because it is folded into nothing. Only Mole Office writes it,
   * on its own lines in a group. The group draws a folded line under the line it names, behind a press that says how
   * many lines are there (`theFoldsOf` in shared/folded-lines.ts).
   */
  foldedInto?: string | null
}

/**
 * READ THE PICTURES OFF A STORED MESSAGE, dropping anything that is not one.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT DROPS RATHER THAN REFUSES, AND WHY THAT IS NOT A SILENT FALLBACK
 * ---------------------------------------------------------------------------------------
 *
 * The write door has already refused anything that is not an `ImageBlock`: `data.pictures` is
 * declared `ImageBlock[]` on the message kind, and `validateData` checks every entry before a row
 * is stored. So a row reaching this reader with something else in it is a row written before that
 * declaration existed or one somebody edited in the database by hand, and the honest thing for a
 * READER is to draw the pictures that are there. Refusing to serve a whole conversation because one
 * old row holds a shape nobody can draw would take the conversation away rather than the bad block.
 *
 * IT IS SHARED BECAUSE BOTH SIDES READ IT — the server putting a message on the wire, and any reader
 * holding a stored record rather than a wire message. `writtenFromOf` below says the same thing.
 */
export function picturesOf(data: Record<string, unknown>): readonly ImageBlock[] {
  const held = data['pictures']
  if (!Array.isArray(held)) return []
  return held.filter((one): one is ImageBlock => {
    if (typeof one !== 'object' || one === null || Array.isArray(one)) return false
    const block = one as Record<string, unknown>
    return (
      block['type'] === 'image' &&
      typeof block['id'] === 'string' &&
      typeof block['path'] === 'string' &&
      block['path'] !== '' &&
      typeof block['alt'] === 'string'
    )
  })
}

/**
 * Read `onlyOn` off a stored message, or null because it named no viewer.
 *
 * An object with neither half is null: it narrows nothing, which is what leaving the field out
 * means, and two spellings of one meaning would give a screen two things to say about one message.
 */
export function onlyOnOf(data: Record<string, unknown>): MessageOnTheWire['onlyOn'] {
  const held = data['onlyOn']
  if (typeof held !== 'object' || held === null || Array.isArray(held)) return null
  const said = held as Record<string, unknown>
  const machine = typeof said['machine'] === 'string' && said['machine'] !== '' ? said['machine'] : null
  const program = typeof said['program'] === 'string' && said['program'] !== '' ? said['program'] : null
  if (machine === null && program === null) return null
  return { machine, program }
}

/**
 * Read `writtenFrom` off a stored message, or null.
 *
 * IT IS SHARED BECAUSE BOTH SIDES READ IT: the server putting a message on the wire, and any
 * reader that has a stored record rather than a wire message. A second reading of one stored shape
 * is how the two come to disagree about what an absent field means.
 */
/**
 * WHERE A MESSAGE WAS WRITTEN, from its stored mark `data.writtenIn`. The one reader, for the server
 * and the browser alike. Null when the message holds no mark; an empty object when the mark says no project and no page
 * were named. `recordedBy`, which says the move into the message centre wrote the mark, is not handed on.
 */
export function writtenInOf(data: Record<string, unknown>): { project?: string; page?: string } | null {
  const held = data['writtenIn']
  if (typeof held !== 'object' || held === null || Array.isArray(held)) return null
  const said = held as Record<string, unknown>
  const out: { project?: string; page?: string } = {}
  if (typeof said['project'] === 'string' && said['project'] !== '') out.project = said['project']
  if (typeof said['page'] === 'string' && said['page'] !== '') out.page = said['page']
  return out
}

/** Of a message, the two marks that name a project. */
export type AMessagesProjectMarks = Pick<MessageOnTheWire, 'writtenIn' | 'aboutProject'>

/**
 * THE PROJECTS A CONVERSATION'S MESSAGES WERE WRITTEN IN OR ARE MARKED ABOUT, LATEST FIRST. The chat's side list is
 * one list, each conversation marked with its projects and filtered by them.
 *
 * ONE RULE, for the server's list doors and for the page that moves a row when a message arrives
 * (src/web/lib/chatdeltas.ts): a conversation's projects are its messages' projects taken one message at a time, oldest
 * first, each newer message putting its own in front. So a list built here and a list moved one message at a time are the
 * same list. A message names the project it says it is about before the one it was written in. A conversation whose
 * messages carry no project mark has no projects, and an empty list is that answer.
 */
export function theProjectsWithANewerMessage(held: readonly string[], newer: AMessagesProjectMarks): string[] {
  const its = [newer.aboutProject, newer.writtenIn?.project].filter((one): one is string => typeof one === 'string' && one !== '')
  if (its.length === 0) return [...held]
  return [...new Set([...its, ...held])]
}

/** Every project of one conversation, from its messages oldest first. See `theProjectsWithANewerMessage`. */
export function theProjectsOfAConversation(said: readonly AMessagesProjectMarks[]): string[] {
  return said.reduce<string[]>((held, one) => theProjectsWithANewerMessage(held, one), [])
}

export function writtenFromOf(data: Record<string, unknown>): MessageOnTheWire['writtenFrom'] {
  const held = data['writtenFrom']
  if (typeof held !== 'object' || held === null || Array.isArray(held)) return null
  const said = held as Record<string, unknown>
  // AN OLD ROW'S WORD READS AS THE NEW ONE (src/shared/renamed-words.ts); the row itself keeps the word it was written with.
  const how = typeof said['how'] === 'string' ? nowSaid(ADDRESS_NAME_WORDS_RENAMED, said['how']) : ''
  if (how === '') return null
  const machine = typeof said['machine'] === 'string' && said['machine'] !== '' ? said['machine'] : null
  const program = typeof said['program'] === 'string' && said['program'] !== '' ? said['program'] : null
  if (machine === null && program === null) return null
  return { machine, how, program }
}

/**
 * WHAT A MESSAGE'S ORIGIN READS AS, in one line: "from cedar, Chrome".
 *
 * WHAT IS DRAWN IS WHAT IS KNOWN AND NOTHING ELSE. A message that recorded a machine and no
 * program reads "from cedar"; one that recorded a program and no machine reads "in Chrome"; one
 * that recorded neither is not drawn at all — `writtenFromOf` answers null for it, and a screen
 * draws nothing rather than a dash, an "unknown" or a guess.
 *
 * AN ADDRESS IS SAID TO BE AN ADDRESS. `how` is what makes that possible, and without it a reader
 * meeting "from 192.0.2.10" could not tell an address from a machine somebody named that.
 */
export function whereItWasWrittenReads(from: NonNullable<MessageOnTheWire['writtenFrom']>): string {
  // THE MACHINE AND THE PROGRAM ARE CONTENT, recorded as the message was written; only the words
  // around them come from the word lists, in the page language in a browser and in English on Node.
  const place =
    from.machine === null
      ? null
      : from.how === 'an address'
        ? readStoredWord('chatLive.theAddress', { address: content(from.machine) })
        : content(from.machine)
  if (place !== null && from.program !== null) {
    return readStoredWord('chatLive.writtenFromPlaceAndProgram', { place, program: content(from.program) })
  }
  if (place !== null) return readStoredWord('chatLive.writtenFromPlace', { place })
  return readStoredWord('chatLive.writtenInProgram', { program: content(from.program ?? '') })
}

/**
 * WHAT ON A PAGE A RECORD POINTS AT, whichever key its kind keeps it under, or null when it points
 * nowhere.
 *
 * A comment written before comments and messages became one thing is a record of kind `annotation`
 * with a `context`; one written since is a message with a `target`. One fact, two spellings, and
 * this is the only place that knows both. It is in shared/ because the server and the browser both
 * ask it, and two copies would go quiet on one side only.
 */
export function targetOfRecord(record: { kind: string; data: Record<string, unknown> }): unknown {
  const held = record.kind === 'annotation' ? record.data['context'] : record.data['target']
  if (held === null || held === undefined || typeof held !== 'object' || Array.isArray(held)) return null
  return held
}

/** A reason the positions cannot describe this message, or null when they fit. */
export function whyQuotePositionsAreInvalid(
  body: string,
  quotes: readonly unknown[] | null,
  positions: unknown,
  target: unknown = null,
): string | null {
  if (positions === null || positions === undefined) return null
  if (target !== null && target !== undefined) return sayInEnglish('server.quotePositions.withTarget')
  if (quotes === null) return sayInEnglish('server.quotePositions.needsQuotes')
  if (!Array.isArray(positions)) return sayInEnglish('server.quotePositions.list')
  if (positions.length !== quotes.length) return sayInEnglish('server.quotePositions.count')
  let previous = 0
  for (const at of positions) {
    if (typeof at !== 'number' || !Number.isInteger(at) || at < 0 || at > body.length) {
      return sayInEnglish('server.quotePositions.range')
    }
    if (at < previous) return sayInEnglish('server.quotePositions.order')
    const left = body.charCodeAt(at - 1)
    const right = body.charCodeAt(at)
    if (left >= 0xd800 && left <= 0xdbff && right >= 0xdc00 && right <= 0xdfff) {
      return sayInEnglish('server.quotePositions.character')
    }
    previous = at
  }
  return null
}

/** The words and quotes of a message, in the order in which they are read. */
export function theMessageInOrder<T>(
  body: string,
  quotes: readonly T[],
  positions: readonly number[] | null,
): ({ kind: 'words'; text: string } | { kind: 'quote'; quote: T })[] {
  const problem = whyQuotePositionsAreInvalid(body, quotes, positions)
  if (problem !== null) throw new Error(problem)
  const parts: ({ kind: 'words'; text: string } | { kind: 'quote'; quote: T })[] = []
  let from = 0
  for (let i = 0; i < quotes.length; i += 1) {
    const at = positions === null ? 0 : positions[i]!
    if (at > from) parts.push({ kind: 'words', text: body.slice(from, at) })
    parts.push({ kind: 'quote', quote: quotes[i]! })
    from = at
  }
  if (from < body.length) parts.push({ kind: 'words', text: body.slice(from) })
  return parts
}

/** The stored places for a message's quotes, or null when the quotes come first. */
export function quotePositionsOf(record: { kind: string; data: Record<string, unknown> }): readonly number[] | null {
  const held = record.data['quotePositions']
  return Array.isArray(held) ? held as number[] : null
}

/**
 * WHAT A MESSAGE QUOTES, in the order they were given, or an empty list when it quotes nothing. One message may
 * carry any number of quotes, and a message sent by pointing shows a quote of what it points
 * at.
 *
 * TWO FIELDS HOLD IT, AND THIS IS THE ONE READER OF BOTH.
 * - `target` is the one place a comment was left on. A message that has it quotes that one place,
 *   so it reads as a list of one. An annotation's `context` is the same fact under its older name,
 *   and `targetOfRecord` above is what knows both spellings.
 * - `quotes` is a list of the same shape, for a message that quotes several things. It is named
 *   `quotes` because that is what the two decisions call them, and because `targets` would be
 *   confused with the `target` key inside each one. A message with `quotes` is not a comment left
 *   on those places: `recordIsAComment` reads `target` only.
 * A message holding neither reads as an empty list.
 *
 * WHAT DOES NOT READ THIS, AND WHY. A reader asking WHERE A COMMENT WAS LEFT asks a different
 * question and stays on `targetOfRecord`: the marks on a page (src/web/components/agent/marks.ts),
 * what an agent said here (AgentSaidHere.tsx), a review's members, the annotations reader, and
 * `notSentYet`. A message that quotes several comments, one per comment record, would otherwise put
 * every one of those comments on its page twice.
 *
 * The message door refuses a message that holds both. A row that holds both all the same is read
 * with its `target` first and then its `quotes`, so nothing stored is left out of what a reader sees.
 *
 * An entry of `quotes` that is not an object is left out, which is what `targetOfRecord` does with a
 * `target` that is not one. The door refuses such an entry, so only a row written round the door
 * can hold one.
 */
export function quotesOf(record: { kind: string; data: Record<string, unknown> }): readonly Context[] {
  const out: Context[] = []
  const single = targetOfRecord(record)
  if (single !== null) out.push(single as Context)
  if (record.kind !== 'message') return out
  const held = record.data['quotes']
  if (!Array.isArray(held)) return out
  for (const one of held) {
    if (typeof one !== 'object' || one === null || Array.isArray(one)) continue
    out.push(one as Context)
  }
  return out
}

/**
 * WHERE A MESSAGE OFFERS TO TAKE THE READER, or null when it offers nothing.
 *
 * A lead is the same shape as a target — a thing on a page, and optionally the exact words inside
 * it — because it is the same question asked for a different reason. `target` says what a message
 * is ABOUT; `lead` says where it wants to TAKE you. A message may carry both, one, or neither.
 *
 * NOTHING MOVES BECAUSE OF THIS FIELD ON ITS OWN. Criterion M8: unless the reader is following that
 * agent, a lead is drawn as an offer with one button and the page does not move.
 */
export function leadOfRecord(record: { kind: string; data: Record<string, unknown> }): unknown {
  if (record.kind !== 'message') return null
  const held = record.data['lead']
  if (held === null || held === undefined || typeof held !== 'object' || Array.isArray(held)) return null
  return held
}

/** True when this record is a comment: an annotation, or a message that says where it points. */
export function recordIsAComment(record: { kind: string; data: Record<string, unknown> }): boolean {
  if (record.kind === 'annotation') return true
  return record.kind === 'message' && targetOfRecord(record) !== null
}

// ------------------------------------------------------------- the picture on the round chat button

/**
 * ONE PICTURE THE ROUND CHAT BUTTON MAY CARRY: what it is called, and the file that draws it.
 *
 * Criterion M38: the pictures a person may choose are mole-at-the-sill, three-moles-at-the-sill,
 * mole-in-a-porthole, two-moles-talking, mole-at-the-sill.svg and mole-in-a-porthole.svg; the rest
 * were removed, and mole-at-the-sill was the default.
 * A decision of 26 September made each look's own icon the default for a while. On 27 September
 * another decision put mole-at-the-sill back as the default in both looks, and a picture the person chooses
 * still replaces it.
 *
 */
export { CIRCLE_PICTURES, type CirclePicture } from './circle-pictures.ts'

/**
 * WHAT THE BUTTON DRAWS WHEN THE PERSON HAS CHOSEN NO PICTURE, in both looks.
 *
 * Not choosing stays a different stored fact from choosing this picture: the row keeps NULL, the
 * settings panel presses no picture, and only the drawing reads NULL as this one.
 */
export const CIRCLE_PICTURE_BEFORE_ANYBODY_CHOOSES = 'mole-at-the-sill'

/** The declared picture of that name, or null because nothing here is called that. */
export function circlePicture(name: unknown): CirclePicture | null {
  if (typeof name !== 'string') return null
  return CIRCLE_PICTURES.find((one) => one.name === name) ?? null
}

/** Where a page asks for one of these. One place builds it, as `avatarUrlFor` does for a picture. */
export function circlePictureUrl(name: string): string {
  return `/api/chat-circle/${encodeURIComponent(name)}`
}

/** How a message was found, so a reader knows which of the two kinds of row it is looking at. */
export type PoolEntryKind = 'message' | 'annotation'

/**
 * ONE ENTRY OF THE POOL as the board, a conversation and a page's comments all read it.
 *
 * `annotation` is a comment written before comments and messages became one thing. It has no
 * sender, no recipients and no delivery marks, because the row holds none of those facts and
 * working one out here would be inventing it.
 */
export interface PoolEntry extends MessageOnTheWire {
  entry: PoolEntryKind
}

// ============================================================================ what a body links to

/**
 * A RECORD ID OR A PAGE ADDRESS INSIDE A MESSAGE, SO A READER CAN FOLLOW IT WITH ONE PRESS.
 *
 * A link in a message is followed with one press: an agent that finishes a piece of
 * work writes where to look, and the reader presses it instead of searching for it.
 *
 * TWO SHAPES ARE FOLLOWED AND NOTHING ELSE IS. A record id is what isARecordId below says it is, and
 * a page address starts `#/`. A bare word is not guessed at: a message saying "see the plan" leaves
 * nothing to press, which is honest.
 */
export { TWELVE_ID_CHARACTERS } from './record-id-shape.ts'
const PAGE_PATH_SHAPE = new RegExp(OFFICE_PAGE_PATH_SOURCE, 'g')
// One piece of a word: all lower-case, all capitals, or a capital and then lower-case.
const PIECE_OF_A_WORD = '(?:[a-z]+|[A-Z]+|[A-Z][a-z]+)'
const A_WORD_OF_LETTERS = new RegExp(`^${PIECE_OF_A_WORD}(?:[-_]${PIECE_OF_A_WORD})*$`)

/**
 * A WHOLE WORD WITH A RECORD ID'S SHAPE: twelve characters from nanoid's alphabet. It is only the shape: isARecordId
 * reads it first and then takes words out. A reader that needs the shape alone, such as a list of run ids, imports it here.
 */
export const AN_ID_SHAPE = /^[A-Za-z0-9_-]{12}$/

/**
 * WHETHER A WORD IS A RECORD ID. Every place that finds record ids in text reads this, and nothing
 * else decides it (answer TlHCo_5kpASI, wave 13n round 37).
 *
 * A record id is twelve characters from nanoid's alphabet: A to Z, a to z, 0 to 9, - and _. Many
 * English words have that shape too, and a word taken for an id disappears from a person's sentence
 * behind a link, or behind '…' in a plan sentence. So a word made only of letters is a word, not an
 * id, when each of its pieces is all lower-case, all capitals, or a capital and then lower-case, and
 * the pieces are joined by - or _, in any number:
 * - "conversation", "Conversation", "CONVERSATION", "NOTIFICATION";
 * - "well-behaved", "Long-running", "Self-hosting", "first_person".
 * A word with a digit, or with a capital inside a piece ("kfhOqxMhCLIE"), is an id.
 *
 * WHAT IT TRADES. A random id has one of those shapes 313 times in a million: 313 of one million
 * random twelve-character ids from nanoid's alphabet, measured in round 37b. Round 37's narrower rule
 * measured about 58. A piece may be one letter, so "AOL-o-ne-Oow" is read as a word too. Such an id
 * is drawn as plain words instead of a link, and a plan sentence keeps it instead of taking it out.
 *
 * WHERE IT IS READ, and where it is not. It is the display rule, for a word in text: piecesOfBody
 * below, withoutRecordIds in src/web/components/plans/planitems.tsx, ChangeLog.tsx, LinkPanel.tsx
 * and ui.tsx in src/web/components. Search does NOT read it. GET /api/search looks up every query
 * that is twelve characters of the id alphabet, whatever its shape (looksLikeId in
 * src/server/api/search.ts), so a real id with a word's shape, such as PJQLJ-nv-MCX, is still found
 * by searching it. No id is lost to search.
 */
export function isARecordId(word: string): boolean {
  if (!AN_ID_SHAPE.test(word)) return false
  if (A_WORD_OF_LETTERS.test(word)) return false
  return true
}

/** One piece of a message body: plain words, a record id, or a page address. */
export type BodyPiece =
  | { what: 'words'; text: string }
  | { what: 'record'; text: string; recordId: string }
  | { what: 'page'; text: string; path: string }

/**
 * Split a body into the pieces a reader presses and the words between them.
 *
 * The pieces join back into exactly the body that went in, so nothing is dropped or rewritten by
 * being drawn. A test asserts that.
 */
export function piecesOfBody(body: string): BodyPiece[] {
  const found: { at: number; end: number; piece: BodyPiece }[] = []
  for (const match of body.matchAll(PAGE_PATH_SHAPE)) {
    if (match.index === undefined) continue
    found.push({
      at: match.index,
      end: match.index + match[0].length,
      piece: { what: 'page', text: match[0], path: match[0] },
    })
  }
  for (const match of body.matchAll(TWELVE_ID_CHARACTERS)) {
    if (match.index === undefined || !isARecordId(match[0])) continue
    const at = match.index
    // A twelve-character run inside a page address is part of the address, not a second link.
    if (found.some((one) => at >= one.at && at < one.end)) continue
    found.push({ at, end: at + match[0].length, piece: { what: 'record', text: match[0], recordId: match[0] } })
  }
  found.sort((a, b) => a.at - b.at)

  const out: BodyPiece[] = []
  let at = 0
  for (const one of found) {
    if (one.at > at) out.push({ what: 'words', text: body.slice(at, one.at) })
    out.push(one.piece)
    at = one.end
  }
  if (at < body.length) out.push({ what: 'words', text: body.slice(at) })
  return out
}


// ======================================================================== who wrote one message

/**
 * WHO WROTE A MESSAGE, AND WHETHER ANY REGISTRY ANSWERS FOR THEM.
 *
 * These four were in src/server/lib/messages.ts and are here now, unchanged, because the browser
 * needs the same answer. The Messages page has to know whether a row's writer is somebody a registry
 * holds or a writer nobody registered, so that it can offer to open the message where it is read —
 * and a copy of the rule in the page would be the defect CLAUDE.md names as this repository's own:
 * the same fact worked out in two places, free to disagree with nothing failing.
 *
 * THEY READ NOTHING BUT THEIR ARGUMENTS. No database, no clock, no request. That is what made them
 * movable at all.
 */

/**
 * WHAT THE CONTACTS AND CONVERSATION LIBRARY NEEDS TO KNOW ABOUT ONE REGISTERED PARTICIPANT.
 *
 * The ref alone stopped being enough at criterion M25. A message whose writer typed a `from` line
 * and claimed no participant belongs under that writer until somebody registers under the same
 * name, and deciding whether anybody has means reading the handles and the names.
 */
export interface KnownParticipant {
  who: ParticipantRef
  name: string
  handle: string
  /**
   * An agent's own record in the project being read, or null when it has none. A list built without
   * it matches no record id, which is what the server's lists do.
   */
  record?: string | null
  /**
   * An agent's old registry ids that it alone answers to, which a row written before an alias was
   * filed may hold. A list built without them matches no old id.
   */
  oldIds?: readonly string[]
}

/**
 * WHICH REGISTERED PARTICIPANT A TYPED `from` LINE NAMES, or null because none does.
 *
 * ---------------------------------------------------------------------------------------
 * THIS IS HOW A WRITER'S MESSAGES MOVE WHEN IT REGISTERS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M25: a writer nobody registered is shown under the line it typed, and its messages move
 * under the registered contact when it registers. Nothing rewrites a stored message when that
 * happens. The move is this lookup, run afresh on every read, so on the day a registry row appears
 * with that handle or that name the messages are already in its conversation.
 *
 * THE MATCH IS EXACT, apart from case and the spaces at the ends. A looser rule — a prefix, or a
 * word in common — would put one writer's messages in another's conversation, and a message drawn
 * in the wrong conversation is worse than one drawn under a line nobody registered.
 */
export function whoTypedThis(typed: string | null, everyone: readonly KnownParticipant[]): ParticipantRef | null {
  if (typed === null) return null
  const said = typed.trim().toLowerCase()
  if (said === '') return null
  for (const one of everyone) {
    if (one.handle.trim().toLowerCase() === said) return one.who
    if (one.name.trim().toLowerCase() === said) return one.who
  }
  return null
}

/**
 * WHO SENT THIS MESSAGE, counting a typed `from` line that names somebody in the registries.
 *
 * `sentBy` is the stored answer and always wins. `from` is read only when nothing was stored, which
 * is what every message written before the pool existed holds.
 */
export function senderOf(one: Pick<MessageOnTheWire, 'sentBy' | 'from'>, everyone: readonly KnownParticipant[]): ParticipantRef | null {
  if (one.sentBy !== null) return theAgentAStoredSenderNames(one.sentBy, everyone) ?? one.sentBy
  return whoTypedThis(one.from, everyone)
}

/**
 * THE REGISTERED PARTICIPANT A STORED SENDER NAMES, or null because no registry row answers it.
 *
 * A stored reference is read the way every stored reference is (wave 13b, rule 2; criterion I2):
 * an exact id first; then, for an agent, the one agent with that old registry id, where the list
 * carries old ids; then the one agent whose own record has that id, where the list
 * carries records; then the one agent bearing that string as its handle; and nobody where more than
 * one does. A message stored under a name before anybody registered it is then the message of the
 * agent that later registered under that name, although since the mint (criterion I1) that agent's
 * id is not the name. `senderOf` and `unregisteredWriterOf` both read a stored sender, so both ask
 * this and nothing else. The lead pane asks it too, for the agent a reader follows (wave 13y round
 * 83): a reader may follow an agent by its record's id or by its handle.
 */
export function theAgentAStoredSenderNames(sentBy: ParticipantRef, everyone: readonly KnownParticipant[]): ParticipantRef | null {
  if (everyone.some((known) => known.who.kind === sentBy.kind && known.who.id === sentBy.id)) return sentBy
  if (sentBy.kind !== 'agent') return null
  const formerly = everyone.filter((known) => known.who.kind === 'agent' && known.oldIds?.includes(sentBy.id) === true)
  if (formerly.length === 1) return formerly[0]!.who
  const holders = everyone.filter((known) => known.who.kind === 'agent' && known.record === sentBy.id)
  if (holders.length === 1) return holders[0]!.who
  const bearers = everyone.filter((known) => known.who.kind === 'agent' && known.handle === sentBy.id)
  return bearers.length === 1 ? bearers[0]!.who : null
}

/**
 * THE UNREGISTERED WRITER THIS MESSAGE CAME FROM, or null because a registry answers for its writer.
 *
 * A message counts as coming from an unregistered writer when nobody in the registries sent it:
 * either it stored no sender at all and its typed `from` line names nobody, or it stored a sender
 * that no registry row holds. Criterion M25.
 */
export function unregisteredWriterOf(
  one: MessageOnTheWire,
  everyone: readonly KnownParticipant[],
): UnregisteredWriter | null {
  if (one.sentBy !== null) {
    // A STORED SENDER IS READ BY `theAgentAStoredSenderNames`: an exact id, then the one agent
    // bearing that string as its handle. A message stored under a name before anybody registered it
    // is then no longer drawn as unregistered once an agent registers under that name.
    if (theAgentAStoredSenderNames(one.sentBy, everyone) !== null) return null
    return { typed: one.from, said: one.sentBy }
  }
  if (whoTypedThis(one.from, everyone) !== null) return null
  return { typed: one.from, said: null }
}

// ============================================================================ the words a panel draws

/**
 * EVERY SENTENCE THE CHAT PANEL SAYS, WRITTEN HERE AND NOT IN THE COMPONENT.
 *
 * Two reasons, and the second is the one that matters. A sentence in a component is a sentence one
 * screen says; the same fact then gets a second wording on the next screen. And the sentence gate, a
 * test deleted on 12 November 2026, wrote down every sentence under `src/web` by name, so a
 * sentence that belongs to the product rather than to a layout belongs on this side of the line.
 */
export const CHAT_WORDS = {
  get "circleName"() { return readStoredWord("chat.circleName") },
  get "contacts"() { return readStoredWord("chat.contacts") },
  get "betweenAgents"() { return readStoredWord("chat.betweenAgents") },
  get "composerPlaceholder"() { return readStoredWord("chat.composerPlaceholder") },
  get "send"() { return readStoredWord("chat.send") },
  get "noMessagesYet"() { return readStoredWord("chat.noMessagesYet") },
  get "aDraftIsWaiting"() { return readStoredWord("chat.aDraftIsWaiting") },
  get "newMessagesBelow"() { return readStoredWord("chat.newMessagesBelow") },
  get "noContacts"() { return readStoredWord("chat.noContacts") },
  get "noAgentConversations"() { return readStoredWord("chat.noAgentConversations") },
  get "close"() { return readStoredWord("chat.close") },
  get "fillTheWindow"() { return readStoredWord("chat.fillTheWindow") },
  get "backToTheCorner"() { return readStoredWord("chat.backToTheCorner") },
  get "stopEditing"() { return readStoredWord("chat.stopEditing") },
  get "back"() { return readStoredWord("chat.back") },
  get "yourSettings"() { return readStoredWord("chat.yourSettings") },
  get "everyMessage"() { return readStoredWord("chat.everyMessage") },
  get "notSentYet"() { return readStoredWord("chat.notSentYet") },
  get "sendThemAll"() { return readStoredWord("chat.sendThemAll") },
  get "noReviewToSend"() { return readStoredWord("chat.noReviewToSend") },
  get "sendingNotYetReceived"() { return readStoredWord("chat.sendingNotYetReceived") },
  get "sendingReceivedByServer"() { return readStoredWord("chat.sendingReceivedByServer") },
  get "sendAgain"() { return readStoredWord("chat.sendAgain") },
  get "titleStandsInForTheLabel"() { return readStoredWord("chat.titleStandsInForTheLabel") },
  get "bothSides"() { return readStoredWord("chat.bothSides") },
  get "readingBothSides"() { return readStoredWord("chat.readingBothSides") },
  get "readingSomebodyElses"() { return readStoredWord("chat.readingSomebodyElses") },
  get "firstTimeReadingThis"() { return readStoredWord("chat.firstTimeReadingThis") },
  get "unregistered"() { return readStoredWord("chat.unregistered") },
  get "unregisteredIs"() { return readStoredWord("chat.unregisteredIs") },
  get "unregisteredIsNoName"() { return readStoredWord("chat.unregisteredIsNoName") },
  get "unregisteredWithNoName"() { return readStoredWord("chat.unregisteredWithNoName") },
  get "anAgentThisPageHasNoNameFor"() { return readStoredWord("chat.anAgentThisPageHasNoNameFor") },
  get "aPersonThisPageHasNoNameFor"() { return readStoredWord("chat.aPersonThisPageHasNoNameFor") },
  get "clearTheirLine"() { return readStoredWord("chat.clearTheirLine") },
  "answeringNow": {
  get "a live session"() { return readStoredWord("chat.answeringNow.a live session") },
  get "a run"() { return readStoredWord("chat.answeringNow.a run") },
  get "a waiting run"() { return readStoredWord("chat.answeringNow.a waiting run") },
  get "its own conversation"() { return readStoredWord("chat.answeringNow.its own conversation") },
  get "nobody"() { return readStoredWord("chat.answeringNow.nobody") },
  },
  get "whetherYouAreHere"() { return readStoredWord("chat.whetherYouAreHere") },
  get "whichList"() { return readStoredWord("chat.whichList") },
  "dragging": {
  get "left"() { return readStoredWord("chat.dragging.left") },
  get "top"() { return readStoredWord("chat.dragging.top") },
  get "corner"() { return readStoredWord("chat.dragging.corner") },
  },
  get "composerHeight"() { return readStoredWord("chat.composerHeight") },
  get "ranBy"() { return readStoredWord("chat.ranBy") },
  draftsMayBeLost: (because: string): string => readStoredWord("chat.draftsMayBeLost", { because }),
  writtenInProject: (name: string): string => readStoredWord("chat.writtenInProject", { name }),
  theirPage: (name: string): string => readStoredWord("chat.theirPage", { name }),
  tabWithUnread: (name: string, count: number): string => readStoredWord("chat.tabWithUnread", { name, n: count }),
  sendFailed: (reason: string): string => readStoredWord("chat.sendFailed", { reason }),
  sendError: (reason: string): string => readStoredWord("chat.sendError", { reason }),
  sendNotKnownYet: (seconds: number): string => readStoredWord("chat.sendNotKnownYet", { n: seconds }),
  sendNotInTheConversation: (seconds: number): string => readStoredWord("chat.sendNotInTheConversation", { n: seconds }),
  recordLink: (name: string, recordId: string): string => readStoredWord("chat.recordLink", { name, recordId }),
  circlePicture: (name: string): string => readStoredWord("chat.circlePicture", { name: name.replace(/-/g, ' ') }),
  unreadName: (count: number): string => readStoredWord("chat.unreadName", { n: count }),
  asSide: (name: string): string => readStoredWord("chat.asSide", { name }),
  aboutThePlace: (where: string): string => readStoredWord("chat.aboutThePlace", { where }),
  youReadThisBefore: (side: string, at: string): string => readStoredWord("chat.youReadThisBefore", { side, at }),
  youReadThisBeforeAsNeither: (at: string): string => readStoredWord("chat.youReadThisBeforeAsNeither", { at }),
  theirLine: (name: string): string => readStoredWord("chat.theirLine", { name }),
  lineSetBy: (name: string): string => readStoredWord("chat.lineSetBy", { name }),
  unsentHere: (count: number): string => readStoredWord("chat.unsentHere", { n: count }),
  unreadMessagesBubble: (count: number): string => readStoredWord("chat.unreadMessagesBubble", { n: count }),
  unreadGroupsBubble: (count: number): string => readStoredWord("chat.unreadGroupsBubble", { n: count }),
  unreadNameInTwo: (messages: number, groups: number): string => {
    if (messages > 0 && groups > 0) return readStoredWord('chat.unreadTwo', {
      name: CHAT_WORDS.circleName, messages: CHAT_WORDS.unreadMessagesBubble(messages), groups: CHAT_WORDS.unreadGroupsBubble(groups),
    })
    if (messages > 0 || groups > 0) return readStoredWord('chat.unreadOne', {
      name: CHAT_WORDS.circleName, unread: messages > 0 ? CHAT_WORDS.unreadMessagesBubble(messages) : CHAT_WORDS.unreadGroupsBubble(groups),
    })
    return CHAT_WORDS.circleName
  },
} as const

/**
 * A WRITER NEITHER REGISTRY HOLDS, named by what it said about itself and by nothing else.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS NOT A `ParticipantRef`
 * ---------------------------------------------------------------------------------------
 *
 * A `ParticipantRef` is a row in a registry. This is the absence of one. Giving an unregistered
 * writer a ref would mean minting an id nothing can be looked up by, and every reader downstream
 * would then be free to treat it as somebody who exists. So the two are different shapes, and a
 * contact row carries exactly one of them.
 *
 * IT IS NAMED BY WHAT IT WROTE, NEVER BY A GUESS. `typed` is the `from` line exactly as it arrived.
 * `said` is the participant it claimed to be, when it claimed one and no registry answers for it.
 * Criterion M25.
 */
export interface UnregisteredWriter {
  /** The exact words of the `from` line, or null when it typed none. */
  typed: string | null
  /** The participant it claimed to be, when no registry holds that claim. Null when it claimed none. */
  said: ParticipantRef | null
}

/** What every key naming an unregistered writer begins with, so no registered key can collide. */
export const UNREGISTERED_PREFIX = 'unregistered:'

/**
 * THE ONE STRING THAT NAMES AN UNREGISTERED WRITER, in a list key, a request and a reply.
 *
 * Two writers that claimed the same actor id are one writer; two that typed the same line are one
 * writer. A claimed actor id wins over a typed line, because an id is what the next registration
 * will match on and the line is only prose.
 */
export function unregisteredKey(writer: UnregisteredWriter): string {
  if (writer.said !== null) return `${UNREGISTERED_PREFIX}who/${participantKey(writer.said)}`
  return `${UNREGISTERED_PREFIX}typed/${writer.typed ?? ''}`
}

/** The unregistered writer a key names, or null because the key names none. */
export function unregisteredFromKey(key: string): UnregisteredWriter | null {
  if (!key.startsWith(UNREGISTERED_PREFIX)) return null
  const rest = key.slice(UNREGISTERED_PREFIX.length)
  if (rest.startsWith('who/')) {
    const said = participantFromKey(rest.slice('who/'.length))
    return said === null ? null : { typed: null, said }
  }
  if (rest.startsWith('typed/')) {
    const typed = rest.slice('typed/'.length)
    return { typed: typed === '' ? null : typed, said: null }
  }
  return null
}

/**
 * WHERE A NAME IS DRAWN: alone, as a heading or a row is, or inside a sentence. Only the page's own phrase for somebody
 * it has no name for changes between the two (wave 13y round 93).
 */
export type WhereTheNameGoes = 'alone' | 'inASentence'

/**
 * THE NAME A READER SEES FOR AN UNREGISTERED WRITER.
 *
 * The line it typed, exactly as typed, because that is the only name anybody wrote for it. Failing
 * that, a sentence saying what the page knows. A stored sender that no participant the page read
 * answers to is "an agent this page has no name for", or a person, in the lead pane's words: the
 * message did name somebody, and this page could not name them. "A writer that left no name" is
 * said only when no sender was stored at all (wave 13y round 88). NEVER THE ID IT CLAIMED (wave 13y
 * round 86): an id is not a name, and drawn where the name belongs it read as if somebody had named
 * the writer so.
 *
 * INSIDE A SENTENCE THE PHRASE STARTS LOWER CASE, "Cannot reach an agent this page has no name for", so
 * the caller says where the name goes and the words stay one stored phrase (wave 13y round 93). A line the
 * writer typed is its own, and is never changed.
 */
export function unregisteredName(writer: UnregisteredWriter, where: WhereTheNameGoes = 'alone'): string {
  const typed = theLineAnUnregisteredWriterTyped(writer)
  if (typed !== null) return typed
  const phrase = writer.said === null
    ? CHAT_WORDS.unregisteredWithNoName
    : writer.said.kind === 'agent' ? CHAT_WORDS.anAgentThisPageHasNoNameFor : CHAT_WORDS.aPersonThisPageHasNoNameFor
  return where === 'alone' ? phrase : `${phrase.charAt(0).toLowerCase()}${phrase.slice(1)}`
}

/**
 * THE NAME OF THE WRITER OF ONE MESSAGE, the one rule every page that names a writer asks.
 *
 * The registry name of the participant `senderOf` finds, and otherwise `unregisteredName` of what
 * the message stored and typed. So one case gets one phrase on every page (wave 13y round 88): the
 * chat, the Messages page, a message's own page and the emergency dialogue all ask this.
 */
export function theWritersName(
  one: Pick<MessageOnTheWire, 'sentBy' | 'from'>,
  everyone: readonly KnownParticipant[],
  where: WhereTheNameGoes = 'alone',
): string {
  const who = senderOf(one, everyone)
  const known = who === null ? undefined : everyone.find((k) => k.who.kind === who.kind && k.who.id === who.id)
  return known?.name ?? unregisteredName({ typed: one.from, said: one.sentBy }, where)
}

/** The line an unregistered writer typed, or null because it typed none, or only spaces. */
export function theLineAnUnregisteredWriterTyped(writer: UnregisteredWriter): string | null {
  return writer.typed !== null && writer.typed.trim() !== '' ? writer.typed : null
}

/**
 * EVERY WORD THE MESSAGES PAGE SAYS.
 *
 * Here rather than in the page, for the reason `CHAT_WORDS` above is here: the page and the panel
 * describe the same rows, and a sentence written in a component is a sentence one screen says while
 * the next screen words the same fact differently. Criterion M27.
 */
export const MESSAGES_PAGE = {
  /**
   * THE HEADING IS NOT HERE. The page reads it from the rail row's own key, `nav.messages`, so the
   * rail and the heading say the same word in both languages.
   */
  // EVERY WORD THE PAGE SAYS IS READ FROM THE LISTS, under the keys `messages.page.*`, so a page in
  // Chinese says them in Chinese and the server keeps the English (src/shared/i18n.ts).
  /** The page's one line under its heading, said before the link to the other page. */
  get andTheOtherPage() { return readStoredWord('messages.page.andTheOtherPage') },
  /** The link itself. */
  // THE AGENTS PAGE'S OWN NAME, read from its own key, so the link and the page it opens cannot come
  // to disagree about what the page is called.
  get theOtherPage() { return readStoredWord('g6a.agents.title') },
  /**
   * THE SAME SENTENCE THE OTHER WAY ROUND, drawn on the Agent conversations page.
   *
   * Criterion M27 asks that the page the person reached by accident either becomes the Messages page or
   * links to it. It did neither: the Messages page linked to Agent conversations and Agent
   * conversations linked back to nothing, though the decision note `eDcqTE4kHkqi` said each page
   * linked to the other. Problem `WQBf8ua1eYC_`.
   *
   * BOTH HALVES LIVE HERE so the two pages describe each other in one place. Say what the other
   * page holds that this one does not, then the name as the link.
   */
  get fromTheOtherPage() { return readStoredWord('messages.page.fromTheOtherPage') },
  /**
   * The link back, which is this page's own name.
   *
   * IT READS THE RAIL ROW'S OWN KEY, `nav.messages`, and keeps no key of its own: the rail, the
   * page's heading and this link say one word in one place, so no second copy is free to drift.
   */
  get thisPage() { return readStoredWord('nav.messages') },
  /** The press that opens the filters, which are behind one so a page being read draws no boxes. */
  get chooseWhatToShow() { return readStoredWord('messages.page.chooseWhatToShow') },
  /** The five filters. */
  get bySender() { return readStoredWord('messages.page.bySender') },
  get byContact() { return readStoredWord('messages.page.byContact') },
  get byGroup() { return readStoredWord('messages.page.byGroup') },
  get byState() { return readStoredWord('messages.page.byState') },
  get byWords() { return readStoredWord('messages.page.byWords') },
  /** What an unset participant filter offers. */
  get anybody() { return readStoredWord('messages.page.anybody') },
  /** What an unset group filter offers. */
  get everyGroup() { return readStoredWord('messages.page.everyGroup') },
  /** What an unset state filter offers. */
  get anyState() { return readStoredWord('messages.page.anyState') },
  /** The two state choices that are not delivery marks. */
  get onlyComments() { return readStoredWord('messages.page.onlyComments') },
  get reachedNobody() { return readStoredWord('messages.page.reachedNobody') },
  // THE SENTENCE SAYING WHAT A FILTER HIDES, and the press that marks messages read, are in the word
  // lists (src/shared/words, keys messages.hiding.* and messages.unread.*), in both languages, since
  // the page draws one page at a time.
  /** The press that clears every filter. */
  get showEverything() { return readStoredWord('messages.page.showEverything') },
  /** What is being read, while it is being read. */
  get loading() { return readStoredWord('messages.page.loading') },
  /** The heading of a failed read of the pool. */
  get couldNotRead() { return readStoredWord('messages.page.couldNotRead') },
  /** The heading of a failed read of the registries, which is what turns an id into a name. */
  get couldNotReadWho() { return readStoredWord('messages.page.couldNotReadWho') },
  /** Nobody has said anything at all. */
  get nothingSaidAtAll() { return readStoredWord('messages.page.nothingSaidAtAll') },
  /** Something has been said, but nothing matches what is asked for. */
  get nothingMatches() { return readStoredWord('messages.page.nothingMatches') },
  /** Drawn on a message that says what on a page it is about. */
  get isAComment() { return readStoredWord('messages.page.isAComment') },
  /** The link to the record a comment was left on. */
  get openTheRecord() { return readStoredWord('messages.page.openTheRecord') },
  /** Said on a message written to a group rather than to people. */
  toAGroup: (group: string): string => readStoredWord('messages.page.toAGroup', { group }),
  /**
   * Said on a group line Mole Office delivered to some members only, or to none (problem 0WUuvB0IhRfb), in place of
   * `toAGroup`, which would say it reached everybody.
   */
  toAGroupDeliveredOnlyTo: (group: string, nobody: boolean): string =>
    nobody
      ? readStoredWord('messages.page.toAGroupDeliveredToNobody', { group })
      : readStoredWord('messages.page.toAGroupDeliveredToSome', { group }),
  /** A message with no delivery row at all reached nobody, which is a real state and not a fault. */
  get reachedNobodyAtAll() { return readStoredWord('messages.page.reachedNobodyAtAll') },
  /** A stored mark this build does not know is said as one, never read as a guess. */
  get markNobodyCanRead() { return readStoredWord('messages.page.markNobodyCanRead') },
  /** The link to the run that took a message. */
  get theRunThatTookIt() { return readStoredWord('messages.page.theRunThatTookIt') },
  /** The press that opens a message in the conversation it belongs to. Criterion M27. */
  openItWhereItIsRead: (name: string): string => readStoredWord('messages.page.openItWhereItIsRead', { name }),
  /** The heading of a mark that failed, said beside the list the press was made on. */
  get markDidNotLand() { return readStoredWord('messages.page.markDidNotLand') },
  /** The first section: the messages waiting for the reader's answer (`?only=waiting-for-my-answer`). */
  get waitingTitle() { return readStoredWord('messages.page.waitingTitle') },
  /** That section, when nothing waits. */
  get nothingWaiting() { return readStoredWord('messages.page.nothingWaiting') },
  /** The heading of a failed read of that section. */
  get couldNotReadWaiting() { return readStoredWord('messages.page.couldNotReadWaiting') },
  /** The heading over the messages of the reader's own day, and of the day before. */
  get today() { return readStoredWord('messages.page.today') },
  get yesterday() { return readStoredWord('messages.page.yesterday') },
} as const

/**
 * EVERY WORD A MESSAGE'S OWN PAGE SAYS THAT IS NOT ALREADY SAID ELSEWHERE.
 *
 * Criterion E2, point 3, gives some kinds an entry and a page of their own.
 * The page at `#/message/<id>` draws one message as a thing of its own, and the words it needs
 * beyond the pool page's — the three section headings, the three labels under the letter, and the
 * two links out of what the message is about — live here, beside `CHAT_WORDS` and `MESSAGES_PAGE`,
 * for the reason those do: the same fact must not get a second wording on the next screen.
 *
 * NOTHING HERE REPEATS A WORD THAT ALREADY EXISTS. The delivery words come from `DELIVERY`, the
 * group sentence from `MESSAGES_PAGE.toAGroup`, the press onto a conversation from
 * `MESSAGES_PAGE.openItWhereItIsRead`, the writer's name from `theWritersName`,
 * and the two links out of a comment from `CHAT_WORDS.aboutThePlace` and `MESSAGES_PAGE.openTheRecord`.
 */
export const MESSAGE_OWN_PAGE = {
  // EVERY WORD HERE IS READ FROM THE WORD LISTS (section R8b of src/shared/words), in the page's
  // language in a browser and in English under Node. A name is content and is never translated.
  /** The heading of the panel holding the letter and who sent it. */
  get saysTitle(): string { return readStoredWord('unrowedPages.message.saysTitle') },
  /** The heading of the panel holding who received it and how far it got. */
  get wentTitle(): string { return readStoredWord('unrowedPages.message.wentTitle') },
  /** The heading of the panel holding the run, the message and the place this one points at. */
  get aboutTitle(): string { return readStoredWord('unrowedPages.message.aboutTitle') },
  /** The three labels on the line under the letter. */
  get fromLabel(): string { return readStoredWord('unrowedPages.message.from') },
  get toLabel(): string { return readStoredWord('unrowedPages.message.to') },
  get sentLabel(): string { return readStoredWord('unrowedPages.message.sent') },
  /** Said where the message has a title and no letter under it. */
  get noBody(): string { return readStoredWord('unrowedPages.message.noBody') },
  /** The press onto the group conversation this message belongs to, where it is one. */
  openTheGroup: (name: string): string => readStoredWord('unrowedPages.message.openTheGroup', { name: content(name) }),
  /** The link to the run this line is about, where the office wrote it about one. */
  get theRunItIsAbout(): string { return readStoredWord('unrowedPages.message.theRunItIsAbout') },
  /** The link to the message this line is about, where the office wrote a notice about one. */
  get theMessageItIsAbout(): string { return readStoredWord('unrowedPages.message.theMessageItIsAbout') },
  /**
   * WHY THE PANEL SHOWS ONLY THE SHORT MARK WHEN THE MESSAGE POINTS AT NOTHING ELSE. A message that
   * is neither a comment nor about a run has no link to draw; the mark says nothing is there, and
   * this sentence, on hover, says why (the fifth invariant).
   */
  get aboutNothing(): string { return readStoredWord('unrowedPages.message.aboutNothing') },
  /** Why a comment's place is not drawn: the record it names is not in this project. */
  get placeNotHeld(): string { return readStoredWord('unrowedPages.message.placeNotHeld') },
}

/**
 * WHAT THE REPORTS AND NOTES PAGE SAYS WHEN IT CANNOT READ THE MESSAGE POOL.
 *
 * Here rather than in the page, for the reason `CHAT_WORDS` above is here: whether a message has
 * been read is the pool's fact, and two screens wording the same failure differently is how one
 * fact comes to have two accounts. The page draws its rows without it and says this, rather than
 * drawing an empty band that would read as nothing waiting on anybody.
 */
export const POOL_COULD_NOT_BE_READ = {
  /** The heading of the failure. */
  label: 'The messages could not be read.',
  /** What it means for the rows underneath. */
  because:
    'Which messages are yours and which you have read is held by the message pool, and this request failed. The ' +
    'rows below are every message and note in this project, and none of them says whether it has been read: that ' +
    'is a failed request, not a page with nothing waiting on it.',
} as const

/**
 * EVERY WORD THE CARD BESIDE AN AGENT'S COMMENT SAYS.
 *
 * Here rather than in the component for the reason `CHAT_WORDS` is: a sentence written in a
 * component is a sentence one screen says, and the same fact gets a second wording on the next
 * screen.
 */
export const SAID_HERE = {
  /** The press that boxes the thing the comment is about. */
  showMe: 'Show me where',
  /** What the box to answer in says before anybody has typed. */
  answerPlaceholder: 'Answer this',
  /** The press that sends the answer. */
  answer: 'Answer',
  /** Said under an answer that has been written down and is waiting for the agent. */
  waiting: 'Sent. This is waiting for the agent to be given it.',
  /**
   * Drawn where a name would be when neither registry answers for whoever wrote something.
   *
   * The id is NOT drawn instead. An id is a machine word, and a machine word where a name belongs
   * is the thing `tests/the-machine-word-gate.test.ts` exists to stop: a reader cannot tell it from
   * a name, and it says nothing about who wrote this.
   */
  writerNotInAnyRegistry: 'Nobody in the registries answers for whoever wrote this.',
} as const

/**
 * EVERY WORD ABOUT BEING LED TO A PAGE BY AN AGENT.
 *
 * A right-click anywhere lets an agent take the reader to a report. And criterion M8: nothing moves
 * the page without the person either pressing the
 * offer or having said they are following that agent, and there is a way to stop at all times.
 */
/**
 * WHAT PROGRAM IS WRITING: a browser's name, or an agent's runtime. Criterion M63.
 *
 * Criterion M63 holds the person's question: can Mole Office tell which machine a message came from? A message
 * says where it was written from, and that is two facts. WHICH MACHINE is measured — see
 * `machineOfCaller` in ./machines.ts, which reads the listener and the caller's address and never a
 * header. WHICH PROGRAM cannot be: nothing on this side of the connection can tell Chrome from
 * Firefox, or a browser from `curl`, except by being told.
 *
 * SO IT IS TOLD, AND IT IS NEVER READ AS AUTHORITY. Nothing is attributed to it, nothing is filed
 * under it and no check consults it: it is a line beside a message saying what the writer said it
 * was writing in. A caller that lies here puts a wrong word on its own message and changes nothing
 * else. That is why it may be a header at all, and it is the same argument `CLIENT_ADDRESS_HEADER`
 * above makes for itself.
 *
 * IT IS ON `READ_HEADER_NAMES` BECAUSE IT IS THIS PRODUCT'S OWN NAME. `x-mole-office-porgram` is a
 * near-miss of a Mole Office header, and the list exists so that a near-miss is refused rather than
 * dropped in silence. A message that quietly lost where it was written from would be a message
 * saying nothing about its origin, which is indistinguishable from one written by something that
 * never says.
 */
export const PROGRAM_HEADER = 'x-mole-office-program'

/** The terminal mark uses the same English word list as the page. */
export function firstInQueueMark(): string {
  return readStoredWord('chat.urgent.mark')
}

/**
 * A MESSAGE SENT AS AN EMERGENCY, AND WHAT THAT MEANS ON EACH SIDE. Criterion M62.
 *
 * On the agent side, a message jumps the queue where that can be done. Where it cannot, it goes
 * first among the messages to that agent and is marked as going first.
 *
 * TWO HALVES, AND WHICH ONE AN AGENT GETS IS NOT A CHOICE ANYBODY MAKES. It is read off
 * `HOW_TO_WAKE` in ./waking.ts, which says per runtime whether a session that is already running
 * can be reached, and says it with the version and the date it was measured on. Where it can, the
 * waiter reaches it. Where it cannot, the message goes FIRST among that agent's messages and says
 * so on its face. Nothing here decides that; `whatAnUrgentMessageGets` below reads it.
 *
 * "WAKE" AND NOT "INTERRUPT", BECAUSE THAT IS WHAT WAS MEASURED. `HOW_TO_WAKE` says a session
 * HOLDING ITS HANDLE can be reached: OpenCode takes the text straight into a running session, and
 * Claude Code is invoked again when the waiter exits. NEITHER STOPS A TURN THAT IS ALREADY RUNNING,
 * and nothing here should be read as claiming otherwise. A run the message worker started is
 * reached by neither: it is one process per message, and the front of the queue is all it gets.
 *
 * FOR A PERSON there is no queue, so urgency is a dialogue in the page with everything behind it
 * blurred, dismissed by one press.
 */
export const URGENT_WORDS = {
  /**
   * WHAT THE SECOND WAY TO SEND IS CALLED: Inject.
   *
   * It replaced "Send as an emergency" in the composer. The old sentence is still what the option
   * MEANS and is kept below, as the line the pointer resting on it shows, because M67 says the
   * explanation goes from under the option and may stay as hover text.
   */
  sendItUrgently: 'Inject',
  /** What the press that opens the ways to send is called aloud. */
  showTheUrgentOption: 'More ways to send',
  /**
   * WHAT INJECT DOES, shown only when the pointer rests on it. Criterion M67: the explanation under the
   * option goes, and is shown on hover or not at all. It is not drawn as a line under the option any more.
   */
  onlyForAnEmergency: 'Emergencies only. It goes in front of everything else waiting for them.',
  /** The ordinary way to send, named in the same menu so the two ways read as a pair. */
  sendItOrdinarily: 'Send',
  /** What that menu is for, read out by a screen reader. */
  waysToSend: 'How this message is sent',
  /** The press that dismisses the dialogue a person is shown. */
  dismiss: 'Dismiss',
  /** What the dialogue calls itself, for a reader who hears the page rather than sees it. */
  dialogueName: 'An emergency message',
  /**
   * HOW MANY MORE ARE WAITING BEHIND THE ONE ON SCREEN. Drawn only when there is at least one.
   *
   * Two emergencies are two dialogues to answer rather than one stack to read, so they are shown
   * one at a time — and a reader who is not told there is another will think they have finished.
   */
  moreAfterThisOne: (many: number): string => `${String(many)} more after this one.`,
} as const

/**
 * THE DELIVERY ENVELOPE: THE LINES EVERY HAND-OVER OF A MESSAGE CARRIES.
 *
 * The office's repetitive messages cost tokens for nothing, and a
 * bridge wraps each one in a preamble of its own. There was no envelope at all before this: the run
 * prompt named the sender and the waiter did not, so the same hand-over said two different things in
 * two places. Invariant 9 — one fact is worked out in one place.
 *
 * THE THREE LINES ARE WHO SENT IT, WHICH PROJECT IT IS FILED IN, AND WHICH MESSAGE IT ANSWERS. They
 * are declared once here and built by `deliveryEnvelope` below, which the run prompt
 * (src/worker/prompt.ts), the office's waiter (tools/hold-the-handle.mjs) and the dsh hook
 * (tools/dsh-hooks/office.mjs) call. A bridge
 * fetches the waiter from `GET /api/handles/waiter` and copies these lines verbatim, so it needs no
 * preamble of its own.
 *
 * THE FOURTH LINE IS THE ROUTED LINE, AND ONLY A HAND-OVER TO A ROUTED RECIPIENT GETS IT. When the addressee could
 * not be reached, the office also gave the words to the first reachable participant up its chain of
 * starters. A hand-over to that participant is told so;
 * a hand-over to the addressee is not. The line itself is built once, by `theRoutedLine` above, and
 * this is only where it is placed.
 *
 * A LINE SAYING HOW THE SENDER ASKS TO BE ADDRESSED COMES RIGHT AFTER WHO SENT IT, and only when the sender has set
 * at least one part. Agents address people as they wish to be addressed. A sender who set
 * nothing gets no line, not a line saying so.
 *
 * A MESSAGE SENT TO A GROUP OPENS WITH A LINE NAMING THE GROUP, before WHO SENT IT.
 * Item 5 of a decision: a group message handed over looked exactly like a direct one, so agents answered the person
 * privately. The line names the group by its title and asks for the answer in that group
 * (chapter 7 rule 4), in English and in Chinese. A direct message has no such line. The office reads the group in
 * src/server/lib/who-sent-it.ts, and the doors that hand a message over carry what it read as `fromGroup`.
 *
 * THE LINES ARE NOT A SENTENCE, so nothing here ends in a full stop; the message's own words come
 * after the last line. The group line is the one exception: it holds sentences in two languages.
 */
/**
 * THE GROUP A HANDED-OVER MESSAGE WAS SENT TO, as the office read it. `name` is the group's title, or
 * null because no group row answers to the stored id.
 */
export interface TheGroupOfAHandOver {
  id: string
  name: string | null
}

/**
 * WHAT THE OFFICE FOUND WHEN IT READ A MESSAGE'S SENDER IN ITS REGISTRIES.
 *
 * `nobody-was-recorded`: the message has no `sentBy`, because its writer answered to no registry row
 * when it was written. `nobody-could-be-named`: the message has a `sentBy`, and no row answers to it
 * or more than one does; `answering` says how many.
 */
export type TheSenderAsRead =
  | { found: 'nobody-was-recorded' }
  | { found: 'a-person'; id: string; name: string }
  | { found: 'an-agent'; id: string; handle: string; name: string; retired: boolean; retiredAt: string | null }
  | { found: 'nobody-could-be-named'; kind: ParticipantKind; stored: string; answering: number }

/** The words and quotes of a message, in the order an agent is to read them. */
export function theMessageAnAgentReads(body: string, quotes: readonly Context[], positions: readonly number[] | null): string {
  return theMessageInOrder(body, quotes, positions).map((part) => {
    if (part.kind === 'words') return part.text
    const source = nameTarget(part.quote.target)
    const words = wordsNamedBy(part.quote)
    if (words === null) return sayInEnglish('agent.quote.empty', { source })
    const field = spanNamedBy(part.quote)?.field
    const start = field === undefined
      ? sayInEnglish('agent.quote.from', { source })
      : sayInEnglish('agent.quote.fromField', { source, field })
    return [start, ...words.split('\n').map((line) => `> ${line}`), sayInEnglish('agent.quote.end')].join('\n')
  }).join('\n')
}

export const DELIVERY_ENVELOPE = {
  /**
   * THE GROUP THE MESSAGE WAS SENT TO, and where to answer it, in English and in Chinese, by item 5 of a
   * decision. Where no group row answers to the stored id, the line says so and keeps the id.
   */
  fromAGroup: (group: TheGroupOfAHandOver): string =>
    group.name === null
      ? `FROM A GROUP: this message was sent to a group Mole Office could not read (group id ${group.id}). ` +
        `Answer it in that group, not privately: POST /api/records with ${theBodyThatWritesAMessage({ toGroup: group.id }, '<your answer>')}. ` +
        `这是一个群里的消息（群 id ${group.id}），请回到这个群里回复，不要私下回复。`
      : `FROM A GROUP: this message was sent to the group "${group.name}" (group id ${group.id}). ` +
        `Answer it in that group, not privately: POST /api/records with ${theBodyThatWritesAMessage({ toGroup: group.id }, '<your answer>')}. ` +
        `这是"${group.name}"群里的消息，请回到"${group.name}"群里回复，不要私下回复。`,
  /** Who wrote the message, in the words `theSender` below built from the registries. */
  whoSentIt: (from: string): string => `WHO SENT IT: ${from}`,
  /**
   * THE SENDER IN WORDS, from what the office read in its registries. Problem ynGL0myEnAbi.
   *
   * An agent's id has been minted since wave 13b, so the id alone no longer tells a reader who wrote.
   * An agent is said by its handle, then its name and its id in brackets. A person is said by name,
   * with the id in brackets. The id stays, because it is what an answer is addressed to.
   *
   * WHERE NOBODY COULD BE NAMED, the words say so and keep the stored id. They never guess a name.
   * The office works this out in src/server/lib/who-sent-it.ts, and the doors that hand a message
   * over carry the result, so the waiter, the dsh hook and the run prompt print the same line.
   */
  theSender: (read: TheSenderAsRead): string => {
    if (read.found === 'nobody-was-recorded') return 'nobody the registries know'
    if (read.found === 'a-person') return `person ${read.name} (id ${read.id})`
    if (read.found === 'an-agent') {
      const name = read.name === read.handle ? '' : `${read.name}, `
      const retired = !read.retired
        ? ''
        : read.retiredAt === null
          ? ', retired on a date nobody recorded'
          : `, retired ${read.retiredAt}`
      return `agent ${read.handle} (${name}id ${read.id}${retired})`
    }
    const word = participantWord(read.kind)
    const because =
      read.answering === 0
        ? `no ${word} in the registries answers to this stored id`
        : `${String(read.answering)} ${word}s answer to this stored id`
    return `${word} ${read.stored} (${because}, so nobody could name who sent it)`
  },
  /**
   * THE SENDER WHEN THE OFFICE DID NOT HAND OVER ITS WORDS: the stored reference, and that it was not
   * named. A caller uses this when the door's answer carried no words: the waiter, when the took door
   * refused or did not answer; the dsh hook and the worker, when an entry has no `whoSentIt`.
   */
  aSenderTheOfficeDidNotName: (sentBy: unknown): string => {
    const held = sentBy as { kind?: unknown; id?: unknown } | null | undefined
    if (held === null || typeof held !== 'object' || !isParticipantKind(held.kind) || typeof held.id !== 'string') {
      return 'nobody the registries know'
    }
    return `${participantWord(held.kind)} ${held.id} (Mole Office did not say who this is)`
  },
  /**
   * HOW THE SENDER ASKS TO BE ADDRESSED. `words` are the parts the
   * sender set, from `theAddressAsInWords` in src/shared/address-as.ts, each value as the sender wrote
   * it. The office works them out in src/server/lib/who-sent-it.ts beside the sender's name. A sender
   * who set no part gets no line at all, so this is only ever called with words.
   */
  howTheSenderAsksToBeAddressed: (words: string): string => `HOW THE SENDER ASKS TO BE ADDRESSED: ${words}`,
  /**
   * WHERE THE MESSAGE WAS WRITTEN: the project and the page, as the request that wrote it named
   * them. A message belongs to no project, so this says where it was said and nothing about
   * where to answer: an answer joins the conversation wherever it is written.
   */
  writtenIn: (where: { project?: string; page?: string }): string =>
    where.project === undefined && where.page === undefined
      ? 'WRITTEN IN: no project and no page were named when it was written'
      : `WRITTEN IN: ${where.project === undefined ? 'no project named' : `the project ${where.project}`}` +
        `${where.page === undefined ? '' : `, on the page ${where.page}`}`,
  /** The message record this hand-over is about, which is the message the answer answers. */
  whatItAnswers: (messageId: string): string => `THE MESSAGE, record ${messageId}:`,
  /** Why this hand-over's recipient got the words although it was not the addressee. */
  routedToYou: (line: string): string => `ROUTED TO YOU: ${line}`,
  /**
   * THE PERSON'S OWN LABEL ON THE MESSAGE, its word as text. It asks nothing of the agent. Its colour is only how the
   * person's own screens draw it, so the line does not say it.
   */
  thePersonsLabel: (label: MessageLabel): string => `THE PERSON'S LABEL: ${label.text}`,
  /**
   * ONE RUN OF THE PERSON'S WORDS THEY MARKED WITH A FLAG, its words quoted, then the flag's name and the instruction
   * the office handed over for it. Every frame is a sentence in src/shared/words/en-wave-14d.ts.
   */
  aMarkedPart: (part: AMarkedPartOnTheWire): string =>
    part.whatItAsks === undefined || part.whatItAsks === ''
      ? sayInEnglish('chat.markedPart', { quote: part.quote, name: part.name })
      : sayInEnglish('chat.markedPartAsks', { quote: part.quote, name: part.name, instruction: part.whatItAsks }),
  /**
   * THE WORDS A PERSON CAN SEE THAT ARE IN NO MARKED PART, quoted, and the person's own name for "No mark". One line
   * for the rest, however many runs of it there are.
   */
  theWordsWithNoFlag: (quotes: readonly string[], noMarkName: string): string =>
    sayInEnglish('chat.wordsWithNoFlag', { quotes: quotes.map((one) => `"${one}"`).join(', '), noMark: noMarkName }),
} as const

/**
 * The envelope lines, in the order every hand-over writes them.
 *
 * `message` is the message record the answer answers, `from` is who sent it in the words the office
 * handed over (`DELIVERY_ENVELOPE.theSender`), and `writtenIn` is where it was written.
 * `inProject`, the older form, is the project the message is filed in: a caller that still sends it is handed no line
 * when that is the message centre, because it says nothing about where the message was said. `addressTheSender` is how the sender asks to be addressed, in the words the
 * office handed over, or null or absent because the sender set no part or the office said nothing;
 * then there is no line for it. `routedLine` is the finished routed line for this hand-over's recipient,
 * from `theRoutedLineFor` below, or null because this recipient is not one the routing chose.
 * `fromGroup` is the group the message was sent to, as the office handed it over, or null or absent
 * because it was sent to no group; then there is no group line, and with one it is the first line.
 * `intent` is the mark the person put on the message, as stored; when it asks something its one sentence is the last
 * line (`whatTheMarkAsks` in shared/intent-mark.ts), and otherwise there is no line.
 * `label` is the person's own label on the message, as handed over; its word is one line just before the mark's
 * sentence, and a message with no label, or a value that is not one, gets no line.
 * Nothing calls the pieces separately; this is the one shape.
 */
export function deliveryEnvelope(what: {
  fromGroup?: TheGroupOfAHandOver | null
  from: string
  addressTheSender?: string | null
  writtenIn?: { project?: string; page?: string } | null
  inProject?: string
  message: string
  routedLine?: string | null
  intent?: unknown
  label?: unknown
  /** The instruction the office handed over for the message's mark, or null because it handed none. */
  whatTheMarkAsks?: string | null
  /** The instruction the office handed over for the message's own label, or null because it handed none. */
  whatTheLabelAsks?: string | null
  /** The message's own words, for the rest line a message with marked parts prints. */
  body?: string | null
  /** The parts the office handed over, in order, or null or absent because the message has none. */
  markedParts?: readonly AMarkedPartOnTheWire[] | null
  /** The person's own name for "No mark", for the rest line. */
  noMarkName?: string | null
}): string[] {
  const lines: string[] = []
  if (what.fromGroup !== undefined && what.fromGroup !== null) lines.push(DELIVERY_ENVELOPE.fromAGroup(what.fromGroup))
  lines.push(DELIVERY_ENVELOPE.whoSentIt(what.from))
  if (what.addressTheSender !== undefined && what.addressTheSender !== null && what.addressTheSender !== '') {
    lines.push(DELIVERY_ENVELOPE.howTheSenderAsksToBeAddressed(what.addressTheSender))
  }
  const where =
    what.writtenIn !== undefined && what.writtenIn !== null
      ? what.writtenIn
      : what.inProject !== undefined && what.inProject !== '' && what.inProject !== MESSAGE_CENTRE
        ? { project: what.inProject }
        : null
  if (where !== null) lines.push(DELIVERY_ENVELOPE.writtenIn(where))
  lines.push(DELIVERY_ENVELOPE.whatItAnswers(what.message))
  // THE PARTS OF THE WORDS THE PERSON MARKED, one line each in order, then one line for the words no part covers. A
  // message with no parts prints nothing here, so its hand-over is byte for byte what it was.
  const parts = Array.isArray(what.markedParts) ? what.markedParts : []
  if (parts.length > 0) {
    for (const part of parts) lines.push(DELIVERY_ENVELOPE.aMarkedPart(part))
    if (typeof what.body !== 'string' || what.body === '') {
      throw new Error(
        'deliveryEnvelope was given marked parts and no words. A message with parts always has the words the parts are ' +
          "in, so a hand-over without them would drop the line naming the words no part covers. Pass the message's " +
          'words as `body`.',
      )
    }
    const body = what.body
    const pieces = parts.map((part, index) => aPiece(body, { from: part.from, to: part.to }, String(index)))
    const rest = whatIsNotCovered(body, pieces).map((run) => body.slice(run.from, run.to))
    if (rest.length > 0) {
      lines.push(DELIVERY_ENVELOPE.theWordsWithNoFlag(rest, what.noMarkName ?? theFlagsOf(null, null).noMark.name))
    }
  }
  if (what.routedLine !== undefined && what.routedLine !== null && what.routedLine !== '') {
    lines.push(DELIVERY_ENVELOPE.routedToYou(what.routedLine))
  }
  // THE PERSON'S OWN LABEL, as its word, and its instruction right after it when the office handed one. It is
  // printed as it was handed over and never worked out here.
  const label = readMessageLabel(what.label)
  if (label.ok) lines.push(DELIVERY_ENVELOPE.thePersonsLabel(label.label))
  if (label.ok && what.whatTheLabelAsks !== undefined && what.whatTheLabelAsks !== null && what.whatTheLabelAsks !== '') {
    lines.push(what.whatTheLabelAsks)
  }
  // WHAT THE PERSON WANTS BACK, as the instruction the office handed over, last before the words. A hand-over that
  // was handed none prints none, and never falls back to a constant.
  if (what.whatTheMarkAsks !== undefined && what.whatTheMarkAsks !== null && what.whatTheMarkAsks !== '') {
    lines.push(what.whatTheMarkAsks)
  }
  return lines
}

/**
 * THE FINISHED ROUTED LINE FOR ONE HAND-OVER'S RECIPIENT, or null because that recipient is not a routed
 * `to`.
 *
 * One matcher, used by every hand-over: the run prompt's queue row, the waiter, and the dsh hooks all
 * ask this whether their recipient is one the routing also gave the message to. The entry's own
 * `line` is printed and never rebuilt, so a reader sees the words the office wrote at send time.
 */
export function theRoutedLineFor(
  one: { routed?: readonly RoutedAddressee[] },
  me: ParticipantRef | null,
): string | null {
  if (me === null) return null
  const entry = (one.routed ?? []).find((each) => each.to !== null && sameParticipant(each.to, me))
  return entry === undefined ? null : entry.line
}

/**
 * THE PRESENCE WORD FOR AN AGENT A SESSION IS ANSWERING AS. Criterion M74.
 *
 * It is green, like every other served state, but "Online" is not what a person needs to read here.
 * While an agent was getting ready to reply it showed as offline, and it came back online only once
 * it had replied. Answering is the state; offline was the mechanism showing through.
 */
export const ANSWERING_WORD = 'Answering'

/**
 * WHAT A PERSON READS AND PRESSES WHEN NOTHING IS ANSWERING AS AN AGENT. Criterion M78.
 *
 * An agent that cannot be reached must not have a new one started for it: the office asks first, and
 * only the press starts one.
 *
 * WHAT IT REPLACED. A message to an agent nobody held started a run by itself, and the run the person got
 * answered them with "This run cannot reach Mole Office", which is a sentence about a run they never
 * asked to exist. So the offer names the agent, says what the press will do, and says what happens
 * to the message if the person does not press — because the third of those is the question a person
 * actually has.
 *
 * THE WORDS ARE IN THE WORD LISTS. `readStoredWord` reads them in the page language in a browser and
 * in English under Node, so the server's refusals that quote them (src/server/lib/agents.ts and
 * `nobodyIsAnsweringAsIt` below) stay English on every path.
 */
export const CANNOT_REACH_WORDS = {
  /** The state, named as a person would say it. `who` is the agent's name, not its handle. */
  cannotReach: (who: string): string => readStoredWord('chatLive.cannotReach', { who }),
  /**
   * THE ONE PRESS IN THE CHAT THAT SUMMONS AN AGENT. Criterion M115: the chat has one press, and only
   * one, labelled "new agent", that summons a new agent in the page.
   *
   * A LABEL AND NOT A SENTENCE: it names the press, and the chooser it opens carries the words.
   */
  get newAgent() { return readStoredWord('chatLive.newAgent') },
  /** The press. A question, because pressing it makes something that was not there before. */
  get startANewAgent() { return readStoredWord('chatLive.startANewAgent') },
  /** What the press will do, shown when the pointer rests on it. */
  get whatThePressDoes() { return readStoredWord('chatLive.whatThePressDoes') },
  /** What happens if nobody presses. It is the answer to the question a person actually has. */
  get whatHappensIfNobodyPresses() { return readStoredWord('chatLive.whatHappensIfNobodyPresses') },
  /** Leaving the dialogue without pressing. Named by what it does, not by "cancel". */
  get notNow() { return readStoredWord('chatLive.notNow') },
  /** Leaving the dialogue once the press has gone through and the server has said what it did. */
  get close() { return readStoredWord('chatLive.close') },
  /** What the right-click menu calls its list of agents nothing is answering as. */
  get noneOfTheseIsAnswering() { return readStoredWord('chatLive.noneOfTheseIsAnswering') },
} as const

/**
 * WHY NO RUN WAS STARTED FOR A MESSAGE TO AN AGENT NOBODY IS ANSWERING AS. Criterion M78.
 *
 * The sentence on the delivery row, which is what a person opening the message reads, and what the
 * worker writes rather than leaving a clock nobody can explain.
 */
export function nobodyIsAnsweringAsIt(handle: string): string {
  return (
    `Nothing is answering as "${handle}": no session holds its handle and no run is going for it. Mole Office ` +
    'does not start an agent for a message by itself, because a new agent has never heard of the work and would ' +
    'answer as though it had. This message is waiting for the person to press ' +
    `"${CANNOT_REACH_WORDS.startANewAgent}" in the chat. Nothing was started.`
  )
}

/**
 * WHAT THE FIRST LINE OF A BRANCHED CONVERSATION SAYS. Criterion M80.
 *
 * It names the agent it came from, says the old conversation is whole, and says that agent answers
 * it if it comes back — which is the half a person actually worries about when they press a button
 * that makes a second agent with a similar name.
 */
export function theNewConversationCameFrom(handle: string, name: string): string {
  // STORED IN ENGLISH, from the word lists, so a page can read it back into its own language (shared/office-lines.ts).
  return theBranchedLine(sayInEnglish, name, handle).said
}

/** Why a run may start after all: the person pressed, or a secretary pressed for them under their grant, and when. */
export function thePersonAskedForARun(at: string, by: string, underThePersonsGrant = false): string {
  const under = underThePersonsGrant ? " under the person's grant" : ''
  return `${by} pressed${under} to start an agent for this message at ${at}, so a run may be started for it.`
}

/**
 * WHERE THE PRESS TO START A NEW AGENT CARRIED A MESSAGE, as the facts the press stored on it (`carriedTo`).
 * Problem hqbovBMnTu-z. `from` and `to` are registry ids; the handles are the ones the two agents bore at the
 * press, which the stored sentence names.
 */
export interface CarriedTo {
  from: string
  fromHandle: string
  to: string
  toHandle: string
  /** The copy the press made for the new agent, or null when the press made none of its own. */
  copy: string | null
  at: string
}

/** The carries stored on a message, oldest first. An entry missing a part is left out rather than guessed at. */
export function carriedToOf(data: Record<string, unknown>): CarriedTo[] {
  const stored = data['carriedTo']
  if (!Array.isArray(stored)) return []
  const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)
  const out: CarriedTo[] = []
  for (const one of stored) {
    if (typeof one !== 'object' || one === null) continue
    const it = one as Record<string, unknown>
    const [from, fromHandle, to, toHandle, at] = [text(it['from']), text(it['fromHandle']), text(it['to']), text(it['toHandle']), text(it['at'])]
    if (from === null || fromHandle === null || to === null || toHandle === null || at === null) continue
    out.push({ from, fromHandle, to, toHandle, copy: text(it['copy']), at })
  }
  return out
}

/**
 * THE WORDS FOR ONE CARRY, from its facts: the sentence on the old agent's delivery row (stored in English,
 * and the delivery mark's hover text on a page) and the visible line on the message, in the language of
 * `say`. `toName` is the new agent's name as the registry holds it now. One builder for both, so the
 * line a person reads and the sentence behind the mark cannot drift apart.
 *
 * `newerOfASharedName` is true where the new agent shares its name with an agent registered before it, which
 * is what the press usually makes. The line then says so in words, "the newer agent named …", because the
 * name alone reads as the old agent (the review of wave 13n round 35, point 7).
 */
export function theCarriedWords(
  say: Say,
  fact: Pick<CarriedTo, 'fromHandle' | 'toHandle'>,
  toName: string,
  newerOfASharedName = false,
): { line: string; sentence: string } {
  return {
    line: say(newerOfASharedName ? 'chatCarried.line.newerOfASharedName' : 'chatCarried.line', { name: toName }),
    sentence: say('chatCarried.sentence', { from: fact.fromHandle, to: fact.toHandle }),
  }
}

/** The old delivery is complete; its words stay in the old conversation. Criteria M78 and M80. Stored in English. */
export function theMessageWentToANewAgent(from: string, to: string): string {
  return theCarriedWords(readStoredWord, { fromHandle: from, toHandle: to }, to).sentence
}

/**
 * WHAT `conversation_reads.as_side` HOLDS WHEN A CONVERSATION WAS READ FROM NEITHER SIDE.
 *
 * Criterion M72. The column is not nullable and an applied migration is history, so a neutral read
 * needs a word rather than a null. A TILDE IS NOT A CHARACTER A HANDLE MAY HOLD — that is why the
 * pair key uses one — so this can never be mistaken for the id of an agent, however anybody is
 * registered later.
 */
export const NEITHER_SIDE = '~neither'

/** Whether a stored message was sent as an emergency. */
export function isUrgent(data: Record<string, unknown>): boolean {
  return data['urgent'] === true
}

/**
 * AN AGENT'S URGENT MESSAGES AHEAD OF ITS ORDINARY ONES, each group kept in the order it was given. Criterion M62.
 *
 * The queue's order (`theQueue` in src/server/lib/worker.ts) and the press to start a new agent, which carries an agent's
 * waiting messages in the queue's order, both order by this one function (wave 13y round 34). A partition and not a sort:
 * rows given oldest first stay oldest first in each group.
 */
export function urgentAtTheFront<T extends { urgent: boolean }>(inOrder: readonly T[]): T[] {
  return [...inOrder.filter((one) => one.urgent), ...inOrder.filter((one) => !one.urgent)]
}

/**
 * WHAT AN URGENT MESSAGE GETS FOR ONE RUNTIME: the interruption, or the place at the front.
 *
 * ONE READING, FROM ONE DECLARATION. `HOW_TO_WAKE` is where every claim about reaching a running
 * session lives, each with the version and date it was measured on. A second list here would be
 * free to say a runtime can be interrupted after somebody measured that it cannot.
 *
 * A RUNTIME NOBODY SET ON THE AGENT GETS THE SECOND HALF. Nothing can be interrupted through a
 * runtime nobody named, and the front of the queue is what is left — which is a real answer rather
 * than a refusal.
 */
export function whatAnUrgentMessageGets(runtime: string | null): 'wake the session' | 'first in the queue' {
  if (runtime === null) return 'first in the queue'
  const known = HOW_TO_WAKE[runtime as keyof typeof HOW_TO_WAKE] as { canBeWoken?: boolean } | undefined
  return known?.canBeWoken === true ? 'wake the session' : 'first in the queue'
}


/** Where a name put into a lead sentence starts and ends, while the sentence is being made. */
const NAME_STARTS = '\u0001'
const NAME_ENDS = '\u0002'

/**
 * A LEAD SENTENCE, ITS NAMES JOINED TO ITS WORDS BY `gapBetween` (src/shared/spacing.ts), the office's
 * one rule for where Chinese takes a space: 'Guide P 想带你去 Robotics', not 'Guide P想带你去Robotics'.
 *
 * A name is a part put into the sentence, so `gapBetween` is asked at its two edges. It is asked only
 * where the sentence's own word meets the name directly, with no space or mark between: a letter, a
 * digit or a Chinese character on the sentence's side. A space or a mark there, as every English
 * sentence has around its names ('{agent} wants to take you to {where}.'), already separates them, so
 * nothing is added and an English sentence is never changed. Nothing inside a name or a title changes.
 */
function leadSentence(key: WordKey, values: Readonly<Record<string, string>>): string {
  const marked: Record<string, string> = {}
  for (const [name, value] of Object.entries(values)) marked[name] = content(`${NAME_STARTS}${value}${NAME_ENDS}`)
  const made = readStoredWord(key, marked)
  /** A letter, a digit or a Chinese character: a word of the sentence meeting a name with nothing between. */
  const aWord = /[\p{L}\p{N}]/u
  /** The text from `at` on, without the marks that only say where a name starts and ends. */
  const from = (at: number): string => made.slice(at).replace(/[\u0001\u0002]/gu, '')
  let out = ''
  for (let at = 0; at < made.length; at += 1) {
    const here = made[at]!
    if (here === NAME_STARTS) {
      // THE SENTENCE'S SIDE is what stands before the name.
      if (aWord.test(out.at(-1) ?? '')) out += gapBetween(out, from(at + 1))
    } else if (here === NAME_ENDS) {
      // THE SENTENCE'S SIDE is what stands after the name.
      if (aWord.test(from(at + 1).slice(0, 1))) out += gapBetween(out, from(at + 1))
    } else out += here
  }
  return out
}

/** How many characters of a place's name the press on an offer draws before it cuts the name at a word. */
export const A_LEAD_PRESS_NAMES_AT_MOST = 40

/**
 * THE LEAD PANE'S WORDS. They are in the word lists (problem t_ox8XMOvu7a): `readStoredWord` reads
 * them in the page language in a browser and in English under Node. The agent's name, the place's
 * title and the project's name inside them are content.
 *
 * AN AGENT THE PAGE HAS NO NAME FOR IS SAID TO BE ONE (wave 13y round 83). Where a sentence names the
 * agent, null says that no participant the page read answers to it, and the sentence says so in its
 * own words. The pane drew the agent's id in the name's place before.
 */
export const LEADING = {
  /** The offer, drawn when the reader is not following that agent. Nothing has moved. */
  offer: (agent: string | null, where: string): string =>
    agent === null
      ? leadSentence('chatEnglish.lead.noName.offer', { where })
      : leadSentence('chatEnglish.lead.offer', { agent, where }),
  /**
   * THE ONE PRESS THAT ACCEPTS AN OFFER. It is short again:
   * the sentence above it names the place, so the press does not repeat the name. The older `takeMeTo`
   * below is kept for a caller that still wants the place in the press.
   */
  get takeMe() { return readStoredWord('chatEnglish.lead.takeMe') },
  /**
   * THE OLDER PRESS THAT NAMED THE PLACE. The lead pane no longer draws it: a long title made the press
   * the longest line in the offer, and the short "take me there" came back. The words and
   * the shortening stay because some drawings and tests still read them.
   */
  takeMeTo: (where: string): { words: string; whole: string } => {
    const place = shortenToWords(where, A_LEAD_PRESS_NAMES_AT_MOST)
    return {
      words: leadSentence('chatEnglish.lead.takeMeTo', { where: place.shortened ? `${place.words}${CUT_MARK}` : place.words }),
      whole: leadSentence('chatEnglish.lead.takeMeTo', { where: place.whole }),
    }
  },
  /** The press that turns the offer down and leaves the page where it is. */
  get notNow() { return readStoredWord('chatEnglish.lead.notNow') },
  /** WHAT NOT NOW DOES, said under the presses: the message stays unread and the offer comes back. The wait is the one value in short-lists.ts. */
  get notNowMeans() { return readStoredWord('chatEnglish.lead.notNowMeans', { minutes: String(A_PUT_OFF_OFFER_COMES_BACK_AFTER_MINUTES) }) },
  /** The right-click entry that starts following one agent. */
  followWith: (agent: string): string => leadSentence('chatEnglish.lead.followWith', { agent }),
  /** The control that is on screen the whole time somebody is following. */
  stopFollowing: (agent: string | null): string =>
    agent === null ? readStoredWord('chatEnglish.lead.noName.stopFollowing') : leadSentence('chatEnglish.lead.stopFollowing', { agent }),
  /**
   * THE WHOLE OF THE FOLLOWING STATE ON ONE LINE, for a screen with no room for the card.
   *
   * On a narrow screen the card was 90 per cent of the width and a fifth of the height, fixed, for
   * as long as the reader was following — measured at 390 by 972 on 4 September 2026, problem
   * `O184ESMBfKbN`. So on a narrow screen this line and the stop press beside it are all that is
   * drawn, and the rest is folded behind one press.
   */
  following: (agent: string | null): string =>
    agent === null ? readStoredWord('chatEnglish.lead.noName.following') : leadSentence('chatEnglish.lead.following', { agent }),
  /** The stop press on that line. `stopFollowing` above is still what the press is called aloud. */
  get stop() { return readStoredWord('chatEnglish.lead.stop') },
  /** The press that unfolds what the agent said, on a screen where it is folded away. */
  get whatItSaid() { return readStoredWord('chatEnglish.lead.whatItSaid') },
  /** The same press once the words are unfolded. */
  get foldItAway() { return readStoredWord('chatEnglish.lead.foldItAway') },
  /** Said beside the stop control, so what following means is never only in somebody's head. */
  whileFollowing: (agent: string | null): string =>
    agent === null ? readStoredWord('chatEnglish.lead.noName.whileFollowing') : leadSentence('chatEnglish.lead.whileFollowing', { agent }),
  /**
   * What is sent to the agent when somebody starts following it. A sent message is content, so this
   * and the next stay English in every page language.
   */
  startedFollowing: 'I am following you now. You may take me to what you want me to look at.',
  /** What is sent to the agent when somebody stops. */
  stoppedFollowing: 'I have stopped following you. Send me an offer and I will decide each time.',
  /** Said over the agent's own words on the page it has just taken the reader to. */
  broughtYouHere: (agent: string | null): string =>
    agent === null ? readStoredWord('chatEnglish.lead.noName.broughtYouHere') : leadSentence('chatEnglish.lead.broughtYouHere', { agent }),
  /**
   * THE PRESS THAT CLOSES THE PANE A LEAD OPENED. Criterion M95.
   *
   * The pane once had no close press, and a reload was the only way out.
   * Escape closes it as well. It closes the pane and does nothing else: nothing is sent, no mark is
   * changed, and the conversation the reader had open stays open.
   */
  get closeThePane() { return readStoredWord('chatEnglish.lead.closeThePane') },
  /** What the close press is called aloud, so a reader who cannot see it knows what it closes. */
  closeThePaneSaid: (agent: string | null): string =>
    agent === null
      ? readStoredWord('chatEnglish.lead.noName.closeThePaneSaid')
      : leadSentence('chatEnglish.lead.closeThePaneSaid', { agent }),
  /** Drawn where the title of the place would be when nothing in this project answers to it. */
  get somewhereUnknown() { return readStoredWord('chatEnglish.lead.somewhereUnknown') },
  /**
   * WHERE A LEAD GOES, WHEN IT GOES TO ANOTHER PROJECT. Criterion M60.
   *
   * A person's screen is not held to one project, so an agent may offer to take them anywhere they
   * may go. The reader has to be told that the offer moves their project as well as their page,
   * BEFORE they press it — that is the whole of the consent M8 asks for, and it is the one thing
   * about a cross-project lead a reader cannot see for themselves.
   *
   * THE PROJECT COMES FIRST, AND THAT IS WHY. On a narrow screen the offer is one truncated line
   * (`px-lead-one-line`), and at 390 the address of a page fills it: with the project written after
   * the place, the half a reader cannot work out for themselves was the half cut off. Measured in
   * Chromium at 390 on 6 September 2026.
   */
  inAnotherProject: (where: string, project: string): string =>
    leadSentence('chatEnglish.lead.inAnotherProject', { where, project }),
  /**
   * WHAT A PAGE A LEAD NAMES SHOWS, when its address names one record. Problem 30fVQwjGa3Qb.
   *
   * The address of a page is not a name a person reads, so the offer names the record the page shows:
   * its kind and its title. The title is the record's own words and is never translated. `kind` is
   * the kind's word in the page language.
   */
  theDrawingOf: (kind: string, title: string): string =>
    readStoredWord('leadPlace.drawingOf', { kind, title: content(title) }),
  /** The same page, when no title is known here: not read yet, not found, or the read failed. */
  aDrawingWithNoTitle: (kind: string): string => readStoredWord('leadPlace.aDrawingWithNoTitle', { kind }),
  /** A record's own page, by its kind and its title. */
  theRecord: (kind: string, title: string): string =>
    readStoredWord('leadPlace.record', { kind, title: content(title) }),
  /** A record's own page, when no title is known here. */
  aRecordWithNoTitle: (kind: string): string => readStoredWord('leadPlace.aRecordWithNoTitle', { kind }),
  /** The kind word when the address does not say the kind and nothing was read: `#/r/<id>`. */
  get aRecord() { return readStoredWord('leadPlace.aRecord') },
  /** In developer mode, the place and the address it is at. */
  withAddress: (place: string, route: string): string =>
    readStoredWord('leadPlace.withAddress', { place: content(place), route: content(route) }),
} as const

/**
 * WHY A STATE MAY BE OUT OF DATE, drawn beside a dead agent's own words about itself.
 *
 * A state is self-set (part 2a), so an agent whose run has died leaves its last state standing.
 * The panel draws the words it wrote and says, beside them, that nothing is running to change them.
 */
export const STATE_IS_STALE =
  'These are the words this agent last wrote about itself. Nothing serving it is running now, so nothing has ' +
  'changed them since.'

/** The kind word for a participant, for a label a reader gets. */
export function participantKindWord(kind: ParticipantKind): string {
  return kind === 'person' ? 'person' : 'agent'
}

// ============================================================ a draft belongs to one conversation

/**
 * WHERE THIS BROWSER KEEPS WHAT SOMEBODY HAS TYPED INTO THE CHAT AND NOT SENT. Criterion M98.
 *
 * Text typed for one contact stayed in the box for the next, with no draft kept apart.
 * The composer held ONE string for the whole panel, so opening
 * another contact showed the words meant for the first one, and the next Send sent them to the
 * wrong reader.
 *
 * IT IS THIS BROWSER'S SESSION STORAGE AND NOT THE SERVER. An unsent message is not a message: the
 * server holds no row for it, nobody is waiting on it, and it must never reach anybody by itself.
 * Session storage is what the criterion asks for, and it also means a second tab keeps its own
 * drafts rather than two tabs writing over each other.
 */
export const CHAT_DRAFTS_KEY = 'mole-office.chat.drafts'

/**
 * WHICH CONVERSATION IN THE CHAT PANEL A DRAFT BELONGS TO.
 *
 * Three shapes, because the panel has three composers: a contact (a person or an agent), a group,
 * and a writer nobody registered. Their keys cannot collide: each carries the word saying which of
 * the three it is.
 */
export type WhichChatConversation =
  | { what: 'contact'; who: ParticipantRef }
  | { what: 'group'; id: string }
  | { what: 'unregistered'; key: string }

/**
 * THE ONE SPELLING OF A CONVERSATION'S KEY, so the panel and a test cannot come to two.
 *
 * A contact's key is `participantKey` with the word `contact` in front of it, which is the spelling
 * every other list in this panel already uses for a participant.
 */
export function chatDraftKey(which: WhichChatConversation): string {
  if (which.what === 'group') return `group:${which.id}`
  // ALREADY NAMESPACED. `unregisteredKey` begins every such key with UNREGISTERED_PREFIX, so
  // putting the word in front of it again would spell one conversation two ways.
  if (which.what === 'unregistered') return which.key
  return `contact:${participantKey(which.who)}`
}

/**
 * WHAT A STORED SET OF DRAFTS READS AS, or null when this build has no meaning for it.
 *
 * A stored value that is not a plain object of strings is refused outright rather than half-read.
 * The words are a person's own, so half of them is worse than none: the box would be filled with
 * somebody else's sentence and nothing would say so. The caller drops the whole set and says the
 * words will not survive a reload.
 */
export function chatDraftsFromStored(text: string): Record<string, string> | null {
  let parsed: unknown = null
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== 'string') return null
    if (value !== '') out[key] = value
  }
  return out
}

/**
 * THE SET WITH ONE CONVERSATION'S DRAFT WRITTEN INTO IT, or taken out once it is empty.
 *
 * AN EMPTIED BOX TAKES THE ROW OUT rather than storing an empty string. A conversation nobody has
 * typed into and one somebody has emptied draw the same box, so storing them differently would be a
 * fact with nothing reading it, and it would grow the store by one row for every contact ever
 * opened.
 */
export function withTheChatDraft(
  held: Readonly<Record<string, string>>,
  key: string,
  body: string,
): Record<string, string> {
  const out = { ...held }
  if (body === '') delete out[key]
  else out[key] = body
  return out
}

/**
 * THE FIRST WORDS OF A DRAFT OR OF THE LAST MESSAGE, for one line of a contact's row. Criterion M99.
 *
 * IT CUTS ON CHARACTERS AND NOT ON WORDS, because the line it feeds is cut again by the browser
 * with an ellipsis and this only has to stop a thousand-character message reaching the row at all.
 * A body is drawn on one line, so its own line breaks become spaces here.
 */
export function firstWordsOfAMessage(body: string, most = 120): string {
  const oneLine = body.replace(/\s+/g, ' ').trim()
  return oneLine.length <= most ? oneLine : `${oneLine.slice(0, most - 1)}…`
}

/**
 * WHEN A CONTACT LAST SPOKE, in the few characters a row has room for. Criterion M99.
 *
 * THREE ANSWERS, BECAUSE THE TIME ALONE WOULD LIE. The person's picture shows `11:44` beside the name, and a
 * chat where every row says a time makes a message from last week look like one from this morning.
 * So: the time today, the month and day this year, the whole stamp before that. The product writes
 * stamps as `YYYY-MM-DD HH:MM:SS` in local time (src/shared/time.ts), so `MM-DD` reads the same way
 * round as every other date on these screens.
 *
 * A STAMP THIS FUNCTION CANNOT READ IS HANDED BACK AS IT CAME, rather than drawn as a time it is
 * not. `now` is passed in so a test can put the question without waiting for midnight.
 */
export function whenAContactLastSpoke(sentAt: string, now: string): string {
  const day = sentAt.slice(0, 10)
  const time = sentAt.slice(11, 16)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return sentAt
  if (day === now.slice(0, 10)) return time === '' ? sentAt : time
  if (day.slice(0, 4) === now.slice(0, 4)) return day.slice(5)
  return day
}

/** A message whose words were changed: when, by whom, and the words as first written, by point 2
 * of a decision. */
export interface MessageEdited {
  at: string
  by: ParticipantRef | null
  original: { title: string | null; body: string | null }
}

/**
 * THE EDIT MARK A MESSAGE'S DATA HOLDS, or null because it holds none. The record door writes `data.edited` as
 * `{at, by, original: {title, body}}` (`whatAChangeToAMessageMustCarry` in server/lib/records.ts). A mark with no time
 * is no mark, because a screen could not say when.
 */
export function editedOf(data: Record<string, unknown>): MessageEdited | null {
  const mark = data['edited']
  if (typeof mark !== 'object' || mark === null || Array.isArray(mark)) return null
  const held = mark as Record<string, unknown>
  if (typeof held['at'] !== 'string' || held['at'] === '') return null
  const by = held['by']
  const original = typeof held['original'] === 'object' && held['original'] !== null ? (held['original'] as Record<string, unknown>) : {}
  return {
    at: held['at'],
    by:
      typeof by === 'object' && by !== null && isParticipantKind((by as Record<string, unknown>)['kind']) && typeof (by as Record<string, unknown>)['id'] === 'string'
        ? { kind: (by as { kind: ParticipantKind })['kind'], id: (by as { id: string })['id'] }
        : null,
    original: {
      title: typeof original['title'] === 'string' ? original['title'] : null,
      body: typeof original['body'] === 'string' ? original['body'] : null,
    },
  }
}
