// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { getTableName } from 'drizzle-orm'

/**
 * Every table in this database, by its SQL name, split by whether its contents were authored.
 *
 * WHY THIS LIST IS IN THE SCHEMA AND NOT IN THE EXPORTER THAT WILL NEED IT. A durable format has
 * to know which tables exist, and the answer has been wrong three times already: README.md says
 * three, this file said five until migration 0003, its own header said eleven until the planning
 * layer was counted, and a live database has fifteen. A list kept anywhere other than beside the
 * declarations drifts from them the first time somebody adds a table and only reads the file they
 * are editing. tests/schema-tables.test.ts checks these two arrays against the drizzle table
 * objects declared above AND against a freshly migrated database, so a table added without being
 * listed here fails the suite rather than being silently left out of a backup.
 *
 * AUTHORED means a person or an agent made it and it exists nowhere else, so it must round-trip
 * through any durable format. DERIVED means a scan rebuilds it wholesale, so it must be
 * REGENERATED rather than exported — a restored copy would describe the machine it came from.
 *
 * `__drizzle_migrations` is in neither list. It is drizzle's own bookkeeping; a restore applies
 * the migrations, which writes it, and then imports the data.
 *
 * ---------------------------------------------------------------------------------------
 * EVERYTHING BELOW THIS LIST IS DERIVED FROM IT, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------------------
 *
 * `records`, `links` and `changes` were used as a stand-in for "the tables that hold authored
 * work" in FOUR places — the reset guard, the scoped archive's notes, the backup verifier and the
 * migration loss-guard — and by 2026-08-12 there were twelve authored tables. Nothing derived any
 * of those lists from any other, so each was separately wrong and nothing failed: `npm run
 * db:reset` deleted a planning-only database without a word, a project archive said "Nothing has
 * been drafted" over a database full of drafts, `--check-only` called a backup with no planning
 * layer usable, and a server start migrated somebody's plan in place, unattended.
 *
 * So the lists below are computed from `AUTHORED_TABLES` and from the drizzle declarations
 * themselves, and every one of those four places reads one of them. A table added to
 * `AUTHORED_TABLES` and nowhere else fixes all four at once, or fails to compile.
 */
