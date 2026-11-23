// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

/**
 * CITIZENSHIP: WHICH WORLD A PERSON OR AN AGENT BELONGS TO, and this installation's own id.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A CITIZEN IS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion C1 of design/messages/ACCEPTANCE.md section 8: everybody, agent or person, registers in
 * a world. Registering in a world is becoming a citizen of it, and the main world is the default home.
 *
 * A world is one running Mole Office with one database, and its identity is the identity of that
 * database — the sixteen hex characters src/config/database-identity.mjs works out. The two
 * registries are per database, so every row in `people` and `agents` is already a row of one
 * world's roll. The citizenship columns on `people` and `agents` WRITE THAT DOWN rather than leaving
 * it implied, because a participant who visits another world arrives in a second database where
 * nothing else would say where they came from.
 *
 * `home_world` IS THE DATABASE IDENTITY AND NOT A FOREIGN KEY. There is no `worlds` row to point
 * at from here: the office lives in the main world alone (criterion C2), and these two tables are in
 * every world's database. A foreign key would resolve in one database and dangle in every other.
 *
 * `citizen_since` IS THE MOMENT OF REGISTRATION, because citizenship is got at registration, and for a
 * row that already existed when migration 0122 ran, that moment is its `created_at`. It is not the
 * moment the migration ran: the row has been in this database since it was written, so it has been
 * of this world since it was written. Nothing is guessed by saying so.
 *
 * ALL THREE ARE NULLABLE, and NULL means nobody could say. It is a real state: a database whose
 * file the filesystem records no creation time for has no identity at all
 * (src/config/database-identity.mjs answers `unknown` rather than hashing a zero), and a row whose
 * world could not be read is left empty rather than given a made-up world.
 */
