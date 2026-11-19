// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE A MESSAGE HAS GOT TO BETWEEN MOLE OFFICE AND ITS RECIPIENT. One store, one writer, one reader.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * "This comment has gone out" was written down in two places. `agent_messages.state` said it about
 * a message, and `records.data.state` said it about the comment record those words came from. The
 * second was stamped from the BROWSER, after the send, inside a `try/catch` whose failure was
 * reported as `notStamped` and changed nothing — so a comment could be out and still read `queued`,
 * and the gate that fixes somebody's words read the one that could be wrong. It could also be
 * walked back: measured on 19 August 2026, three writes and three 200s put a sent comment back to
 * `queued`, rewrote the body and marked it sent again.
 *
 * There is now one store. It is `agent_messages.state`, this file is the only thing that writes it,
 * and everything that used to ask the record field asks this file instead. The server asks
 * `hasGoneOut`. The browser cannot open the database, so it is TOLD: `GET /api/agent/marks` carries
 * the comments in the project whose words have been given to somebody, and `commentsGoneOut` below
 * is what answers that.
 *
 * THAT SENTENCE WAS TRUE OF THE SERVER AND FALSE OF THE BROWSER UNTIL 25 AUGUST 2026, and it was
 * written here, in the file a reader checks first, which is why the second reader survived a whole
 * wave. `src/web/components/agent/marks.ts` still read `record.data.state` to decide which of a
 * person's comments were drawn on the thing they were left on and which counted as sent. Nothing
 * wrote `sent` there any more, so a comment that had gone out was drawn as still waiting for ever;
 * and a comment written the way `GET /api/kinds` now instructs carries no state at all, so it was
 * dropped by that reader — drawn nowhere, and not counted as unreadable either. Deleting every
 * writer of a store while leaving a reader on it is what makes a field frozen rather than gone.
 *
 * ---------------------------------------------------------------------------------------
 * SIX WORDS, AND THEY ONLY EVER MOVE FORWARD
 * ---------------------------------------------------------------------------------------
 *
 *   queued     written into a conversation. NOBODY HAS PRESSED SEND. Not a dispatch, and in no
 *              inbox. It is the one word in which the words may still be changed or deleted.
 *   sent       Mole Office has durably accepted it and it is in an agent's inbox. `sent_at` is written
 *              here, once, and never again.
 *   delivered  a live listener, or a worker claiming a run, has been handed it.
 *   picked_up  the receiving agent said, by id, that it has it.
 *   handled    the receiving agent said what it did with it.
 *   failed     it was tried and could not be finished. `failed_because` says why.
 *
 * `answered` is gone. It meant what `handled` means. Measured on a copy of the owner's corpus taken
 * 25 August 2026: `agent_messages` holds 1 row, it reads `sent`, and NO row anywhere reads
 * `answered`, so nothing in the corpus changes meaning by the word going.
 *
 * **The seventh word is computed and is never stored.** *Needs attention* means Mole Office cannot go
 * further without a person: nobody was chosen, or the choice cannot be resolved. That is a fact
 * about `recipient_kind` and `recipient_agent_id`, so storing it would be a second copy of them.
 *
 * ---------------------------------------------------------------------------------------
 * TWO GUARDS, BECAUSE ONE OF THEM CAN BE WALKED PAST
 * ---------------------------------------------------------------------------------------
 *
 * `tests/one-dispatch-door.test.ts` reads every file under `src/` and fails if a second function
 * updates `agent_messages.state`. A SOURCE SCAN CANNOT SEE AN ALIAS: `const t = agentMessages;
 * db.update(t).set({state:'sent'})` is invisible to it, and the scan's own comment says so.
 *
 * So the scan is paired with a guard that fires when the code RUNS. `installDispatchDoorGuard`
 * below puts a temporary SQLite trigger on `agent_messages` that refuses any statement setting
 * `state` unless `moveMessageTo` is the caller — which it knows because `moveMessageTo` is the only
 * thing that opens the door, and it closes it in a `finally`. An aliased update anywhere else
 * aborts with a message naming this file.
 *
 * NEITHER GUARD IS THE WHOLE ANSWER AND BOTH ARE KEPT. The scan catches code that never runs in a
 * test; the trigger catches code the scan cannot read. A mutation planted on a cold branch is seen
 * by the scan alone, and one written through an alias on a hot path is seen by the trigger alone.
 */