export const AUTHORED_TABLES = [
  'office_scene_settings',
  'office_map_layouts',
  // The model each run uses, set on the Settings page, criterion U2. One row for the installation.
  'run_models',
  // The Casting table and its history, migration 0189. Rows for every project
  // and for one project sit side by side, keyed by role and project.
  'casting',
  'casting_changes',
  // Several castings for each role, migration 0190 (a decision of the owner), and the probability cell from 0268.
  // One row per casting, with its id,
  // and its history. The two above are kept as migration 0189 left them.
  'casting_rows',
  'casting_row_changes',
  // The Casting labels, migration 0349, the names of kinds of work, and their history.
  'casting_labels',
  'casting_label_changes',
  // The directories somebody added by hand as preview roots, criterion U4. A singleton settings row
  // like the two above it: one row for the whole installation, its JSON keyed by workspace id.
  'preview_root_additions',
  // The price table the person sets in Settings, criterion U3. A singleton row like the three above it.
  'price_table',
  // The owner's list of quick inputs, migration 0272. A singleton row like the price table.
  'quick_input_list',
  // WHAT THE PERSON'S GRANT CARRIES IN THIS OFFICE, migration 0287: one row for each door the person changed. Authored:
  // the person chose each answer, and nothing can recreate it. It names no other row.
  'what_the_grant_carries',
  // First, because everything below it names a row in it. A restore that put the records back
  // before the workspaces existed would hold rows naming a project that is not there yet.
  'workspaces',
  'records',
  'links',
  'changes',
  // The revision ledger, added by migration 0060. AFTER `records`, because every revision is of one
  // — a restore that put the revisions back first would hold the history of a record that is not
  // there yet, the rule `workspaces` is first for. AUTHORED, and the strongest case of it in this
  // list: a revision holds content that exists in no other row, because `changes` never stored it.
  'revisions',
  'submission_baselines', 'legacy_unsealed_runs',
  'reader_anchors',
  'presentation_intent',
  'panel_layouts',
  'session_resources',
  // What an agent read in a folder, before a person has accepted any of it. Authored: an agent
  // wrote every row, and nothing can recompute one -- the folder it read may not be there tomorrow.
  'folder_readings',
  // Planning. Authored like the rest — somebody committed these hours — and the only tables in the
  // database with no workspace column, for the settled reason in `allocations`. There were four of
  // them until migration 0196 moved `planning_drafts` into `plans`; nothing here says how many,
  // because `PERSON_LEVEL_TABLES` in authored-table-of.ts counts them.
  'allocations',
  'planning_capacity',
  'planning_recurrences',
  // Plans, added by migration 0010. `plans` comes first because every row of `plan_lines` names one,
  // and a restore that put the lines back first would hold lines belonging to a plan that is not
  // there yet — the same rule `workspaces` is first for.
  'plans',
  'plan_lines',
  // THE REASON FOR EVERY ADD, REORDER AND DROP OF A LINE, added by migration 0170. Criterion P3.
  // AFTER `plan_lines`, because every row names one — though the reference is not enforced, so a
  // dropped line keeps its reason. Authored: the reason is somebody's own words and nothing can
  // recreate it, and a backup that did not carry this would lose why a plan changed.
  'plan_line_revisions',
  // EVERY ADDITION, FIRING AND HELD-BACK FIRING OF A COUNTER, added by migration 0172. Criteria CT2
  // and CT5 to CT7. AFTER `records`, because every row names a counter, which is a record. Authored:
  // the reason on an addition is somebody's own words, and what a firing's action answered — the
  // message ids, the task id, the job's result — exists in no other row.
  'counter_rows',
  // What somebody wrote about time, added by migration 0020. It comes after `plan_lines` because a
  // row of it may name a record and may name a plan line, so both have to be back before it.
  // Authored like everything above: the words are a person's own and nothing can recreate them.
  'planning_intents',
  // When somebody means to work on something, added by migration 0040. After `records`, because
  // every window names one. Authored: a person placed this block on a week.
  'work_windows',
  // ---------------------------------------------------------------------------------------
  // TALKING TO AN AGENT. AUTHORED, and the thread comes first
  // ---------------------------------------------------------------------------------------
  //
  // A conversation with an agent is somebody's own words about their own work, and the review that
  // produced it exists nowhere else — so a backup that did not carry these three would lose it.
  //
  // `agent_threads` FIRST, because a message and a run each name a thread. A restore that put the
  // messages back first would hold comments belonging to a conversation that is not there yet, the
  // same rule `workspaces` and `plans` come first for.
  //
  // These two are the reason `WORKSPACE_COLUMN` in authored-table-of.ts has a third form. They carry no
  // `workspace_id` — a copy of it on every message would be the same fact in two places — and they
  // are NOT person-level: each belongs to exactly one project, the one its thread names. Until
  // 18 August 2026 all three were left out of this list, because the rule could only say "this
  // column" or "no project", and calling them person-level would have made a project-scoped
  // archive print, over that project's own conversations, the sentence that says a plan belongs to
  // no project. That is a false sentence in an archive. The third form is what removed the choice
  // between a wrong answer and a missing one.
  'agent_threads',
  'agent_messages',
  'agent_runs',
  // A review: somebody started collecting remarks, from somewhere. AUTHORED — where a person
  // started reviewing, and what they had collected when they stopped, exists nowhere else. AFTER
  // the three above, because a review brought forward from round seven names the conversation its
  // remarks are still in, and a restore that put it back first would name a conversation that is
  // not there yet. It carries its own `workspace_id`, so it needs no entry in `SCOPED_THROUGH`.
  'reviews',
  // ---------------------------------------------------------------------------------------
  // THE CODE THIS PROJECT'S WORK IS IMPLEMENTED IN. AUTHORED, and the order is a two-level one
  // ---------------------------------------------------------------------------------------
  //
  // All three after `records`, because a map row names a record. `repositories` FIRST, because a
  // revision and a map row each name one. `implementation_revisions` SECOND, because a map row may
  // name a revision — `implementation_map.revision_id` references it — so a restore that put the map
  // back first would hold rows naming a revision that is not there yet. That is the same rule
  // `workspaces`, `plans` and `agent_threads` come first for, applied to two levels rather than one.
  'repositories',
  'implementation_revisions',
  'implementation_map',
  // What one scan saw about one file at one moment. AUTHORED because nothing can rebuild a dated
  // observation — the file index it is compared against is derived, and that difference is exactly
  // why the `first_scan` column on it has to exist. It names no record, so it goes after `records`
  // only because everything does.
  'file_observations',
  // Which work a restriction reached, and whether anybody re-checked it. AFTER `records` and
  // `links`, because every row names a restriction record, an affected record and the path of links
  // it was reached by.
  'revalidations',
  // The one-way marker for comments whose words went out before Mole Office stored a word for it. AFTER
  // `records`, because every row names one. It has no `workspace_id`; `SCOPED_THROUGH` in authored-table-of.ts says
  // which project a row is in.
  'annotation_words_fixed',
  // Whether the stored reading-measure words carry their new names, added by migration 0173. AFTER
  // `records`, because the row is a fact about what the records hold. One row for the whole
  // database, so it belongs to no project.
  'measure_words_renamed',
  // ---------------------------------------------------------------------------------------
  // WHO TAKES PART, AND THEIR PICTURES. AUTHORED, INSTALLATION-LEVEL, and `assets` comes first
  // ---------------------------------------------------------------------------------------
  //
  // None of the four names a project, and that is what they are: the people and the durable agents
  // of this installation are the same in every project on this machine (criterion M2 of
  // design/messages/ACCEPTANCE.md). `WORKSPACE_COLUMN` in authored-table-of.ts therefore answers null for all four,
  // and `PERSON_LEVEL_TABLES` — the tables a project-scoped archive cannot carry — now holds two
  // kinds of table rather than one. Its own note says which.
  //
  // `assets` FIRST, because a person row and an agent row each name one and a restore that put the
  // people back first would hold rows naming a picture that is not there yet — the rule
  // `workspaces`, `plans` and `agent_threads` come first for. `agents` before `agent_records` for
  // the same reason, and `agent_records` also names a row of `records`, which is far above.
  //
  // AUTHORED and not measured: an uploaded avatar exists nowhere else, and a backup that did not
  // carry these would lose somebody's own picture and the name they chose for an agent.
  'assets',
  'people',
  'agents',
  'agent_records',
  // A PERMANENT RESIDENT'S LEAVE TO READ, VOID MARKS AND WRITES, added by migration
  // a_permanent_resident_has_a_space_of_its_own. AFTER `agents`, because every row names a
  // resident and a grant names its reader too. Authored: each row is a resident's or the owner's own act, with who
  // and when, and nothing can recreate one. The files themselves are beside the database, in personal-spaces/, and
  // every backup carries them (scripts/backup.ts).
  'resident_read_grants',
  'resident_void_marks',
  'resident_space_writes',
  // A RESIDENT'S SLEEPS AND POSTPONED SLEEPS, added by migration 0233. AFTER `agents`, because every row names a
  // resident. Authored: each row is a resident's or the person's own act, with who and when, or a sleep Mole Office
  // began at the sleep time the resident or the person set (migration 0330).
  'resident_sleeps',
  // WHICH INSTALLATION THIS DATABASE BELONGS TO, added by migration 0122. One row, written once
  // from the declaration and never rewritten. AUTHORED rather than derived, and the difference
  // matters: the id is worked out from the declaration only on the day the row is first written,
  // so a database restored without it would be given the id the declaration says TODAY, which is a
  // different fact wearing the same name. Nothing can rebuild it, so a backup has to carry it.
  'installation',
  'runtime_settings',
  'office_restart_grants',
  // EVERY WORLD THIS INSTALLATION HAS EVER HAD, added by migration 0123. Authored: a world appearing
  // and a world disappearing are moments, and nothing can recreate a moment. It names no project —
  // a world holds every project it has — so it is person-level in the sense the archive means.
  'worlds',
  // A CITIZEN OF ONE WORLD WORKING IN ANOTHER, added by migration 0124. Authored: somebody said what
  // they came to do, and nothing can recreate a moment or a sentence.
  'visits',
  // A VISITING AGENT'S OWN CREDENTIAL AND EVERY REQUEST MADE UNDER IT, added by migration 0140.
  // Authored: an agent asked for one, a person confirmed it, and requests were made — all moments,
  // and nothing can recreate a moment. `visitor_credentials` first, because every request names one
  // — the rule `workspaces`, `plans` and `agent_threads` come first for. They name no project: a
  // credential is held against this installation, not against one project's work.
  'visitor_credentials',
  'visitor_requests',

  // THE MACHINES THIS OFFICE TRUSTS, added by migration 0144. Authored: somebody pressed to trust a
  // machine, or confirmed a visiting agent from one, and nothing can recreate a press. After
  // `visitor_credentials`, because a row added by a confirmation names the credential that added
  // it. It names no project: which machines an office trusts belongs to the installation, like the
  // credentials above. Criterion P73.
  'trusted_machines',

  // HOW FAR EACH MESSAGE GOT WITH EACH RECIPIENT. After `records`, because every row names one.
  'message_delivery',
  // WHO READ A CONVERSATION THEY WERE NOT PART OF, added by migration 0119. Authored: a person's
  // read of two agents' conversation happens once and nothing can recreate it. It carries its own
  // `workspace_id`, because the thing it is about is a pair of participants rather than a record.
  // Since migration 0278 it keeps the newest read of each reader in each conversation in each project.
  'conversation_reads',
  // A GROUP AND WHO IS IN IT, added by migration 0120. Authored: somebody opened it, or a conflict
  // between two work claims did, and nothing can recreate either. `groups` first, because every
  // membership names one — the rule `workspaces`, `plans` and `agent_threads` come first for.
  'groups',
  'group_members',
  // WHAT AN AGENT IS WORKING ON, added by migration 0121. Authored: an agent said it, and nothing
  // can recreate the moment it said so. After `records`, because every claim names the session
  // record of the run whose life its lease follows.
  'work_claims',
  // WHICH ADDRESSEE'S DEAD LETTERS A SECRETARY HAS TAKEN ON, added by migration 0160. Authored: a
  // secretary claimed it, and nothing can recreate the moment it did. After `groups`, because every
  // row names the group its broadcast was announced in.
  'dead_letter_claims',
  // WHICH LIVE SESSION IS ANSWERING AS ONE DURABLE AGENT, added by migration 0131. Authored: a
  // session said it was there, and nothing can recreate the moment it said so. After `records` and
  // after `agents`, because a hold names a session record and an agent registry row. A restored row
  // is always read as lapsed, for the reason the declaration gives.
  'handle_holds',
  // HOW ONE PERSON HAS ARRANGED THEIR CONTACTS LIST, added by migration 0127. Authored: they made a
  // group, renamed one, moved somebody or set an order, and nothing can recreate any of those. It
  // names no project, so it is person-level in the sense the archive means. `contact_groups` first,
  // because a placement may name a group somebody made — the rule `workspaces`, `plans` and
  // `agent_threads` come first for.
  'contact_groups',
  'contact_placements',
  // WHETHER ONE PERSON HAS FOLDED ONE CONTACT GROUP AWAY, added by migration 0161. Authored: a
  // person pressed to fold or unfold it, and nothing can recreate the press. It names no project,
  // so it is person-level in the sense the archive means. After `contact_groups` only because
  // everything follows the order somebody reads it in; nothing here names a row of that table.
  'contact_group_collapses',
  // A REQUEST FOR ONE PRESS, migration 0206. AFTER `workspaces`, which every row names.
  // Authored: an agent asked and the person answered, and nothing can recreate either.
  'one_press_requests',
  // ONE USE OF A TOOL, ONE ROW, migration 0231 (wave 13s round 33). AFTER `records`, because every row names a run.
  // Authored: an agent used a tool and said what it did, and nothing can recreate either.
  'tool_uses',
  // A NAMED TEST FILE RESULT, migration 0279. AFTER tool_uses, which every row names.
  // Authored: an agent's tool observed it, and nothing can recreate that observation.
  'test_file_runs',
  // A HANDOVER DOCUMENT FOR AN AGENT, migration 0232. AFTER `workspaces`,
  // which every row names. Authored: an agent or the person wrote it, and nothing can recreate it.
  'handovers',
  // A READINESS CHECKLIST AND ITS SIGNATURES, migration 0252. The checklists
  // after `workspaces`, which every one names; the signatures after the checklists they belong to. Authored: somebody
  // raised it and somebody signed, and nothing can recreate either.
  'readiness_checklists',
  'readiness_signatures',
  'signing_packages',
  'signing_package_items',
  // EVERY ASK FOR A QUICK INPUT, migration 0272. AFTER `agents` and `records`, because every row
  // names an agent and a run. Authored: an agent asked and the office answered, and nothing can recreate either.
  'quick_input_asks',
  // ONE PRESS FOR THE PERSON UNDER THEIR GRANT, migration 0280. Authored: a secretary pressed and said why, and nothing
  // can recreate either. A change row names its press in `press_id`, which is not a foreign key, so the order of the
  // two tables does not matter to a restore.
  'presses_for_the_person',
] as const

