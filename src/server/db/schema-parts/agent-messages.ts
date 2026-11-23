// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { HowACallerProvedItself } from '@shared/types.ts'
import { aPartTable } from '../part-tables.ts'

/**
 * ONE THING SAID IN A THREAD, AND WHAT IT WAS SAID ABOUT.
 *
 * `position` is a real number so a message written between two others takes the midpoint and no
 * other row has to move — the same reason `plan_lines.position` is one, and the same rule.
 *
 * `role` is `human`, `agent` or `system`. `intent` is `ask`, `discuss`, `review`, `change` or
 * `start`, which is what the person meant by writing it rather than what Mole Office will do about it.
 *
 * `context` is JSON text: what this message points at — a record, a plan line, a schedule block, or
 * a span of text with the quoted words kept. THE QUOTE IS STORED, so a comment still says what it
 * was about after the text underneath it changes, and Mole Office can say the text has changed instead
 * of pretending an offset still holds. NULL means the message points at nothing in particular.
 *
 * `state` is `queued` (written, not sent), `sent` (handed to a run) or `answered`.
 *
 * NO `workspace_id`: the thread it belongs to has one, and a copy here would be a second place that
 * has to agree with it. THAT DOES NOT MAKE IT PERSON-LEVEL. This row belongs to exactly one project
 * — the one its thread names — and `WORKSPACE_COLUMN` in authored-table-of.ts says so, by naming
 * the thread and the column that reaches it.
 *
 * ---------------------------------------------------------------------------------------------
 * WHO IT IS FOR, IN THREE LAYERS, BECAUSE THE OWNER FORBADE GUESSING AT THE FOURTH
 * ---------------------------------------------------------------------------------------------
 *
 * A message goes to the agent already working on the thing it is about, and the recipient is never
 * guessed silently: the interpretation is visible and easy to override.
 *
 * So a recipient is stored the way every loose input in this product is stored — what was said,
 * what Mole Office made of it, and what was committed:
 *
 *   `recipient_said`  the words somebody typed, when they used the "say who you mean" path, kept
 *                     exactly. NULL when they picked from the list instead.
 *   `recipient_why`   the sentence saying how this recipient was arrived at: which run filed the
 *                     record, which pipeline it is part of, or which words matched what. It is
 *                     shown beside the choice, never instead of it.
 *   `recipient_kind`  what was settled. `session` — a run named below. `new` — deliberately a fresh
 *                     agent. `unresolved` — words that named more than one agent or none, which is a
 *                     real state and STOPS the dispatch rather than being sent somewhere.
 *
 * A recipient is a `session` record. Not a new kind of thing: a session IS an agent run here, it is
 * already filed under the work it belongs to, and every change it made already names it. So routing
 * reads evidence Mole Office has held all along and adds no model of its own.
 *
 * ALL FOUR ARE NULL on a message nobody addressed — an agent's own answer, or a system line.
 *
 * ---------------------------------------------------------------------------------------------
 * AND THE ANSWER IS A MESSAGE TOO: `run_id`
 * ---------------------------------------------------------------------------------------------
 *
 * Until 19 August 2026 a finished run wrote its answer into `agent_runs.result` and nothing else,
 * so a thread read as things a person said and no reply. Answering back was impossible because
 * there was nothing in the conversation to answer.
 *
 * `run_id` names the run an agent's answer came out of. It is NULL on every message a person wrote,
 * which is the ordinary case, and it is how a reader tells the two apart without guessing from
 * `role`.
 *
 * THE ANSWER'S WORDS ARE IN `body` AND ALSO IN THAT RUN'S `result`, AND THAT IS A COPY. It is the
 * one this repository allows, because neither side can ever be rewritten: a finished run refuses a
 * second result, and a message that is not `queued` refuses an edit. If either ever became
 * editable, this would be the same fact in two places and the copy would be the one that went
 * stale.
 */
