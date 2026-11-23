// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'
import { assets } from './assets.ts'

/**
 * THE DURABLE AGENTS OF THIS INSTALLATION, one row per agent, whatever project it works in.
 *
 * The same shape as `people` plus three columns of its own, because an agent is served by a runtime
 * and can be taken out of use. Criterion M2 names the three runtime words.
 *
 * `runtime` IS DEAD AND LEFT IN PLACE. It used to hold one of the declared runtime words, written
 * at registration and never changed afterwards, while the agent record's `data.runtime` was the
 * door a PATCH could change — two stores for one fact, and on 14 September 2026 they answered two
 * runtimes for one agent. A decision makes the record the one store.
 * `runtimeOfTheAgentRecord` in lib/participants.ts reads it there and nothing writes or reads this
 * column. It is not dropped because the codebase
 * has no `DROP COLUMN` migration and because a row written before the change still carrying a word
 * is what the test about a stale copy uses; leaving it dead and named here is cheaper than
 * rewriting the table, and a reader is told rather than left to guess. `declaredRuntimeOrNull` in
 * shared/participants.ts is still the one place that decides which words are real.
 * The list of runtime words was declared and documented as checked, and it was checked nowhere.
 *
 * `retired` IS THE SAME FACT THE `agent` RECORD'S `state` FIELD HOLDS, and that is on purpose while
 * both exist: the record kind's own words say retired takes an agent off the picker for new messages
 * and changes nothing else. Part 2b moves the messages; until then the registry row is the copy that
 * the chat reads and the record is the copy the existing inbox reads. `agent_records` is what joins
 * them, so the two can be compared rather than drifting unseen.
 */