import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { messagesInTheViewOf } from './message-centre.ts'
import { db, sqlite } from '../db/client.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { EVERY_PROJECT, type WhichProjects } from '@shared/which-projects.ts'
import { narrowedToProjects } from '@shared/which-projects-sql.ts'
import { MESSAGE_CENTRE } from '@shared/workspaces.ts'
import { agentMessages, annotationWordsFixed, records } from '../db/schema.ts'
// LOCAL WALL CLOCK, from the one reader and writer of a stamp in this product. Taken from
// `@shared/time.ts` and not from `lib/records.ts` — which re-exports the same function — because
// that file imports this one for `hasGoneOut`, and a module that runs a trigger install at import
// should not sit inside a longer import cycle than it has to.
import { nowStamp } from '@shared/time.ts'
import type { Context } from '@shared/targets.ts'
import { PanelError } from './panel-error.ts'

// ============================================================================ the six words

/**
 * Where a message has got to. See the block at the top of this file for what each word means.
 *
 * IT IS DECLARED HERE AND NOT IN lib/agents.ts, WHERE IT USED TO BE, because the file that holds
 * the only writer of a column is the file that should hold the list of words that column may take.
 * `lib/agents.ts` re-exports it under the name every caller already imports, so there is one
 * declaration and no second list to disagree with it.
 */
export const MESSAGE_STATES = ['queued', 'sent', 'delivered', 'picked_up', 'handled', 'failed'] as const
export type MessageState = (typeof MESSAGE_STATES)[number]

/**
 * How far along each word is, so "forward" is a comparison and not a list of allowed pairs.
 *
 * `handled` and `failed` are both ends and share a rank, which is what makes a move between them a
 * move that is not forward. A message that was handled did not later fail, and one that failed was
 * not later handled: whichever happened is what happened, and the other would be a rewrite.
 */
const HOW_FAR: Readonly<Record<MessageState, number>> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  picked_up: 3,
  handled: 4,
  failed: 4,
}

/** Whether a stored string is one of the six. Anything else is a fault, never a default. */
export function isMessageState(value: unknown): value is MessageState {
  return typeof value === 'string' && (MESSAGE_STATES as readonly string[]).includes(value)
}

/**
 * THE ONE READER OF THE STORED WORD.
 *
 * A row whose column holds something that is not one of the six is a fault and says so. It is not
 * read as `queued`, because a message read as waiting is a message a screen offers to send again.
 */
export function deliveryWordOf(row: { id: string; state: string }): MessageState {
  if (isMessageState(row.state)) return row.state
  throw new PanelError(
    `Message ${row.id} stores "${row.state}" where Mole Office keeps how far a message has got, and that is not one of ` +
      `the six words it uses (${MESSAGE_STATES.join(', ')}). Nothing has been guessed at.`,
    500,
  )
}

/**
 * WHETHER A MESSAGE HOLDING THIS WORD OWES THE MOMENT IT GOT THERE.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE PLACE THIS IS DECIDED, AND WHAT IT COST TO HAVE TWO
 * ---------------------------------------------------------------------------------------
 *
 * `queued` is the only word that owes nothing: nothing has happened to those words yet, and
 * `created_at` already says when they were written. Every other word means somebody has been given
 * them, and the moment that happened is part of the word rather than a decoration on it — the age
 * of a wait is read off `sent_at`, and a message past `queued` with no `sent_at` is a message
 * nothing can say how long has been waiting.
 *
 * IT USED TO BE WRITTEN OUT IN THREE PLACES AND THEY DISAGREED. `moveMessageTo` below wrote
 * `sent_at` when the word it moved to was the literal `sent`; `src/server/lib/agents.ts` wrote an
 * agent's answer straight into the table as `sent` with `sent_at` NULL, under a comment saying
 * nothing in this build wrote that column; and `src/server/db/agent-identity.ts` reads every row
 * past `queued` with no `sent_at` as one a migration must date. So one answer posted by
 * `tools/agent-worker.mjs` — the shipped worker, `npm run agent` — left a row all three described
 * differently, the migration could not date it from any run, and the NEXT SERVER START DIED. Not
 * refused: an uncaught throw, so the owner got a stack instead of a sentence.
 *
 * The three uses now read this one function: the move below writes the moment on the first move
 * past `queued`, `theMomentsOfAMessageWrittenAt` builds the columns for a row born past it, and
 * `refuseAMessageThatOwesAMoment` is what the one insert door asks before writing.
 *
 * IT IS ASKED OF THE WORD AND NOT OF THE ROW, so a word added to `MESSAGE_STATES` gets an answer
 * here rather than a silence.
 */