export const agentMessages = aPartTable(sqliteTable(
  'agent_messages',
  {
    /** nanoid. */
    id: text('id').primaryKey(),
    /** The thread this was said in. */
    threadId: text('thread_id').notNull(),
    /** Where it sits in the thread. A real number, so an insert takes a midpoint. */
    position: real('position').notNull(),
    /** `human`, `agent` or `system`. Who said it. */
    role: text('role').notNull(),
    /** `ask`, `discuss`, `review`, `change` or `start`. What the writer meant by saying it. */
    intent: text('intent').notNull(),
    /** What was said, exactly as written. Not parsed, not normalised, not repaired. */
    body: text('body').notNull(),
    /** JSON: what this points at, with any quoted text kept. NULL means it points at nothing. */
    context: text('context'),
    /** `queued`, `sent` or `answered`. */
    state: text('state').notNull().default('queued'),
    /** `session`, `new` or `unresolved`. NULL when nobody addressed this message. See above. */
    recipientKind: text('recipient_kind'),
    /** The session record this is addressed to. NULL unless `recipient_kind` is `session`. */
    recipientSessionId: text('recipient_session_id'),
    /** The words typed on the "say who you mean" path, kept exactly. NULL when one was picked. */
    recipientSaid: text('recipient_said'),
    /** The sentence saying how this recipient was arrived at, shown beside the choice. */
    recipientWhy: text('recipient_why'),
    /**
     * The run that produced this message. NULL on everything a person wrote.
     *
     * An agent's answer is a message in the thread, and this is what says which attempt it came out
     * of. Not a declared foreign key, for the reason `changes.record_id` is not one: what was said
     * has to survive whatever happens to the run. See the block above this table.
     */
    runId: text('run_id'),
    /**
     * THE COMMENT THIS MESSAGE CARRIED, or NULL because nobody wrote it as one.
     *
     * Sending a review writes each comment into the review's conversation as a message, so for a
     * moment the same sentence is in two rows — `annotation.body` and this one. This column is what
     * keeps that from being two facts that can drift: it says the message came from that comment,
     * so a reader can get back to the record the person actually wrote, and a second Send can tell
     * that a comment is already in the conversation instead of writing its words in again.
     *
     * NOT A DECLARED FOREIGN KEY, for the reason `run_id` is not one: what was said has to survive
     * whatever happens to the record it came from.
     */
    fromAnnotationId: text('from_annotation_id'),
    /**
     * THE COMMENTS THIS ONE MESSAGE CARRIES, when a sent review put two or more of them in it, or
     * NULL. Migration 0185, by a decision.
     *
     * JSON: a list of {commentId, quote}, in the order the comments were written; `quote` has the
     * shape `context` has. A message carrying one comment uses `from_annotation_id` and leaves this
     * NULL, so the two are never both set. `carriedComments` in lib/dispatch.ts reads both, and every
     * question about which message carried a comment goes through it.
     */
    carries: text('carries'),
    /**
     * WHERE THIS HAS GOT TO BETWEEN MOLE OFFICE AND ITS RECIPIENT, and when the word last moved.
     *
     * `state_at` is NULL on every message written before these columns existed; a later step fills
     * it. The word itself only ever moves forward, and one function in lib/dispatch.ts is the only
     * writer of this column, `sent_at`, `failed_because`, `handled_note` and `handled_by_session`.
     */
    stateAt: text('state_at'),
    /**
     * WHEN MOLE OFFICE ACCEPTED THE DISPATCH. Written once and never overwritten.
     *
     * `state_at` moves on, and "waiting since 18 August" is the age of the wait rather than the age
     * of the last event. Deriving it from `created_at` would be wrong: that is when the words were
     * written, not when Send was pressed.
     */
    sentAt: text('sent_at'),
    /**
     * THE DURABLE IDENTITY THIS WENT TO. NULL means nobody has been resolved.
     *
     * It joins the `recipient_*` family already on this table, and it is called
     * `recipient_agent_id` rather than `agent_id` because `written_by_agent_id` sits beside it and a
     * bare `agent_id` next to that would be ambiguous about direction.
     */
    recipientAgentId: text('recipient_agent_id'),
    /**
     * WHO TOOK A MESSAGE THE PERSON ADDRESSED TO "A NEW AGENT", and when.
     *
     * A NEW FACT ABOUT WHO TOOK IT, NEVER A CORRECTION OF WHAT THE PERSON SAID: `recipient_kind`
     * stays `new` for ever.
     */
    takenByAgentId: text('taken_by_agent_id'),
    takenAt: text('taken_at'),
    /** One plain sentence, written at the failure. NULL means nothing failed, which is not success. */
    failedBecause: text('failed_because'),
    /** What the receiving agent did, and which run said so. NULL on both means nobody has said. */
    handledNote: text('handled_note'),
    handledBySession: text('handled_by_session'),
    /**
     * WHICH DURABLE IDENTITY WROTE THIS MESSAGE. NULL for a person.
     *
     * Written only by the one function that writes a message, and only from the binding it already
     * holds — never from anything a caller sends, so it cannot disagree with anything. Without it a
     * message from one agent to another has no sender identity at all: `role` is human / agent /
     * system and `created_by` is a free actor string.
     */
    writtenByAgentId: text('written_by_agent_id'),
    /**
     * WHAT OVERLAP THIS MESSAGE WAS WRITTEN TO COORDINATE, as JSON, or NULL because it was not one.
     *
     * It sits beside `context` rather than inside it because a context says what a message points
     * at, and this says what two pieces of work were agreed about. Nullable with no default and no
     * backfill: no message that exists today was written to coordinate an overlap, and filling it
     * would be inventing a fact.
     */
    coordination: text('coordination'),
    /**
     * HOW A KEY PROVED THE REQUEST THAT WROTE THE WORDS IN `body`, or NULL when no key proved it.
     * Migration 0178. The word `actorFrom` puts on the actor as `provedBy`.
     *
     * A warrant written after the key window closed may cite a message only when the person wrote it
     * and the person's key proved it, and this is where the proof is read. A queued message's words can be
     * changed, so a change to `body` writes this again from the actor who changed it. On a row
     * written before 0178, NULL means nobody recorded it.
     */
    provedBy: text('proved_by').$type<HowACallerProvedItself>(),
    /** LOCAL wall clock. Who wrote it: `${actor.type}:${actor.id}`. */
    createdAt: text('created_at').notNull(),
    createdBy: text('created_by').notNull(),
  },
  (table) => [
    // The one read there is: a whole thread in order.
    index('agent_messages_thread_idx').on(table.threadId, table.position),
    // An inbox is a query, not a table: every row naming this agent as recipient whose state is one
    // of the waiting words. The inbox read and the listener's poll both run on this index.
    index('agent_messages_inbox_idx').on(table.recipientAgentId, table.state),
    // WHEN A MESSAGE'S WORD LAST MOVED, so a page of a conversation finds the messages that went out since it was
    // read (migration 0204, `messagesCarrying` in src/server/lib/dispatch.ts with `movedSince`).
    index('agent_messages_state_at_idx').on(table.stateAt),
  ],
), { existingArchive: true })