export const LEGACY_DERIVED_TABLES = [
  'source_files',
  'source_index',
  'source_file_hashes',
  // What a resolver worked out about which code serves which record. Every row is deleted by the
  // next rebuild of its repository, so a restored copy would describe a scan of another machine.
  'implementation_findings',
] as const

import { storageFiles, storageTotals, storageMeasurement } from './schema-parts/storage.ts'

// Checked backfill rebuilds the physical inventory and its summaries from the store folders.
export const DERIVED_TABLES = [
  ...LEGACY_DERIVED_TABLES,
  ...[storageFiles, storageTotals, storageMeasurement].map(getTableName),
] as const

/**
 * The tables Mole Office filled by MEASURING ITSELF. A third class, and neither of the other two is true.
 *
 * `AUTHORED_TABLES` means rows that arrive because a person or an agent wrote something. Nobody
 * wrote a telemetry row; the server answered a request. `DERIVED_TABLES` means rows a scan rebuilds,
 * and telemetry cannot be regenerated by anything — calling it derived would put a sentence in an
 * archive's README telling a restorer these tables come back, and they never would.
 *
 * WHAT THE THIRD CLASS BUYS, AND IT IS THE REASON IT EXISTS RATHER THAN A TIDINESS. The migration
 * guards ask "does this database hold work" by counting `IRREPLACEABLE_TABLES`, which is a filter of
 * `AUTHORED_TABLES`. Keeping these four out of that list is what keeps a fresh developer database
 * with two hundred telemetry rows and no work in it answering zero, and what keeps the guard that
 * reads a shrinking table as loss from reading a legitimate prune as one.
 *
 * AND THEY ARE NOT ARCHIVED AT ALL. An import is all of an archive or none of it, and the importer
 * refuses a region name it does not know, so these tables have no `REGION_COLUMNS` entry and are not
 * regions. What that costs is said in the archive's own README rather than left as a silence: a
 * restore does not bring them back, and it cannot, because nothing can recompute a measurement.
 *
 * tests/schema-tables.test.ts asserts every table in schema.ts is in EXACTLY ONE of the three lists,
 * so a table added to none of them fails the suite rather than being quietly left out of a backup.
 *
 * `held_keys` AND `header_only_calls` ARE HERE FOR THE SECOND REASON AND NOT THE FIRST. They are not
 * telemetry: the first holds the hashes of keys an agent was issued and the second counts callers who
 * claimed an identity without one. What makes both measured is the property that matters to a durable
 * format: NOTHING CAN REBUILD THEM, AND NO BACKUP MAY CARRY THEM. A key hash in a backup is a secret
 * one step from its key, and a copy, a backup and an export must carry no key.
 * Kept out of `AUTHORED_TABLES` is what keeps them out of all three.
 */