export function aMomentIsOwedBy(word: MessageState): boolean {
  return word !== 'queued'
}

/** The three columns that say where a message has got to, for a row being written for the first time. */
export interface WhereAMessageStarts {
  state: MessageState
  stateAt: string | null
  sentAt: string | null
}

/**
 * THE THREE COLUMNS A MESSAGE ROW IS BORN WITH, given the word it is born holding.
 *
 * A message written straight into the table — an agent's answer is the only one today — never
 * passed through `moveMessageTo`, so nothing else would ever write its moments. It is born with
 * them or it is born broken, and `aMomentIsOwedBy` above is what decides which columns it takes.
 *
 * `stateAt` and `sentAt` are the same moment here and they are not the same fact: `state_at` moves
 * on with the word, and `sent_at` is the age of the wait and is written once. For a row born past
 * `queued` they start together because it got to that word by being written.
 */
export function theMomentsOfAMessageWrittenAt(word: MessageState, at: string): WhereAMessageStarts {
  const owed = aMomentIsOwedBy(word)
  return { state: word, stateAt: owed ? at : null, sentAt: owed ? at : null }
}

/**
 * What is wrong with the moments on a message row about to be inserted, or null.
 *
 * ASKED BY THE ONE INSERT DOOR, `writeMessage` in src/server/lib/agents.ts, so a row that owes a
 * moment and carries none cannot be written at all. That is the structural half of the fix: the
 * sentence above can go stale, and this cannot.
 */
export function refuseAMessageThatOwesAMoment(row: {
  id: string
  state: string
  stateAt: string | null
  sentAt: string | null
}): void {
  const word = deliveryWordOf(row)
  if (!aMomentIsOwedBy(word)) return
  if (row.sentAt !== null && row.stateAt !== null) return
  throw new PanelError(
    `Message ${row.id} is being written as "${word}", which means somebody has been given it, and it carries ` +
      `${row.sentAt === null ? 'no moment it was accepted' : 'no moment it reached that word'}. Only "queued" owes ` +
      `no moment. Nothing was written. A row like this cannot be dated afterwards from anything else in the ` +
      `corpus, and one of them stopped a server starting — see \`aMomentIsOwedBy\` in src/server/lib/dispatch.ts.`,
    500,
  )
}

/** The words that mean this message is in somebody's inbox and nobody has finished with it. */
export const WAITING_WORDS: readonly MessageState[] = ['sent', 'delivered', 'picked_up']

/** The words that mean nobody is waiting for this any more. */
export const FINISHED_WORDS: readonly MessageState[] = ['handled', 'failed']

// ============================================================================ the runtime guard

/** True only while `moveMessageTo` is inside its own write. Read from SQL by the trigger below. */
let doorIsOpen = false

/** Whether the trigger is on this connection, and — when it is not — the reason nobody has to guess. */
let guardState: { installed: boolean; why: string } = { installed: false, why: 'nothing has tried to install it yet' }

/** What the guard is doing right now. `tests/one-dispatch-door.test.ts` asserts this says yes. */
export function dispatchDoorGuard(): { installed: boolean; why: string } {
  return guardState
}

const GUARD_TRIGGER = 'mole_office_one_dispatch_door'
const GUARD_FUNCTION = 'mole_office_dispatch_door_is_open'