export const installation = aPartTable(sqliteTable(
  'installation',
  {
    /**
     * Always 1. This table holds one row and the CHECK below is what makes that true in SQL rather
     * than in a comment somebody has to trust.
     */
    onlyRow: integer('only_row').primaryKey(),
    /**
     * THE ID OF THE INSTALLATION THIS DATABASE BELONGS TO, written once and never rewritten.
     *
     * An installation is one person's Mole Office on one machine: the canonical stack, every
     * worktree of it, and every scratch world any of them starts. Criterion C2 puts it on every
     * world row so that two offices can be told apart when they ever have to talk to each other.
     *
     * WRITTEN ONCE IS THE WHOLE POINT. It is worked out from the declaration the first time this
     * database is migrated and then it is this database's own fact, so a copy of the database
     * carries the installation it was copied from — which is what a copy is.
     */
    id: text('id').notNull(),
    /** One plain sentence saying where the id came from, so a reader never has to guess. */
    how: text('how').notNull(),
    /** LOCAL wall clock. No SQL default, for the reason `reader_anchors` gives. */
    writtenAt: text('written_at').notNull(),
    /**
     * WHEN THE PERSON CLOSED THE ONE-VERSION KEY WINDOW, AND WHO CLOSED IT. Criterion P83, point 6.
     *
     * For one version a request that sends the person's headers and no key still counts from this
     * computer and from the machines on the trusted list (P73); one press closes both halves, and
     * these three columns are the act. They are the office's because there is one office, one window
     * and one act, and `installation` is the office's one singleton row — a singleton table for one
     * fact would be a second shape for the same kind of thing.
     *
     * ALL THREE ARE NULLABLE AND NULL MEANS IT IS STILL OPEN: every database, restored or not, ships
     * with the window open and closing it is the person's press. The who is the same kind-and-id pair
     * `trusted_machines` writes in `added_by_kind` and `added_by_id`, so one shape names a who in both
     * places. Added by migration 0165 — written as 0163, renumbered before it landed — amended in place before it had run anywhere.
     */
    windowClosedAt: text('window_closed_at'),
    windowClosedByKind: text('window_closed_by_kind'),
    windowClosedById: text('window_closed_by_id'),
    /**
     * WHAT THE OFFICE KEEPS. Criterion U6. Three numbers, each
     * the office's own rather than a person's: how many backups to keep, how many days an untraced
     * request row survives, and how many days a traced one does. They are columns here for the same
     * reason the three above are — there is one office, and `installation` is its one singleton row.
     *
     * NULL MEANS NOBODY HAS CHOSEN, and then the default in `@shared/what-is-kept.ts` is in force.
     * That is the same third answer `media_load` carries and it is not a silent fallback: the panel
     * says nobody has chosen. A value that is present and cannot be read is a refusal, never a
     * quiet default. Added by migration 0166.
     */
    keepBackups: integer('keep_backups'),
    untracedRequestDays: integer('untraced_request_days'),
    tracedRequestDays: integer('traced_request_days'),
    /**
     * HOW FAR OUT A GOAL REACHES. Criterion P1: the spans are a
     * setting, short is within two weeks, medium within two months and long within a
     * year. The three are columns here for the same reason the three above are — there is one
     * office, and `installation` is its one singleton row.
     *
     * THREE AND NOT FOUR. Distant has no time limit, so there is no number to
     * store for it; a fourth column that must always be NULL would say "nobody has chosen" about a
     * thing nobody can choose. See `@shared/goal-spans.ts` for the whole reason.
     *
     * NULL MEANS NOBODY HAS CHOSEN, and then the default in `@shared/goal-spans.ts` is in force and
     * the Settings section says so. A value that is present and cannot be read is a refusal, never a
     * quiet default. Added by migration 0169.
     */
    goalShortDays: integer('goal_short_days'),
    goalMediumDays: integer('goal_medium_days'),
    goalLongDays: integer('goal_long_days'),

    /**
     * WHETHER AGENTS MAY INJECT A MESSAGE TO A PERSON. Criterion M91 was settled on 25 September
     * 2026 by one of the person's decisions. The setting is one switch for
     * every agent, on the Settings page.
     * A column here for the same reason as the settings above: it is one fact about the office.
     *
     * NULL MEANS NOBODY HAS CHOSEN, and it reads as "agents may inject". 1 is the switch on and 0 is
     * the switch off. `src/server/lib/inject-setting.ts` is the one reader and the one writer, and it
     * refuses any other value. Added by migration 0175.
     */
    agentsMayInject: integer('agents_may_inject'),

    /**
     * WHICH ADDRESS IS WHICH MACHINE, IN THE PERSON'S OWN WORDS. The setting was settled on
     * 27 September 2026 by one of the person's decisions. The setting is a
     * small table in Settings where the person names which address is which machine, so a message reads "from
     * laptop". A column here for the same reason as
     * the settings above: it is one fact about the office.
     *
     * A JSON object from address to name. NULL MEANS NOBODY HAS NAMED ANY ADDRESS. `src/server/lib/
     * machine-names.ts` is the one reader and the one writer, and it refuses anything else. Added by
     * migration 0187.
     */
    machineNames: text('machine_names'),

    /**
     * THE SECRETARY WHO TAKES THE DEAD LETTERS, by its registry id. The person
     * names one agent on the Settings page, and the dead-letter sweep delivers its line to that agent
     * only. A column here for the same reason as the settings above: it is one fact about the office.
     *
     * NULL MEANS NOBODY HAS NAMED ONE. `src/server/lib/dead-letter-secretary.ts` is the one reader and
     * the one writer, and it checks each time that the agent still qualifies. Added by migration 0198.
     */
    deadLetterSecretary: text('dead_letter_secretary'),
    deadLetterAfterDays: integer('dead_letter_after_days'),
    deadLetterAfterCount: integer('dead_letter_after_count'),
    /**
     * THE ONE ADDRESS A BROWSER IS SENT TO when it opens a page at another of this machine's own
     * addresses, so that one pairing covers the office. The person chooses it on the Settings page.
     * A column here for the same reason as the settings above: it is one fact about the office.
     *
     * NULL MEANS NOBODY HAS CHOSEN, and then the address MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES names
     * is in force, or none. `src/server/lib/address-for-browsers.ts` is the one reader and the one
     * writer. Added by migration 0207.
     */
    addressForBrowsers: text('address_for_browsers'),

    /**
     * THE MERGE QUEUE'S OWNER, by its registry id. Besides the person, the merge queue's owner may move a
     * merge entry to the front of its lane. The person names that owner on the Settings
     * page. A column here for the same reason as the settings above: it is one fact
     * about the office.
     *
     * NULL MEANS NOBODY HAS NAMED ONE, and then only the person may move an entry. `src/server/lib/merge-queue-owner.ts`
     * is the one reader and the one writer, and it checks each time that the agent still qualifies.
     */
    mergeQueueOwner: text('merge_queue_owner'),

    /**
     * WHETHER THE MERGE TOOL RUNS AN ENTRY'S RELATED TESTS BEFORE ITS WHOLE SUITE. That is part B of
     * a decision. The setting is kept off until it no longer slows
     * anything. A column here for the same reason as the settings above: it
     * is one fact about the office.
     *
     * NULL MEANS NOBODY HAS CHOSEN, and it reads as off. 1 is on and 0 is off. `src/server/lib/related-tests-first.ts`
     * is the one reader and the one writer, and it refuses any other value. Added by migration 0213.
     */
    relatedTestsFirst: integer('related_tests_first'),

    /**
     * THE TOPS OF THE THREE RANGES THE OFFICE'S OWN LOAD IS READ AGAINST: the median read time in milliseconds, the
     * share of one core in per cent, and the resident memory in megabytes. Columns here for the same
     * reason as the settings above: each is one fact about the office.
     *
     * NULL MEANS NOBODY HAS CHOSEN, and the default in `@shared/office-load.ts` is in force. They are not the person's
     * decided numbers, so the secretary card may change them with a reason. `src/server/lib/office-load.ts` is the one
     * reader and the one writer. Added by migration 0230.
     */
    loadReadMsTop: integer('load_read_ms_top'),
    loadCpuPercentTop: integer('load_cpu_percent_top'),
    loadMemoryMbTop: integer('load_memory_mb_top'),

    /**
     * WHICH PLUGINS ARE SWITCHED ON: a JSON object from a plugin's id to true or false. A column here
     * for the same reason as the settings above: it is one fact about the office.
     *
     * NULL MEANS NOBODY HAS SWITCHED ANY PLUGIN, and every plugin is off. A plugin missing from the object is off too.
     * `src/server/lib/plugins.ts` is the one reader and the one writer, and it refuses any other value. Added by
     * migration 0234.
     */
    pluginSwitches: text('plugin_switches'),
    /**
     * WHETHER THE MESSAGE WORKER STARTS CHECKS IN MERGES-ONLY MODE, and THE FORK BASES A SEAL IS REFUSED ON (a JSON list
     * of commit ids). NULL means nobody has chosen: off, and no list.
     * `src/server/lib/checks-in-merges-only.ts` is the one reader and writer of both. Added by migration 0251.
     */
    checksInMergesOnly: integer('checks_in_merges_only'),
    staleForkBases: text('stale_fork_bases'),
    /**
     * WHEN THE MESSAGE WORKER FIRST TOOK MESSAGES WRITTEN IN ANOTHER PROJECT. Written once, by the
     * first full reading of the worker's queue under that rule, and never rewritten. A message written in another project
     * is handed to the worker only when it was written after this moment. NULL means the rule has not run on this database
     * yet. `src/server/lib/worker.ts` is the one reader and writer. Added by migration 0312.
     */
    otherProjectsMessagesSince: text('other_projects_messages_since'),
    /**
     * WHEN THIS OFFICE BEGAN TO KEEP THE OWNER HAND-OVERS, the rows of `agent_owner_changes`, as a local stamp. Written
     * once, by the first start of the code that keeps them, before it serves, and never rewritten. A hand-over before it
     * is in no row. NULL means that code has not started on this database yet. The file that writes those rows sets it
     * and reads it, and an archive carries it. Added by migration 0356.
     */
    ownerChangesSince: text('owner_changes_since'),
  },
  () => [check('installation_holds_one_row', sql`only_row = 1`)],
), existingArchive)
