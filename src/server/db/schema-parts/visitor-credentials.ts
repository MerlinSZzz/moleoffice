// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

/**
 * A TRUSTED VISITOR'S CREDENTIAL: one agent on another machine, before that machine runs a world.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * Criteria P24 to P29 of design/permissions/ACCEPTANCE.md, on answer 3:
 * before that machine has a world of its own, an agent on it registers as a trusted visitor, each
 * agent is issued its own credential, and the credential records the facts of that agent's run.
 * Answer 3 is quoted in full in design/permissions/ACCEPTANCE.md section 1.3.
 * One row per AGENT, not per machine and not per world, because answer 3 says each agent.
 * src/shared/visitors.ts is the vocabulary and says what each field means to a reader.
 *
 * ---------------------------------------------------------------------------------------
 * THE TOKEN IS A HASH AND THE COLUMN IS NAMED SO
 * ---------------------------------------------------------------------------------------
 *
 * `token_hash` holds SHA-256 of the secret, and the secret is shown once, in the reply that issues
 * it. The office therefore cannot hand it back, and a person who reads this table reads no secrets.
 * A column called `token` holding a hash would be a name that lies to whoever opens the database
 * next, which is the seventh invariant's whole subject.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE COUNTS ARE NOT COLUMNS HERE
 * ---------------------------------------------------------------------------------------
 *
 * Criterion P26 asks the Embassy row to carry a request count, what it wrote and a mismatch count.
 * All three are counted from `visitor_requests` on every read. Storing them here as well would be
 * one fact worked out in two places, which is the ninth invariant, and the copy is what drifts: a
 * request recorded while a counter update failed would leave the two disagreeing with nothing
 * failing.
 *
 * AUTHORED. An agent asked for it and a person confirmed it: both are moments, and nothing can
 * recreate a moment.
 */
export const visitorCredentials = aPartTable(sqliteTable(
  'visitor_credentials',
  {
    /** nanoid. It is drawn on a page and named in a refusal, so it is not a secret and never the token. */
    id: text('id').primaryKey(),
    /** The handle the visitor writes under. Permanent, like every handle here. */
    handle: text('handle').notNull(),
    /** What a reader sees. */
    name: text('name').notNull(),
    /** The role card it was issued against. */
    role: text('role').notNull(),
    /**
     * SHA-256 of the token, in hex. The secret is shown once and never again.
     *
     * Unique, so two credentials cannot hold one token — which would make "which credential is
     * this" a question with two answers, and every count below wrong for both.
     */
    tokenHash: text('token_hash').notNull(),
    /**
     * The database identity of the world it says it belongs to, or NULL — and NULL is what makes it
     * a visitor rather than a citizen. Said by the caller and never checked; criterion P31.
     */
    world: text('world'),
    /** The machine it asked from, as `writtenFrom` measured it, or NULL because nobody could tell. */
    machine: text('machine'),
    /** How that machine was arrived at: `this machine`, `an address`, or `nobody could tell`. */
    machineHow: text('machine_how').notNull(),
    /** Where this run writes its transcript, or NULL because it did not say. */
    conversationPath: text('conversation_path'),
    /** The directory the run began in, or NULL because it did not say. */
    startDirectory: text('start_directory'),
    /** Which runtime serves it, in the caller's own word, or NULL because it did not say. */
    runtime: text('runtime'),
    /** The session record this run filed here, or NULL because it filed none. */
    sessionRecord: text('session_record'),
    /** `pending`, `trusted` or `ended`. The three in src/shared/visitors.ts and no fourth. */
    standing: text('standing').notNull(),
    /** Who confirmed it, named the one way a participant ever is. NULL while it is pending. */
    confirmedByKind: text('confirmed_by_kind'),
    confirmedById: text('confirmed_by_id'),
    /** LOCAL wall clock when the person confirmed it. NULL exactly when `confirmed_by_id` is NULL. */
    confirmedAt: text('confirmed_at'),
    /** When it runs out without being renewed. LOCAL wall clock. */
    endsAt: text('ends_at').notNull(),
    /** When it was ended, and one plain sentence saying why. NULL exactly together. */
    endedAt: text('ended_at'),
    endedBecause: text('ended_because'),
    /** LOCAL wall clock. No SQL default, for the reason `reader_anchors` gives. */
    issuedAt: text('issued_at').notNull(),
  },
  (t) => [
    uniqueIndex('visitor_credentials_token_idx').on(t.tokenHash),
    index('visitor_credentials_standing_idx').on(t.standing),
    index('visitor_credentials_world_idx').on(t.world),
  ],
), existingArchive)