/**
 * Put the runtime half of the one-dispatch-door guard on this connection.
 *
 * Idempotent, and safe to call before the table exists — which is the case on a database nobody has
 * migrated yet. It then says so in `dispatchDoorGuard().why` rather than pretending to be on, and
 * the next call installs it. **Silence would be the failure this guard exists to prevent**: a guard
 * that is not there looks exactly like a guard that is there and never fired.
 */
export function installDispatchDoorGuard(): { installed: boolean; why: string } {
  if (guardState.installed) return guardState

  const table = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'agent_messages'").get()
  if (table === undefined) {
    guardState = {
      installed: false,
      why: 'this database has no agent_messages table yet, so there is nothing to put a trigger on',
    }
    return guardState
  }

  // `varargs: false, deterministic: false` — it answers differently on two identical calls on
  // purpose, because what it reports is whether this process is inside `moveMessageTo` right now.
  // Declaring it deterministic would let SQLite fold the call away and the guard would never fire.
  sqlite.function(GUARD_FUNCTION, { deterministic: false, varargs: false }, () => (doorIsOpen ? 1 : 0))
  sqlite.exec(`DROP TRIGGER IF EXISTS temp.${GUARD_TRIGGER}`)
  sqlite.exec(
    `CREATE TEMP TRIGGER ${GUARD_TRIGGER} BEFORE UPDATE OF state ON agent_messages ` +
      `WHEN ${GUARD_FUNCTION}() = 0 ` +
      `BEGIN SELECT RAISE(ABORT, 'agent_messages.state was written from outside moveMessageTo in ` +
      `src/server/lib/dispatch.ts. That column is where Mole Office keeps whether somebody has been given a comment, ` +
      `and one writer is what makes it impossible for two screens to disagree about it. Nothing was written.'); END`,
  )
  guardState = { installed: true, why: 'a temporary trigger on this connection refuses the write' }
  return guardState
}

// The guard goes on as soon as anything reaches this file, so a foreign write is refused whether or
// not `moveMessageTo` has ever been called in this process.
installDispatchDoorGuard()

// ============================================================================ the one writer

/** The facts a move may carry. Every one of them is written by this function and by nothing else. */
export interface MoveFacts {
  /** The durable identity this went to, on the move to `sent`. Never rewritten afterwards. */
  recipientAgentId?: string | null
  /** One plain sentence, on the move to `failed`. NULL means nothing failed, which is not success. */
  failedBecause?: string | null
  /** What the receiving agent did, on the move to `handled`, and which run said so. */
  handledNote?: string | null
  handledBySession?: string | null
}

/** What one move did, so a caller can report it without asking the database again. */
export interface Moved {
  id: string
  from: MessageState
  to: MessageState
  at: string
}

/**
 * THE ONLY THING IN `src/` THAT WRITES `agent_messages.state`.
 *
 * It also holds the only writes of `state_at`, `sent_at`, `failed_because`, `handled_note` and
 * `handled_by_session`, because those five say when and why the word moved and a second writer of
 * any of them could leave the word and its reason disagreeing.
 *
 * **A MOVE BACKWARDS IS REFUSED BY NAME.** That is what makes "this comment reads handled on one
 * screen and queued on another" unreachable rather than unlikely: one row, one writer, one
 * direction. It is also what lets the gate on somebody's words be keyed on this instead of on a
 * record field that could be — and was — walked back.
 *
 * A move to the word a message already holds is refused too. Nothing happened, and answering as if
 * something did is the first engineering rule broken.
 */