export const MEASURED_TABLES = [
  'api_calls',
  'outside_reads',
  'usage_stretches',
  'usage_checks',
  'held_keys',
  // Credentials are excluded from authored exports and every copy, like identity key hashes.
  'run_tokens',
  'header_only_calls',
  // THE COUNTS THAT STAND WHERE THE LONG-POLL ROWS USED TO, for criterion U6.
  // Measured like the two above it: nobody wrote a counted row, the server counted
  // requests it was already answering, and nothing can rebuild one — so no archive carries it.
  'hourly_calls',
  // Gate encounters are measured and cannot be rebuilt. The zero rows written at start are no authored work,
  // so they must not make an empty office look like a database holding work to the migration guards.
  'gate_counts',
  // How far the gate-count spool is read. It goes with the counts it made: a database without it reads the spool again
  // from the start, into counts that also start again.
  'gate_count_spool_reads',
] as const

export type AuthoredTable = (typeof AUTHORED_TABLES)[number]
export type DerivedTable = (typeof DERIVED_TABLES)[number]
export type MeasuredTable = (typeof MEASURED_TABLES)[number]

/**
 * THE SIX TABLES OF THE INDEX OF THE RECORDS' TEXT (wave 13y round 64), IN NONE OF THE THREE LISTS ABOVE.
 *
 * `record_text` is an SQLite full-text table of every record's title, summary and the string values in its data, and
 * SQLite keeps it in the four `record_text_*` tables beside it. `record_text_keys` gives each record id the number the
 * index knows it by. GET /api/search and GET /api/report-files/named-inside read it (src/server/lib/record-text-index.ts).
 *
 * NOT A DRIZZLE TABLE, because drizzle cannot declare a full-text table, and the five are SQLite's own. No person
 * writes a row here: three triggers on `records` write every row from the records, so a lost row is not lost work, and
 * no backup, export or import needs to carry them as such. A copy of the whole file carries them with the records.
 */