export const agents = aPartTable(sqliteTable(
  'agents',
  {
    /** For a row the migration made, the handle it was made from. New rows get a nanoid. */
    id: text('id').primaryKey(),
    /** The name a reader sees. A person may change any agent's; an agent may not change its own. */
    name: text('name').notNull(),
    /** The short address: lowercase letters, digits and dashes, 2 to 40 characters, unique. */
    handle: text('handle').notNull(),
    /**
     * The `assets` row holding the picture. Never NULL: a participant is created with its generated
     * default already written down, and resetting to the default points back at that same row.
     */
    avatarAssetId: text('avatar_asset_id')
      .notNull()
      .references(() => assets.id),
    /** Chosen pixel costume. Null means the stable generated default is still in use. */
    pixelAppearance: text('pixel_appearance'),
    pixelScale: text('pixel_scale'),
    /**
     * Short free text about what this agent is doing, at most 60 characters. NULL means nobody has
     * set one. Since criterion M21 it is set by the agent itself or by a person; who did is below.
     */
    state: text('state'),
    /** When the state was set, local wall clock. NULL exactly when `state` is NULL. */
    stateAt: text('state_at'),
    /**
     * WHO SET THE LINE: the person keeps the right to set it.
     *
     * NULL means nobody recorded who set it, which is what every row written before this held and
     * is not the same as "the agent set it". A screen says nothing where this is NULL rather than
     * naming a setter nobody wrote down.
     */
    stateByKind: text('state_by_kind'),
    stateById: text('state_by_id'),
    /**
     * DEAD. Left in place after a decision made the agent record's `data.runtime` the one
     * store. Nothing writes it and nothing reads it. See the table's
     * own comment above.
     */
    runtime: text('runtime'),
    /**
     * WHO STARTED THIS AGENT. The same pair the `worlds` table already carries for a world.
     *
     * The rule: whoever started an agent
     * manages it and answers for it. Before this, nothing recorded who started whom, so the refusal
     * an unregistered writer gets could not name the agent it should report to, and the `the parent`
     * answer the `proposal` kind has carried since August could never be used.
     *
     * NULL MEANS NOBODY RECORDED ONE. It is the honest value for an agent a person registered by
     * hand and for every row written before this column existed. It is NOT read as "the person
     * started it": that would make unregistered writers into the person's own children on the
     * strength of a missing value.
     *
     * IT IS NOT `created_by_kind` / `created_by_id` below. Those say who wrote this ROW, which may
     * be a migration or a person tidying up. This says who started the AGENT, which is a fact about
     * the work rather than about the record.
     */
    startedByKind: text('started_by_kind'),
    startedById: text('started_by_id'),
    /** The responsible agent, separate from the recorded starter. */
    ownerId: text('owner_id'),
  ownerKind: text('owner_kind'),
    /**
     * WHAT THIS AGENT MAY DO: one word from `design/permissions/roles.json`, or NULL.
     *
     * The words are not listed here and there is no CHECK constraint, for the reason `runtime` gives
     * above and `presentation_intent.intent` gives at length: the declaration the write gate reads
     * is the only place the words live, and a second list in SQL is a second list that can drift.
     * The declaration is a file rather than TypeScript so that a person can add a role without a
     * code change: a template is given for a person to make their own from.
     *
     * NULL MEANS NOBODY SET ONE, which is what every row registered before 6 September 2026 holds.
     * `A_ROW_WITH_NO_ROLE_READS_AS` in shared/roles.ts is the one place saying such a row is read as
     * a worker, and a screen says "no role set" rather than drawing a word nobody chose.
     *
     * A REGISTRATION NO LONGER LEAVES IT NULL. Criterion P75: the worker card is the default.
     * From 8 September 2026 a registration that names no card writes the
     * worker card here, and `card_chosen_by` below says the rule wrote it. The NULLs that remain are
     * rows registered before that, and they are left exactly as they are.
     */
    role: text('role'),
    /**
     * WHO CHOSE THE CARD ON THIS ROW, as JSON, or NULL. Criterion P75.
     *
     * `{"how":"the-rule","who":null}` — nobody named a card, so the rule wrote the worker card.
     * `{"how":"a-starter","who":{…}}` — whoever registered this agent named the card.
     * `{"how":"a-credential","who":{…}}` — the agent asked for it in its credential and the owner
     * gave it when they confirmed. `WhoChoseTheCard` in shared/roles.ts is the shape, and it is the
     * only place those three words live.
     *
     * NULL MEANS NOBODY RECORDED IT, which is every row written before 8 September 2026, and it is
     * NOT read as "the rule chose it": the word on such a row may have been a starter's choice or
     * may be the word the row was read as, and there is no way to tell now. A screen says nobody
     * recorded it. Backfilling would be inventing the answer.
     *
     * IT FOLLOWS THE RECORD, exactly as `role` above does: the agent record's `cardChosenBy` is
     * written by the registration and `keepTheAgentRegistryInStep` copies it here, so the change is
     * on the record's own history rather than only in a column.
     */
    cardChosenBy: text('card_chosen_by', { mode: 'json' }).$type<{
      how: string
      who: { kind: 'person' | 'agent'; id: string } | null
    }>(),
    /**
     * THE PERSON'S SAY THAT THIS AGENT MAY ACT FOR THEM, as JSON, or NULL. Criterion P59.
     *
     * ---------------------------------------------------------------------------------------
     * WHAT IT HOLDS AND WHY IT IS ONE COLUMN
     * ---------------------------------------------------------------------------------------
     *
     * EVERY GRANT THE PERSON HAS MADE THIS AGENT, oldest first, as a JSON list. Each is the grant's id,
     * which of the ends it has, what it ends at, when they granted it and when it ended. One column
     * rather than a table of its own, the way `work_area` is one column of paths: it is read whole
     * every time and never queried by a part of itself.
     *
     * THE LAST ENTRY IS THE ONE THAT COUNTS. The ones before it are grants the person made and ended, and
     * they stay because when a grant ended, and which of its ends did it, is a fact about the writes
     * made while it held. NULL is the ordinary case and means the person never said.
     *
     * IT FOLLOWS THE RECORD, exactly as `role` above does. The press writes `data.elevation` on the
     * secretary's `agent` record and `keepTheAgentRegistryInStep` copies it here, so the grant gets
     * a change row and a revision saying the person made it, and this column is what a refusal reads
     * on a request. The registry row is the installation's and an `agent` record is one project's,
     * which is the other half of why the refusal reads this and not the record.
     */
    elevation: text('elevation'),
    /**
     * WHERE THIS AGENT WORKS: the folders and files it is there to change, as a JSON array of paths.
     *
     * Criterion P43: the working area, its folders and files, is registered when an agent is registered
     * and started, which makes the changes easy to find. It is written when a
     * starter registers the agent, so that whoever checks the work afterwards can find the changes
     * rather than work them out from every write the agent made.
     *
     * IT IS RECORDED AND NOT ENFORCED. Nothing refuses a write outside the area, and nothing refuses
     * a registration that names no area. What a caller writing outside its area should be told is a
     * question nobody has answered, and a refusal invented here would be answering it.
     *
     * NULL MEANS NOBODY RECORDED ONE. An empty list means somebody said there is no area, which is a
     * different fact, and both are kept.
     */
    workArea: text('work_area', { mode: 'json' }).$type<string[]>(),
    /**
     * WHAT THIS AGENT WAS STARTED FOR: the id of the record whose end ends this role, or NULL.
     *
     * Criterion P15. Every card's "What ends it" line names the thing whose end ends the role, and
     * for a worker that thing is the piece of work it was started for. When
     * the claim on that record is released, the agent is retired with the reason.
     *
     * NULL MEANS NOBODY SAID, and such an agent is never retired by that rule. An agent started for
     * nothing in particular has no end to come, and inventing one would retire an agent because a
     * field was empty.
     *
     * IT IS NOT `work_area` above. That says WHERE this agent changes things, so its work can be
     * found afterwards; this says WHAT it was started for, so the end of that thing can end the role.
     */
    startedFor: text('started_for'),
    /**
     * THE RUN THAT REGISTERED THIS AGENT, or NULL because nobody recorded one. Criterion P11.
     *
     * The session record of the run that called POST /api/agents/started. It is what lets the first
     * run of this agent say which run started it — the `session` kind has had `parentAttachment`
     * since August and nothing ever wrote one, because nothing knew the answer. Measured on
     * 6 September 2026: 0 of 904 runs carried a parent.
     *
     * ONLY THE FIRST RUN IS FILLED IN FROM IT. An agent has many runs over its life and only the
     * first was started by the run that registered it. Filling the rest in would be a guess in a
     * fact's clothes.
     */
    startedByRun: text('started_by_run'),
    /** 1 when this agent is no longer given new work. 0 otherwise. */
    retired: integer('retired').notNull().default(0),
    /** One plain sentence saying why, when `retired` is 1. NULL otherwise, and nothing infers one. */
    retiredBecause: text('retired_because'),
    /**
     * WHEN THE ROW WAS RETIRED, AND BY WHOM.
     *
     * `retired` and `retired_because` were here from drizzle/0114 and said THAT a row was retired and
     * WHY. Nothing said when, and nothing said who — because until the retire door existed the only
     * writer was the release of a claim, and an office releasing its own claim is not a person a
     * reader would want named. A press is, and so is a starter retiring one of its own.
     *
     * NULL EXACTLY TOGETHER WITH `retired` BEING FALSE, and null on a row retired before this
     * existed: those were written by a claim release and nobody recorded the moment.
     */
    retiredAt: text('retired_at'),
    retiredByKind: text('retired_by_kind'),
    retiredById: text('retired_by_id'),
    /** LOCAL wall clock. No SQL default, for the reason `reader_anchors` gives. */
    createdAt: text('created_at').notNull(),
    /** The participant who created this row, or NULL because nobody recorded one. */
    createdByKind: text('created_by_kind'),
    createdById: text('created_by_id'),
    /** The world this agent is a citizen of. See CITIZENSHIP in `schema-parts/visitors.ts`. */
    homeWorld: text('home_world'),
    /** The installation that world belongs to. See CITIZENSHIP in `schema-parts/visitors.ts`. */
    homeInstallation: text('home_installation'),
    /** When it became a citizen of it. See CITIZENSHIP in `schema-parts/visitors.ts`. */
    citizenSince: text('citizen_since'),
    /**
     * WHICH VISITOR CREDENTIAL THIS AGENT WAS REGISTERED ON, or NULL because it needed none.
     *
     * Criterion P69, on what the owner found on 7 September 2026: a worker on the owner's other machine registered
     * itself as a worker from another machine with no confirmation from the owner at all. Registration
     * from anywhere but this machine is now refused without a credential the person has confirmed, and this
     * is what the row says afterwards.
     *
     * NULL IS THE ORDINARY ANSWER AND MEANS THIS MACHINE. Every row written before the column
     * existed is null, and so is every registration made here; one made from elsewhere cannot be
     * written without a credential. So null says "no credential was needed", never "nobody looked".
     *
     * IT IS THE CREDENTIAL'S ID AND NOT ITS TOKEN. A token is a secret shown once, at issue; an id
     * is what the Embassy lists and what a refusal names.
     */
    credential: text('credential'),
    /**
     * HOW THIS AGENT WISHES TO BE ADDRESSED, migration 0181. The
     * same four parts a person has, declared once in src/shared/address-as.ts. The agent writes its
     * own, with its own key, and nobody else writes them.
     *
     * NULL MEANS NOBODY HAS SET THAT PART, and a reader never fills one in.
     */
    addressName: text('address_name'),
    addressSecondPerson: text('address_second_person'),
    addressThirdPerson: text('address_third_person'),
    addressTitle: text('address_title'),
    // WHO LAST SET HOW THEY WISH TO BE ADDRESSED, AND WHEN, migration 0182. NULL when
    // nobody recorded it: before 0182, or never set.
    addressSetByKind: text('address_set_by_kind'),
    addressSetById: text('address_set_by_id'),
    addressSetAt: text('address_set_at'),
    /**
     * A PERMANENT RESIDENT, migration a_permanent_resident_has_a_space_of_its_own, by a
     * decision. The secretary proposes, the owner confirms with one press, and
     * src/server/lib/residents.ts writes these five in the same act that makes the agent's personal space.
     * NULL `resident_since` means this agent is not a resident; the other four are NULL exactly when
     * it is.
     */
    residentSince: text('resident_since'),
    /** The `proposal` record the secretary filed. */
    residentProposal: text('resident_proposal'),
    /** The `decision` record the person's press wrote, which settles that proposal. */
    residentDecision: text('resident_decision'),
    /** Who pressed Confirm: always a person. */
    residentConfirmedByKind: text('resident_confirmed_by_kind'),
    residentConfirmedById: text('resident_confirmed_by_id'),
    /**
     * THE SUCCESSOR THE OWNER NAMED FOR THIS RESIDENT ONCE IT WAS RETIRED, by registry id, or NULL because they
     * has named none. Taking the retired agent's handle does not make an agent its successor; only this column
     * does. The successor may read the space.
     */
    successorId: text('successor_id'),
    successorNamedAt: text('successor_named_at'),
    successorNamedByKind: text('successor_named_by_kind'),
    successorNamedById: text('successor_named_by_id'),
    /**
     * THE PICTURE-AND-NAME REMINDER AFTER A RESIDENT IS CONFIRMED, migration 0233: when the
     * confirmation filed it, and when a press settled it and who pressed, the person or the resident with its own key.
     * The reminder waits while `residentNamingAskedAt` is set and `residentNamedAt` is NULL. A resident confirmed
     * before 0233 has no reminder filed. src/server/lib/residents.ts is the one writer.
     */
    residentNamingAskedAt: text('resident_naming_asked_at'),
    residentNamedAt: text('resident_named_at'),
    residentNamedByKind: text('resident_named_by_kind'),
    residentNamedById: text('resident_named_by_id'),
    /**
     * A SECRETARY'S OWN SLEEP TIME, migration 0330, which each secretary sets for itself: the time
     * of day its sleep begins, as HH:MM on the office's clock, how many minutes it lasts, when it was last set, and
     * whether the agent itself or the person set it ('agent' or 'person'; the agent is this row, and the person is the
     * one owner). NULL is none: the office begins no sleep by itself. src/server/lib/resident-sleep.ts is the one
     * writer and the one reader.
     */
    sleepTimeStarts: text('sleep_time_starts'),
    sleepTimeMinutes: integer('sleep_time_minutes'),
    sleepTimeSetAt: text('sleep_time_set_at'),
    sleepTimeSetBy: text('sleep_time_set_by'),
    /**
     * WHETHER THIS AGENT READS A RELEASE FROM THE CHECK'S OWN RESULT, migration 0203:
     * one JSON object `{on, by, at, because}`, written whole by `setReadsReleasesFromTheCheck` in lib/participants.ts.
     * When `on` is true a release written to this agent does not wake it; a refusal always does. NULL means nobody
     * has said, and a release wakes it.
     */
    readsReleasesFromTheCheck: text('reads_releases_from_the_check'),
    /**
     * 1 WHEN THIS AGENT WAS REGISTERED WITH NO KEY OF ITS OWN, migration 0273. A starter asks for that with
     * `noKey: true` at POST /api/agents/started, and the mark is written in the same transaction as the row. A write
     * in the agent's name is then taken only with a run key or the office's key (lib/run-keys-only.ts). 0 on every
     * row written before the column existed, and on every other registration.
     */
    runKeysOnly: integer('run_keys_only').notNull().default(0),
  },
  // A HANDLE IS UNIQUE AMONG LIVE AGENTS ONLY, criterion I3, migration 0174.
  // A retired agent keeps its row and its handle, and a new agent may take that handle with an id of
  // its own. The plain index is kept for lookups by handle.
  (t) => [
    index('agents_handle_idx').on(t.handle),
    uniqueIndex('agents_live_handle_idx').on(t.handle).where(sql`retired = 0`),
  ],
), { existingArchive: true })
