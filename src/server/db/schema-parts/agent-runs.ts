// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

/**
 * ONE BOUNDED ATTEMPT TO ANSWER A THREAD.
 *
 * A run is queued here and a WORKER claims it. This server never starts a process, so a row
 * in this table is a request waiting for somebody to pick it up, and nothing more.
 *
 * `state` is `queued` (nobody has taken it), `claimed` (a worker took it and has not started),
 * `running`, `finished`, `failed`, or `declined` — a worker looked at it and said it could not
 * serve this one. `claimed_by` and `claimed_at` are NULL until a worker takes it, and NULL there
 * means nobody has picked this up, which is a real answer and is what the screen should say rather
 * than showing a spinner.
 *
 * `declined` exists for one case and it is the honesty hazard of the whole routing idea. A run may
 * be addressed to an agent that was working on something, and that agent can only really be picked
 * up again where its transcript lives. A worker on another machine must NOT quietly start a fresh
 * agent that has never heard of the work and report that as the answer. It declines and says why,
 * and the run goes back to waiting for a worker that can serve it.
 *
 * `recipient_session_id` is which agent this run is addressed to, or NULL for a deliberately new
 * one. `resume_external_id` is that runtime's own id for the conversation — the thing a worker
 * needs to pick it up — and is NULL when there is nothing to resume.
 *
 * `request` is the assembled context, as JSON text, WRITTEN ONCE. It is what the worker was actually
 * given, so an answer can be read against the question that produced it; rewriting it would destroy
 * the only record of what was asked.
 *
 * `result` is JSON text and NULL until there is one. `error` is the words a failure came back with
 * and NULL when there was none — a run may have neither, which means it has not finished.
 *
 * NO `workspace_id`: the thread has one, and this row belongs to that project through it. See
 * `agent_messages` above and `WORKSPACE_COLUMN` at the foot of this file.
 */
export const agentRuns = aPartTable(sqliteTable(
  'agent_runs',
  {
    /** nanoid. */
    id: text('id').primaryKey(),
    /** The thread this run is answering. */
    threadId: text('thread_id').notNull(),
    /** Which runtime was asked for, by name. Stored so a result says what produced it. */
    runtime: text('runtime').notNull(),
    /** One of RUN_STATES in lib/agents.ts. */
    state: text('state').notNull().default('queued'),
    /**
     * THE DURABLE IDENTITY THIS RUN IS FOR, or NULL because nothing recorded one.
     *
     * A run is the execution of some of one thread's messages for one agent. It stays thread-scoped:
     * `thread_id`, `runtime` and `request` are all NOT NULL, and the request is assembled from one
     * thread.
     */
    agentId: text('agent_id'),
    /** The session record this run is addressed to, or NULL for a deliberately new agent. */
    recipientSessionId: text('recipient_session_id'),
    /** The runtime's own id for that conversation, so a worker can pick it up. NULL if there is none. */
    resumeExternalId: text('resume_external_id'),
    /** The worker that took this run, or NULL because nobody has picked it up yet. */
    claimedBy: text('claimed_by'),
    /** LOCAL wall clock when it was claimed, or NULL for the same reason. */
    claimedAt: text('claimed_at'),
    /**
     * WHICH MACHINE TOOK THIS RUN, or NULL because nobody has claimed it.
     *
     * By criterion P23 of design/permissions/ACCEPTANCE.md, a person is one identity from every
     * machine and the machine is recorded beside them. Once a worker on another
     * machine may claim a run (criterion P21), "who took it" and "where it was taken" stop being the
     * same question, and a conversation that could not say which machine answered would be a
     * conversation nobody could follow up.
     *
     * MEASURED, NEVER SENT IN. It is what `writtenFrom` read off the socket, and the claim body
     * carries no field for it: a worker naming its own machine would be a worker able to name
     * somebody else's. NULL after a claim means nobody could tell, which is a real answer.
     */
    claimedFromMachine: text('claimed_from_machine'),
    /** JSON: the assembled context the worker was given. Written once and never rewritten. */
    request: text('request').notNull(),
    /** JSON: what came back, or NULL because nothing has. */
    result: text('result'),
    /** What a failure said, or NULL because nothing failed — which is not the same as succeeding. */
    error: text('error'),
    /** LOCAL wall clock, or NULL where it has not happened. */
    startedAt: text('started_at'),
    endedAt: text('ended_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    // The two reads there are: what a worker may claim, and the runs of one thread.
    index('agent_runs_state_idx').on(table.state),
    index('agent_runs_thread_idx').on(table.threadId),
    // AND A THIRD: the queue read by who it is for, which is how a worker asks whether it can serve
    // anything. `drizzle/0050_who_a_message_is_for.sql` created it and this file never declared it,
    // so for a week the schema and the database disagreed about what indexes exist and nothing said
    // so. Found by tests/schema-tables.test.ts's index comparison on 25 August 2026, which is the
    // test that exists for exactly this and had never been run before.
    index('agent_runs_recipient_idx').on(table.recipientSessionId),
  ],
), { existingArchive: true })
