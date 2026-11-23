// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TWO LIFECYCLE TABLES, DECLARED HERE AND NOT YET IN `schema.ts`. THE REASON IS MEASURED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THEY ARE
 * ---------------------------------------------------------------------------------------
 *
 * `agent_work_transitions` — one row per work-state move. It is where the CURRENT work state comes
 * from: the newest row for an agent. Nothing caches it and no column anywhere holds it.
 *
 * `agent_wakes` — one row per wake somebody wants. The route that writes one starts nothing; the
 * Agent Host, which lives outside `src/`, is the only thing that ever starts a provider.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS INSTEAD OF EIGHT LINES IN `schema.ts`, AND THE MEASUREMENT THAT DECIDED IT
 * ---------------------------------------------------------------------------------------
 *
 * This campaign has ONE announced migration window and the owner runs it. Until the owner does, no new
 * table may be created by a migration: `prepareToServe` refuses to serve a corpus with a pending
 * migration, so registering one would stop the owner's dev server at a moment nobody chose.
 *
 * A table declared in `schema.ts` but created by no migration is a state the suite already refuses,
 * and I measured what it costs on 27 August 2026 rather than reasoning about it. Adding ONE of
 * these two to `schema.ts` and to `MEASURED_TABLES` turns **six tests red in two files**:
 *
 *   tests/schema-tables.test.ts  are all declared in schema.ts
 *   tests/schema-tables.test.ts  are each classified as authored, derived or measured …
 *   tests/schema-tables.test.ts  names the four measured tables …
 *   tests/schema-tables.test.ts  the indexes schema.ts declares are the indexes the database has
 *   tests/migration.test.ts      leaves no table out, whichever list it is on and even if it is on none
 *   tests/migration.test.ts      says which of them a lost row would not stop it over …
 *
 * Those six are right and none of them may be weakened. So the declaration waits here, where
 * `Object.values(schema)` cannot see it and `drizzle-kit generate` — which reads `schema.ts` and
 * nothing else, see `drizzle.config.ts` — cannot turn it into a pending migration by accident.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE WINDOW COMMIT DOES, IN FULL, SO NOTHING IS LEFT TO BE REMEMBERED
 * ---------------------------------------------------------------------------------------
 *
 * One commit, when the owner opens the window:
 *
 *   1. Move both declarations below into `src/server/db/schema.ts`.
 *   2. Add `agent_work_transitions` and `agent_wakes` to `MEASURED_TABLES`.
 *   3. Update the written lists in `tests/schema-tables.test.ts` — the thirty-five names and the
 *      four measured names — because a thirty-sixth table has to be typed there on purpose.
 *   4. Write the migration for step 1 by hand in `drizzle/`, with `IF NOT EXISTS` on every CREATE
 *      TABLE and CREATE INDEX, add its entry to `drizzle/meta/_journal.json` in the same commit, and
 *      ask the coordinator for its number. No script generates a migration.
 *   5. Delete `tests/the-lifecycle-tables-wait-for-the-window.test.ts`, whose whole subject is that
 *      steps 1 to 4 have NOT happened.
 *
 * **`REGION_COLUMNS` and `SCOPED_THROUGH` get nothing, and that is an answer rather than an
 * omission.** Both are keyed by `AuthoredTable`. These two tables are MEASURED — the class
 * `telemetry.md` §T2.3 already chose for the transition store, in a section that shipped — and a
 * measured table is not a region: an archive carries none of them, because nothing can recompute a
 * measurement. What that costs is stated rather than hidden: **a restore from an archive brings
 * back no work-state history and no wake history.**
 *
 * ---------------------------------------------------------------------------------------
 * WHY TWO TABLES IN ONE WINDOW, WHEN ONLY ONE OF THEM HAS A WRITER TODAY
 * ---------------------------------------------------------------------------------------
 *
 * `agent_wakes` has no writer yet; the route that writes one is a later step. It is created in this
 * window anyway because the window is the expensive thing, not the table: any table added after it
 * stops the owner's server again for the four commands the owner has already run twice. That is the
 * argument, and it is the only one — a second table nobody could name a use for would be the
 * speculative abstraction USER.md's sixth invariant refuses.
 */

import { getTableName } from 'drizzle-orm'
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * ONE ROW PER WORK-STATE MOVE. THIRTEEN COLUMNS, AND EVERY ONE CARRIES A FACT SECTION 15 ASKS FOR.
 *
 * Section 15 of the round-eleven brief asks that Mole Office can say when an agent became Working,
 * why, on what evidence or event, and which attachment, run, checkpoint or message was related. Those
 * four questions are the reason this is a table rather than a row in `changes`: that table carries
 * seven of the ten facts free and misses the three — the reason, the evidence and the related thing
 * — that make a transition explain itself. And `changes` IS the daily page; writing lifecycle into
 * it floods the one screen that answers *what happened while I was away*.
 *
 * **There is no `dimension` column.** The disposition proposed one with a single legal value,
 * `work`, priced against a later `ALTER`. Presence transitions are not stored and never will be —
 * presence is a reading — so the column would be a hedge against a change the design forbids, and
 * a column named `dimension` with one value is an invitation the next reader will accept. The
 * table's name carries the same guarantee for free.
 *
 * **There is no duration column and no "Working since".** Both are arithmetic over two rows.
 */