export function moveMessageTo(messageId: string, to: MessageState, facts: MoveFacts = {}): Moved {
  const row = db.select().from(agentMessages).where(eq(agentMessages.id, messageId)).get()
  if (row === undefined) throw new PanelError(`No agent message with id ${messageId}`, 404)

  const from = deliveryWordOf(row)
  if (HOW_FAR[to] <= HOW_FAR[from]) {
    throw new PanelError(
      `That comment already reads "${from}" and this would put it back to "${to}". Where a comment has got to only ` +
        `ever moves forward: somebody was given those words, and no later write makes that not have happened. ` +
        `Nothing was written.`,
      409,
    )
  }

  const at = nowStamp()

  // The runtime guard reads this flag from SQL. It is closed again whatever happens, so a refusal
  // inside the write does not leave the door open for the next statement on this connection.
  installDispatchDoorGuard()
  doorIsOpen = true
  try {
    // THE COLUMNS ARE NAMED IN A LITERAL AND NOT HANDED IN THROUGH A VARIABLE, and that is for the
    // source scan rather than for the reader: `tests/one-dispatch-door.test.ts` reads which columns
    // every write in `src/` names, and `.set(write)` is a write whose columns it cannot say. The
    // fifth engineering rule is that "cannot say" and "does not touch it" may never draw the same.
    db.update(agentMessages)
      .set({
        state: to,
        stateAt: at,
        // WRITTEN ONCE, ON THE WAY OUT, AND NEVER AGAIN. `state_at` moves on; this is the age of
        // the wait. Deriving it from `created_at` would be wrong — that is when the words were
        // written, not when Send was pressed.
        //
        // ON THE FIRST MOVE PAST `queued`, WHICHEVER WORD THAT IS, AND NOT ONLY ON THE WORD `sent`.
        // A move forward may skip: `moveMessagesForward(ids, 'handled')` over a comment still
        // queued is a move this file allows, and it used to leave `sent_at` NULL for ever on a row
        // every later reader treats as having gone out. `aMomentIsOwedBy` is the one place that
        // says which words owe a moment, and `row.sentAt === null` is what keeps "once" true.
        ...(aMomentIsOwedBy(to) && row.sentAt === null ? { sentAt: at } : {}),
        ...(facts.recipientAgentId === undefined ? {} : { recipientAgentId: facts.recipientAgentId }),
        ...(facts.failedBecause === undefined ? {} : { failedBecause: facts.failedBecause }),
        ...(facts.handledNote === undefined ? {} : { handledNote: facts.handledNote }),
        ...(facts.handledBySession === undefined ? {} : { handledBySession: facts.handledBySession }),
      })
      .where(eq(agentMessages.id, messageId))
      .run()
  } finally {
    doorIsOpen = false
  }

  return { id: messageId, from, to, at }
}

/** What a batch move did, and what it deliberately left alone. */
export interface MovedMany {
  moved: Moved[]
  /** Ids already at or past the word asked for. Named rather than counted, because each is a fact. */
  alreadyThere: string[]
}

/**
 * MOVE SEVERAL MESSAGES FORWARD TO THE SAME WORD, SKIPPING THE ONES ALREADY THERE OR PAST IT.
 *
 * **The skip is reported, never silent.** A run finishing a comment that another run already
 * handled is an ordinary thing; refusing the whole result over it would lose the answer. Answering
 * as if it had moved would be a lie about what happened. So the ids it did not touch come back by
 * name and the caller says so.
 *
 * It is still the one writer: every actual move is a `moveMessageTo` call, so a move backwards is
 * refused here exactly as it is anywhere else.
 */
export function moveMessagesForward(
  ids: readonly string[],
  to: MessageState,
  facts: MoveFacts = {},
): MovedMany {
  const moved: Moved[] = []
  const alreadyThere: string[] = []
  for (const id of ids) {
    const row = db.select({ id: agentMessages.id, state: agentMessages.state }).from(agentMessages)
      .where(eq(agentMessages.id, id))
      .get()
    if (row === undefined) throw new PanelError(`No agent message with id ${id}`, 404)
    if (HOW_FAR[deliveryWordOf(row)] >= HOW_FAR[to]) {
      alreadyThere.push(id)
      continue
    }
    moved.push(moveMessageTo(id, to, facts))
  }
  return { moved, alreadyThere }
}

// ============================================================================ which comments a message carries

/**
 * ONE COMMENT ONE MESSAGE CARRIES: which comment, where it stands in the message, and its quote.
 *
 * `number` counts from 1, in the order the comments were written. The quote has the shape a
 * message's context has, and is null only on a message carrying one comment that stored no context.
 */
export interface CarriedComment {
  commentId: string
  number: number
  quote: Context | null
}

/** The columns of one message row that say which comments it carries. */
export interface CarryingColumns {
  id: string
  fromAnnotationId: string | null
  carries: string | null
  context: string | null
}