export const RECORD_TEXT_INDEX_TABLES = [
  'record_text',
  'record_text_config',
  'record_text_data',
  'record_text_docsize',
  'record_text_idx',
  'record_text_keys',
] as const

/**
 * THE AUTHORED TABLES NO BACKUP AND NO EXPORT CARRIES. The table stays declared and migrated, and it
 * stays in `AUTHORED_TABLES`, so the guards that ask whether a database holds work still count it and
 * nothing deletes its rows in the office's own database.
 *
 * `panel_layouts` is here by item 1 of a decision on problem _vHwDWnDLLGd. The
 * table stays declared, backups and exports stop carrying it, and nothing is deleted. Its only writer,
 * PUT /api/layout/:id, went with the panel grid on 10 August 2026.
 *
 * WHAT READS THIS LIST: the export carries `ARCHIVED_TABLES` below and not these; the importer reads
 * such a region in an older archive, writes none of it and says so (src/server/lib/import.ts); the
 * backup deletes these tables' rows in its copy before the copy is rewritten (scripts/backup.ts); and
 * the restore proof leaves them out of its corpus (NOT_IN_THIS_PROOF in scripts/restore-check.ts).
 */
export const LEFT_OUT_OF_BACKUPS_AND_EXPORTS = ['panel_layouts'] as const satisfies readonly AuthoredTable[]