export const agentWorkTransitions = sqliteTable(
  'agent_work_transitions',
  {
    /** nanoid, like every other id here, so a finding can cite one row. */
    id: text('id').primaryKey(),
    /** The project. A durable agent belongs to one. */
    workspaceId: text('workspace_id').notNull(),
    /**
     * Which agent this is about: a `records` id of kind `agent`.
     *
     * NOT A DECLARED FOREIGN KEY, for the reason `changes.record_id` is not one: what happened has
     * to survive whatever happens to the record it names. Referential honesty is the writer's job.
     */
    agentId: text('agent_id').notNull(),
    /** The previous word. NULL means this is the agent's first transition, which is a real answer. */
    fromState: text('from_state'),
    /** The new word. Never NULL. */
    toState: text('to_state').notNull(),
    /** When it happened, local wall clock, from the server's own clock and never from a caller. */
    at: text('at').notNull(),
    /** Why, in one plain sentence. EMPTY IS REFUSED. This is the column `changes` cannot give. */
    because: text('because').notNull(),
    /** JSON: the message id, the hook event, the report id, the watchdog finding, the wake id. */
    evidence: text('evidence'),
    /** `human` or `agent`. NEVER `system`: a process dying is not a decision about the work. */
    actorType: text('actor_type').notNull(),
    /** Who caused it, in their own name. A claim, recorded as a claim. */
    actorId: text('actor_id').notNull(),
    /** The attachment half of *which attachment was related*. NULL when a person moved it. */
    attachmentId: text('attachment_id'),
    /** The checkpoint, message, task or report half of the same question. */
    relatedKind: text('related_kind'),
    /** The same. NULL means nothing was related, which is a real answer. */
    relatedId: text('related_id'),
  },
  // ONE INDEX. Every read is either "the newest state of this agent" or "this agent's history".
  (t) => [index('agent_work_transitions_agent_idx').on(t.agentId, t.at)],
)

/**
 * ONE ROW PER WAKE SOMEBODY WANTS. THE ROUTE THAT WRITES ONE STARTS NOTHING.
 *
 * The same shape `POST /api/export` has: it writes the files and declines to run git, and says so
 * on every call. A wake row says *this agent should be reachable again, for this reason*. It names
 * no command and no work — `exec(command: string)` is refused by the owner's section 17, and a
 * `command` column would be that refusal walked around.
 *
 * **The design's summary calls this fourteen columns and there are sixteen.** Its own table has
 * fourteen ROWS and two of them name two columns each: *who wanted it* is `wanted_by_type` and
 * `wanted_by_id`, and *which Host took it, and when* is `claimed_by` and `claimed_at`. Nothing was
 * added and nothing was dropped; the headline counted rows.
 *
 * **Nothing writes a row yet.** The route is a later step, and `tests/one-work-state-door.test.ts`
 * asserts the absence rather than leaving it to be noticed.
 */
export const agentWakes = sqliteTable(
  'agent_wakes',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    /** Which durable agent should be woken: a `records` id of kind `agent`. Not a foreign key. */
    agentId: text('agent_id').notNull(),
    /** When the wake was wanted, local wall clock. */
    wantedAt: text('wanted_at').notNull(),
    /** `human` or `agent`. */
    wantedByType: text('wanted_by_type').notNull(),
    /** Which person or agent wanted it. */
    wantedById: text('wanted_by_id').notNull(),
    /** The wake reason, one plain sentence. It becomes the continuation's *why this attachment*. */
    because: text('because').notNull(),
    /** JSON: the message id, the review id, the watchdog finding. */
    evidence: text('evidence'),
    /**
     * `owner-message`, `watchdog` or `owner-press`.
     *
     * STORED PER ROW, so the answer to the open question about what the Host may do without asking
     * is a setting rather than a migration. That question is the owner's and is not settled here.
     */
    policy: text('policy').notNull(),
    /** `wanted`, `claimed`, `served`, `refused`, `expired`. */
    state: text('state').notNull(),
    /** When the state last moved. */
    stateAt: text('state_at').notNull(),
    /** Which Host took it. NULL while nobody has. */
    claimedBy: text('claimed_by'),
    claimedAt: text('claimed_at'),
    /** When the new attachment existed. */
    servedAt: text('served_at'),
    /** The new attachment it produced — the join that proves the wake worked. */
    attachmentId: text('attachment_id'),
    /** Why the Host declined, in its own words. */
    refusedBecause: text('refused_because'),
  },
  (t) => [
    // The Host's poll, and one agent's wake history. Two reads, two indexes, and no more.
    index('agent_wakes_poll_idx').on(t.state, t.wantedAt),
    index('agent_wakes_agent_idx').on(t.agentId, t.wantedAt),
  ],
)

/**
 * The names of the two tables, for the places that have to say them as strings.
 *
 * Read off the declarations rather than typed, so a rename moves everything that names them.
 */
export const LIFECYCLE_TABLES = [getTableName(agentWorkTransitions), getTableName(agentWakes)] as const