/**
 * THE COMMENTS ONE MESSAGE CARRIES, IN ORDER.
 *
 * A message carries comments in one of two ways, and never both:
 *
 *   `from_annotation_id` — the message carries that one comment, and its `context` is the quote;
 *   `carries`            — a sent review put two or more comments for one recipient into this one
 *                          message, and the column lists them with their quotes (migration 0185).
 *
 * A message with neither carries no comment, and the answer is an empty list. This function and
 * `messagesCarrying` below are the only readers of the two columns for that question, so every
 * reading of "which message carried this comment" gives the same answer for both kinds of message.
 *
 * A `carries` value that does not read as that list is refused loudly, naming the message. Only
 * `addMessage` writes the column, and it checks every entry before it writes.
 */
export function carriedComments(row: CarryingColumns): CarriedComment[] {
  if (row.carries !== null) {
    if (row.fromAnnotationId !== null) {
      throw new PanelError(
        `The message ${row.id} says it carries one comment and also a list of comments. Mole Office cannot tell ` +
          `which is true, so it answers nothing about the comments in it.`,
        500,
      )
    }
    let held: unknown
    try {
      held = JSON.parse(row.carries)
    } catch {
      held = null
    }
    if (!Array.isArray(held) || held.length === 0) {
      throw new PanelError(
        `The list of comments stored on the message ${row.id} cannot be read, so Mole Office cannot say which ` +
          `comments it carries.`,
        500,
      )
    }
    return held.map((one: unknown, at): CarriedComment => {
      const entry = typeof one === 'object' && one !== null ? (one as Record<string, unknown>) : {}
      const commentId = entry['commentId']
      const quote = entry['quote']
      if (typeof commentId !== 'string' || commentId === '' || typeof quote !== 'object' || quote === null) {
        throw new PanelError(
          `Entry ${String(at + 1)} of the comments stored on the message ${row.id} names no comment or no quote, so ` +
            `Mole Office cannot say which comments it carries.`,
          500,
        )
      }
      return { commentId, number: at + 1, quote: quote as Context }
    })
  }
  if (row.fromAnnotationId === null) return []
  return [
    {
      commentId: row.fromAnnotationId,
      number: 1,
      quote: row.context === null ? null : (JSON.parse(row.context) as Context),
    },
  ]
}

/** One message that carries one comment, as `messagesCarrying` answers. */
export interface MessageCarrying {
  messageId: string
  commentId: string
  state: string
  sentAt: string | null
}

/**
 * EVERY MESSAGE THAT CARRIES ONE OF THESE COMMENTS, with the comment it carries: one row per pair.
 *
 * The same question as `carriedComments`, asked of the table rather than of one row: a message
 * carrying three comments answers three rows. `comments` null asks about every comment. `pastQueued`
 * keeps only the messages whose word is no longer `queued`, which is what "has gone out" means.
 * `movedSince` keeps only the messages whose word moved at or after that moment, so a page that
 * re-reads what changed since its last read learns that a comment it holds has gone out (problem
 * h9yY-r8s3vHZ).
 *
 * THE PROJECT IS ASKED OF THE CONVERSATION, because `agent_messages` carries none.
 */