export type LeftOutTable = (typeof LEFT_OUT_OF_BACKUPS_AND_EXPORTS)[number]

/** An authored table a backup and an export carry: every one but those on the list above. */
export type ArchivedTable = Exclude<AuthoredTable, LeftOutTable>

function isArchived(table: AuthoredTable): table is ArchivedTable {
  return !(LEFT_OUT_OF_BACKUPS_AND_EXPORTS as readonly string[]).includes(table)
}

/** The authored tables an archive carries, in `AUTHORED_TABLES` order. */
export const ARCHIVED_TABLES: readonly ArchivedTable[] = AUTHORED_TABLES.filter(isArchived)

/**
 * THE TABLES NO COPY OF THIS DATABASE MAY CARRY.
 *
 * `held_keys` holds the SHA-256 of every key the office ever issued: agents' keys, the person's own
 * devices' keys, live ones and revoked ones. A key hash is a secret one step from its key, and the owner
 * ruled that no copy, backup or export carries a key. The export honours it
 * because only `AUTHORED_TABLES` are exported and `held_keys` is not among them. The backup command
 * copies the WHOLE file with SQLite's online backup, so it must empty these tables IN THE COPY after
 * writing it, and the restore proof must count them among the tables a restore must not bring back.
 *
 * NAMED ONCE, in src/config/what-a-copy-must-not-carry.mjs, and re-exported here. The backup
 * command and the restore proof ask the same question of the same list, and so do the two plain
 * JavaScript tools that copy the file, tools/isolated-mole-office.mjs and tools/office-copy.mjs. They
 * cannot import this TypeScript module, so the list lives where all four can read it. A table emptied
 * by one and left in another is the drift that one list exists to stop.
 */
export { NOT_CARRIED_TABLES } from '../../config/what-a-copy-must-not-carry.mjs'

export type NotCarriedTable = (typeof import('../../config/what-a-copy-must-not-carry.mjs').NOT_CARRIED_TABLES)[number]