export function messagesCarrying(opts: {
  comments: readonly string[] | null
  which: WhichProjects
  pastQueued: boolean
  movedSince?: string
}): MessageCarrying[] {
  if (opts.comments !== null && opts.comments.length === 0) return []
  const where: string[] = []
  const params: unknown[] = []
  if ('oneProject' in opts.which) {
    where.push('t.workspace_id = ?')
    params.push(opts.which.oneProject)
  }
  if (opts.pastQueued) where.push("m.state <> 'queued'")
  if (opts.movedSince !== undefined) {
    where.push('m.state_at >= ?')
    params.push(opts.movedSince)
  }
  const also = where.length === 0 ? '' : ` AND ${where.join(' AND ')}`
  const named = opts.comments === null ? '' : ' AND {comment} IN (SELECT value FROM json_each(?))'
  const list = opts.comments === null ? [] : [JSON.stringify(opts.comments)]
  const one =
    'SELECT m.id AS messageId, m.from_annotation_id AS commentId, m.state AS state, m.sent_at AS sentAt ' +
    'FROM agent_messages m JOIN agent_threads t ON t.id = m.thread_id ' +
    `WHERE m.from_annotation_id IS NOT NULL${also}${named.replace('{comment}', 'm.from_annotation_id')}`
  const several =
    "SELECT m.id AS messageId, json_extract(c.value, '$.commentId') AS commentId, m.state AS state, " +
    'm.sent_at AS sentAt FROM agent_messages m JOIN agent_threads t ON t.id = m.thread_id, json_each(m.carries) c ' +
    `WHERE m.carries IS NOT NULL${also}${named.replace('{comment}', "json_extract(c.value, '$.commentId')")}`
  return sqlite
    .prepare(`${one} UNION ALL ${several}`)
    .all(...params, ...list, ...params, ...list) as MessageCarrying[]
}

// ============================================================================ what has gone out

/** How much has gone out about one comment, and the newest word any of it reads. */
export interface DispatchReading {
  /** How many messages carrying this comment's words are not `queued`. */
  total: number
  /** The furthest word any of them has reached, or null when none has gone. */
  word: MessageState | null
  /** When the first of them went out, or null. */
  sentAt: string | null
}

/**
 * WHAT HAS GONE OUT ABOUT EACH OF THESE COMMENTS, asked once for a list of them.
 *
 * ONE EXPRESSION OF ONE FACT: a row in `agent_messages` that carries the comment (see
 * `carriedComments`) and whose state is not `queued`. `hasGoneOut` is this with a count compared to zero, and
 * the review reader, the record gate and the marks reader all reach it through one of the two.
 *
 * THE PROJECT IS A PARAMETER because `agent_messages` carries none — its thread does — and a
 * comment in one project must not be reported as sent by a conversation in another.
 */
export function dispatchOf(annotationIds: readonly string[], workspaceId: string): Record<string, DispatchReading> {
  const answer: Record<string, DispatchReading> = {}
  for (const id of annotationIds) answer[id] = { total: 0, word: null, sentAt: null }
  if (annotationIds.length === 0) return answer

  // EVERY MESSAGE CARRYING ONE OF THESE COMMENTS, whether it carries one comment or several. See
  // `messagesCarrying`: a message carrying three comments counts once for each of them.
  // A COMMENT KEPT IN THE MESSAGE CENTRE belongs to no project, so its words may have gone out in
  // a conversation of any project: every project is asked.
  const which: WhichProjects = workspaceId === MESSAGE_CENTRE ? EVERY_PROJECT : { oneProject: workspaceId }
  const rows = messagesCarrying({ comments: annotationIds, which, pastQueued: true })

  for (const row of rows) {
    const held = answer[row.commentId]
    if (held === undefined) continue
    const word = deliveryWordOf({ id: row.messageId, state: row.state })
    held.total += 1
    if (held.word === null || HOW_FAR[word] > HOW_FAR[held.word]) held.word = word
    if (row.sentAt !== null && (held.sentAt === null || row.sentAt < held.sentAt)) held.sentAt = row.sentAt
  }
  return answer
}

/**
 * A COMMENT WHOSE WORDS WENT OUT BEFORE MOLE OFFICE RECORDED WHICH CONVERSATION CARRIED THEM.
 *
 * One migration writes these rows, once, and no route writes one. A comment with a marker has gone
 * out and there is no conversation to find it in, which is exactly the fact that was lost and
 * exactly the reason it cannot be recomputed.
 */
export function wordsFixedBefore(annotationId: string): boolean {
  return (
    db.select({ id: annotationWordsFixed.annotationId }).from(annotationWordsFixed)
      .where(eq(annotationWordsFixed.annotationId, annotationId))
      .get() !== undefined
  )
}

/**
 * SOMEBODY HAS BEEN GIVEN THESE WORDS. That is what fixes them.
 *
 * IT LIVES BESIDE `moveMessageTo` ON PURPOSE, so the predicate and the writer are read together.
 * The whole strength of this gate is that nothing un-sends a message: `moveMessageTo` refuses a
 * move backwards, `refuseIfSent` blocks editing or removing one, and no route deletes a message
 * that is not `queued`. The record field it replaces could be walked back, and was.
 *
 * IT IS KEYED ON THE RECORD ID AND NOT ON `data`, so turning a comment into a note and back carries
 * nothing away — which was the second of the two ways round the old gate.
 */
export function hasGoneOut(annotationId: string, workspaceId: string): boolean {
  const reading = dispatchOf([annotationId], workspaceId)[annotationId]
  if (reading !== undefined && reading.total > 0) return true
  return wordsFixedBefore(annotationId)
}

/**
 * EVERY COMMENT IN ONE PROJECT WHOSE WORDS HAVE GONE TO SOMEBODY, by record id.
 *
 * IT IS `hasGoneOut` ASKED ABOUT A WHOLE PROJECT AT ONCE, and it answers the same question the same
 * way: a message carrying the comment's words that is past `queued`, or the marker written for a
 * comment whose words went out before Mole Office recorded which conversation carried them. Three reads,
 * each indexed: the messages, the markers, and the records the markers name.
 *
 * IT EXISTS FOR THE BROWSER. The browser cannot ask `hasGoneOut`, so it used to answer this from
 * `annotation.data.state` — a second store, which the schema says nothing reads and nothing writes
 * any more. `GET /api/agent/marks` carries this list, and the mark layer reads it. Asking per
 * comment instead would be one request per row of a page that already exists to save exactly that.
 *
 * THE BROWSER DOES NOT ASK FOR A LIST OF IDS, and that is deliberate: it is drawing a project, not a row,
 * and a whole-project answer cannot be wrong about a comment it forgot to name. `only` is for a caller that
 * asks about those comments and no other, as the message worker's queue does (`commentsAReviewHasNotSentYet`):
 * the answer is then the whole answer's ids that are in `only` (wave 13y round 34).
 */
export function commentsGoneOut(which: WhichProjects, only?: readonly string[]): string[] {
  const gone = new Set<string>()
  if (only !== undefined && only.length === 0) return []

  // WHETHER THE MESSAGE CARRIED ONE COMMENT OR SEVERAL, through the one reader of that question.
  for (const row of messagesCarrying({ comments: only ?? null, which, pastQueued: true })) gone.add(row.commentId)

  // THE PROJECT IS ASKED OF THE COMMENT AND NOT OF THE MARKER. `annotation_words_fixed` has no
  // project column on purpose — a marker belongs to the project its comment belongs to, one row
  // along — so each marker's record is read to say whether it is in this project.
  //
  // THE MARKERS ARE READ FIRST, and then the records they name (wave 13y round 34). Joined in one statement, SQLite
  // walked every message of the project and asked each whether it had a marker: 109 MB read on a copy of an office
  // that had no marker at all. A marker is written only for a comment whose words went out before Mole Office
  // recorded which conversation carried them, so there are few.
  const markers = db
    .select({ annotationId: annotationWordsFixed.annotationId })
    .from(annotationWordsFixed)
    .where(only === undefined ? undefined : sql`${annotationWordsFixed.annotationId} IN (SELECT value FROM json_each(${JSON.stringify(only)}))`)
    .all()
    .map((row) => row.annotationId)
  // IN PIECES (src/server/db/in-pieces.ts): one id for every marker. The answer is a set, so the order is not used.
  const fixed = readInPieces(markers, (piece) =>
    db
      .select({ annotationId: records.id })
      .from(records)
      // A COMMENT THAT IS A MESSAGE IS KEPT IN THE MESSAGE CENTRE, and belongs to a project's view
      // when it comments on one of that project's records; an annotation is still filed in its project.
      .where(
        and(
          inArray(records.id, piece),
          'oneProject' in which
            ? or(and(eq(records.kind, 'annotation'), narrowedToProjects(records.workspaceId, which)), and(eq(records.kind, 'message'), messagesInTheViewOf(which)))
            : undefined,
        ),
      )
      .all(),
  )
  for (const row of fixed) gone.add(row.annotationId)

  return [...gone].sort()
}
