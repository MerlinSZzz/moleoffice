// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * One declaration of the database, and it is src/server/db/schema.ts.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Until migration 0003 the database had ten tables and schema.ts declared five. The other five
 * were created by `CREATE TABLE IF NOT EXISTS` statements that ran at import time, in the files
 * that owned the features: `ensureLayoutTable()` in api/layout.ts, `ensureResourceTable()` in
 * lib/resources.ts and `ensureSourceIndexTables()` in lib/sourceindex.ts. README.md said three.
 *
 * Three different answers to "what is in this database" is not a documentation problem. It is the
 * defect this codebase keeps hitting — two places that must agree with nothing making them agree —
 * and in SQL it is the worst version of it, because it fails at runtime on INSERT rather than at
 * compile time. Whichever writer reaches a new database first decides the shape, and the other one
 * finds out in production. It is also what would break a backup: an export written from schema.ts
 * alone would silently miss half the database, and that would only be discovered on the first
 * restore.
 *
 * So the tests below are about the count and the names, not about the mechanism. They fail if a
 * table is declared and never migrated, if a migration creates a table nobody declared, if a table
 * is added without being classified as authored or derived, and if any file outside drizzle/ takes
 * up creating tables again.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE NAMES ARE WRITTEN OUT HERE BY HAND
 * ---------------------------------------------------------------------------------------
 *
 * A test that compared schema.ts against a migrated database and nothing else would have passed
 * before this change as happily as after it: five declared, five migrated, agreed. It would also
 * pass if somebody deleted a table from both. The literal list below is what makes these tests
 * mean something — here are their names, and a new one has to be typed here on purpose, by
 * somebody who has decided whether it round-trips through a backup.
 *
 * THERE ARE THREE ANSWERS TO THAT QUESTION SINCE ROUND TEN, NOT TWO. A table is authored, derived,
 * or MEASURED — the last one being what Mole Office recorded about itself while it answered requests.
 * Nobody wrote a measured row, so it is not authored; nothing can rebuild one, so calling it derived
 * would put a sentence in an archive telling a restorer these tables come back. The test below
 * asserts every table is in exactly one of the three, so a new table in none of them fails here.
 *
 * THAT IS NOT A FORMALITY, AND ROUND FIVE MEASURED IT. `planning_intents` was created by migration
 * 0020 and left out of `AUTHORED_TABLES`, so a backup, a project archive and a restore carried no
 * intent row at all and the restore still reported success. These tests are what went red until it
 * was registered.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import Database from 'better-sqlite3'
import { getTableName, is } from 'drizzle-orm'
import { SQLiteTable, getTableConfig } from 'drizzle-orm/sqlite-core'
import { afterEach, describe, expect, it } from 'vitest'

import * as schema from '../src/server/db/schema.ts'
import { AUTHORED_TABLES, DERIVED_TABLES, MEASURED_TABLES, RECORD_TEXT_INDEX_TABLES } from '../src/server/db/schema.ts'
import { everyPartTable } from '../src/server/db/every-part-table.ts'
import { PERSON_LEVEL_TABLES, WORKSPACE_COLUMN } from '../src/server/db/authored-table-of.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { TABLES_IN_A_FILE_OF_THEIR_OWN, whatTiesItToTheOfficeDatabase } from './tables-in-a-sqlite-file-of-their-own.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const MIGRATIONS = join(REPO, 'drizzle')
const SRC = join(REPO, 'src')

/**
 * Every table this database has, written out rather than derived from anything.
 *
 * AUTHORED means a person or an agent made the rows and they exist nowhere else, so a durable
 * format has to carry them. DERIVED means a scan rebuilds them wholesale, so a durable format must
 * REGENERATE them instead — a restored copy would describe whichever machine it came from.
 */
const EVERY_TABLE = [
  // A chosen scene belongs to the installation and must survive a whole-office restore.
  'office_scene_settings',
  'office_map_layouts',
  // The model each run uses, added by migration 0176. Authored: a person pressed to set it on the
  // Settings page, and nothing can recreate the press. Criterion U2.
  'run_models',
  // The Casting table and its history, added by migration 0189. Authored: the
  // person cast each role, and nothing can recreate what was chosen or when.
  'casting',
  'casting_changes',
  // Several castings for each role and their history, added by migration 0190.
  // Authored for the same reason: the person chose each casting and which one the tools take.
  'casting_rows',
  'casting_row_changes',
  // The Casting labels and their history, added by migration 0349. Authored: the person and agents
  // make each label and write what it means, and nothing can recreate those words.
  'casting_labels',
  'casting_label_changes',
  // The directories somebody added by hand as preview roots, added by migration 0165. Authored: a
  // person pressed to add one on the Settings page, and nothing can recreate the press. Criterion U4.
  'preview_root_additions',
  // The price table the person sets in Settings, added by migration 0177. Authored: the owner typed the
  // prices, and nothing can recreate them. Criterion U3.
  'price_table',
  // The owner's list of quick inputs, added by migration 0272. Authored: the person set or
  // cleared the list, and nothing can recreate it.
  'quick_input_list',
  // WHAT THE PERSON'S GRANT CARRIES IN THIS OFFICE, added by migration 0287 (wave 13s round 2a). Authored: the person
  // changed each answer, and nothing can recreate it.
  'what_the_grant_carries',
  'submission_baselines', 'legacy_unsealed_runs',
  // Planning, added by Wave 5 and grown by migration 0010. Authored — somebody committed those
  // hours and somebody wrote those words — and the only tables in the database with no workspace
  // column, because planning is person-level and spans projects rather than belonging to one.
  'allocations',
  'changes',
  // EVERY ADDITION, FIRING AND HELD-BACK FIRING OF A COUNTER, added by migration 0172. Criteria CT2
  // and CT5 to CT7. Authored: the reason on an addition is somebody's own words, and what a firing's
  // action answered exists in no other row.
  'counter_rows',
  'links',
  'panel_layouts',
  'presentation_intent',
  'reader_anchors',
  'records',
  'session_resources',
  'folder_readings',
  'source_file_hashes',
  'source_files',
  // Plans, added by migration 0010. `plan_lines` before `plans` is the byte order SQLite sorts by;
  // `plan_line_revisions`, added by 0170, sorts between them because the underscore comes before `s`.
  // It holds why a line was added, reordered or dropped. Criterion P3.
  'plan_line_revisions',
  'plan_lines',
  'planning_capacity',
  // `planning_drafts` WAS HERE until migration 0196 moved every draft into a plan and dropped the table.
  'planning_intents',
  'planning_recurrences',
  'plans',
  'source_index',
  'workspaces',
  // Round seven, migration 0040. `work_windows` says WHEN somebody means to work on something and
  // carries no hours; the three agent tables hold a conversation with an agent, everything said in
  // it, and each attempt to answer it.
  'work_windows',
  'agent_threads',
  'agent_messages',
  'agent_runs',
  // Round eight, migration 0060. `revisions` holds WHAT EACH RECORD HELD, once per write. Authored,
  // and the strongest case of it in this list: a revision is the only stored copy of a record's
  // earlier content, because `changes` says what changed and never what it was.
  'revisions',
  // Round eight, migration 0070. `reviews` says WHO STARTED COLLECTING REMARKS, FROM WHERE, and
  // what was in the collection when they finished. Authored: where somebody started reviewing, and
  // what they had collected when they stopped, exists nowhere else.
  'reviews',
  // Round ten, one generated migration. THE CODE THIS PROJECT'S WORK IS IMPLEMENTED IN: the
  // repositories somebody registered, the code revisions somebody named, the relationships somebody
  // stated, and what a resolver worked out. The first three are authored; `implementation_findings`
  // is derived and is deleted by the next rebuild of its repository.
  'repositories',
  'implementation_revisions',
  'implementation_map',
  'implementation_findings',
  // What one scan saw about one file at one moment. AUTHORED, though the file index it is compared
  // against is derived: the index describes the present and any scan rebuilds it, and one of these
  // rows is a dated observation nothing can recompute.
  'file_observations',
  // Which work a restriction reached, and whether anybody re-checked it. Authored: the state, the
  // note and who decided are somebody's judgement.
  'revalidations',
  // The one-way marker for comments whose words went out before Mole Office stored a word for it.
  // Authored, and the strongest case of it: the fact it records is exactly the fact that was lost.
  'annotation_words_fixed',
  // WHETHER THE STORED READING-MEASURE WORDS CARRY THEIR NEW NAMES, added by 0173. Authored: the words
  // cannot say which names they were written under, so nothing can rebuild the row.
  'measure_words_renamed',
  // MEASURED — what Mole Office recorded about itself while it answered requests. Neither authored nor
  // derived, and both would be a lie the schema then acts on.
  'api_calls',
  'outside_reads',
  'usage_stretches',
  'usage_checks',
  // THE KEYS THE OFFICE HAS ISSUED AND WHO CALLED WITH A CLAIM AND NO KEY, added by 0165. Measured:
  // nothing rebuilds them, and a backup must not carry a key hash — by a decision of the owner's, a
  // copy, a backup and an export carry no key. Criterion P83, points 5 and 6.
  'held_keys',
  'run_tokens',
  'header_only_calls',
  // THE COUNTS THAT STAND WHERE THE LONG-POLL ROWS USED TO, added by migration 0167. Criterion U6,
  // set by an owner's decision. Measured like the two above it: nobody wrote a counted row, the
  // server counted requests it was already answering, and nothing can rebuild one.
  'hourly_calls',
  'gate_counts',
  // HOW FAR THE GATE-COUNT SPOOL IS READ, added by migration 0298. Measured with the counts it made: nobody wrote a row,
  // and a database without it reads the spool again from the start, into counts that also start again.
  'gate_count_spool_reads',
  // WHO TAKES PART, AND THE PICTURES THEY ARE DRAWN WITH, added by migration 0114. Authored: an
  // uploaded picture and the name somebody chose for an agent exist nowhere else. None of the four
  // carries a workspace column — the people and the durable agents of an installation are the same
  // in every project on this machine — except that `agent_records` is placed by the record it names.
  'assets',
  'people',
  'agents',
  'agent_records',
  // A PERMANENT RESIDENT'S LEAVE TO READ, VOID MARKS AND WRITES, added by the residents' migration. Authored: each
  // row is a resident's or the owner's own act, and nothing can recreate one.
  'resident_read_grants',
  'resident_void_marks',
  'resident_space_writes',
  // A PERMANENT RESIDENT'S SLEEPS AND POSTPONED SLEEPS, added by 0233. Authored: each row is the resident's or the
  // person's own act, and nothing can recreate one.
  'resident_sleeps',
  // WHICH INSTALLATION THIS DATABASE BELONGS TO, added by 0122. Authored: the one row says which
  // installation this database's citizens belong to, and nothing can rebuild it.
  'installation',
  'runtime_settings',
  'office_restart_grants',
  // EVERY WORLD THIS INSTALLATION HAS EVER HAD, added by 0123. Authored: a world appearing and a world
  // disappearing are moments, and nothing can recreate a moment.
  'worlds',
  // A CITIZEN OF ONE WORLD WORKING IN ANOTHER, added by 0124. Authored: somebody said what they came
  // to do, and nothing can recreate a sentence.
  'visits',
  // A VISITING AGENT'S OWN CREDENTIAL AND EVERY REQUEST MADE UNDER IT, added by migration 0140.
  // Authored: an agent asked for one, a person confirmed it, and requests were made — all moments,
  // and nothing can recreate a moment. They name no project: a credential is held against the
  // installation rather than against one project's work. Criteria P24 to P30.
  'visitor_credentials',
  'visitor_requests',
  // THE MACHINES THIS OFFICE TRUSTS, added by migration 0144. Authored: somebody pressed to trust a
  // machine, or confirmed a visiting agent from one, and nothing can recreate a press. It names no
  // project: which machines an office trusts belongs to the installation. Criterion P73.
  'trusted_machines',
  // HOW FAR EACH MESSAGE GOT WITH EACH RECIPIENT, added by migration 0115. Authored: how far a
  // message reached the person or agent it was sent to exists nowhere else, and it belongs to the
  // project its message is in.
  'message_delivery',
  // WHO READ A CONVERSATION THEY WERE NOT PART OF, added by migration 0119. Authored: a person's
  // read of two agents' conversation happens once and nothing can recreate it. It carries its own
  // `workspace_id`, because what it is about is a pair of participants rather than a record.
  'conversation_reads',
  // A GROUP AND WHO IS IN IT, added by migration 0120. Authored: somebody opened it, or a conflict
  // between two work claims did, and nothing can recreate either. `groups` carries its own
  // `workspace_id`; a membership is placed by the group it names.
  'groups',
  'group_members',
  // WHAT AN AGENT IS WORKING ON, added by migration 0121. Authored: an agent said it, and nothing
  // can recreate the moment it said so. It carries its own `workspace_id`.
  'work_claims',
  // WHICH ADDRESSEE'S DEAD LETTERS A SECRETARY HAS TAKEN ON, added by migration 0160. Authored: a
  // secretary claimed it, and nothing can recreate the moment it did. After `groups`, because every
  // row names the group its broadcast was announced in, and a restore that put the claims back
  // first would hold rows naming a group that is not there yet — the rule `workspaces`, `plans` and
  // `agent_threads` come first for.
  'dead_letter_claims',
  // WHICH LIVE SESSION IS ANSWERING AS A DURABLE AGENT, added by migration 0131. Authored: a session
  // said it was there, and nothing can recreate the moment it said so. It names no project: a
  // durable agent belongs to the installation, as its registry row does.
  'handle_holds',
  // HOW ONE PERSON HAS ARRANGED THEIR CONTACTS LIST, added by migration 0127 and given a side and a
  // fold state by 0161. Authored: the owner made a group, renamed one or set an order, and nothing can
  // recreate any of those. None names a project: the registries they arrange belong to the
  // installation.
  'contact_groups',
  'contact_placements',
  'contact_group_collapses',
  // A REQUEST FOR ONE PRESS, added by migration 0206. Authored: an agent asked the
  // person to agree to one known act, and the person's answer is the only record that the act ran on that press.
  'one_press_requests',
  // ONE USE OF A TOOL IS ONE ROW, added by migration 0231 (wave 13s round 33, problem mR8vNPOVNQ_p). Authored: an
  // agent said what its use of a tool did, and the row is the only place that line is kept.
  'tool_uses',
  'test_file_runs',
  // A HANDOVER DOCUMENT FOR AN AGENT, added by migration 0232. Authored: an
  // agent or the person wrote it, and nothing can recreate it.
  'handovers',
  // A READINESS CHECKLIST AND ITS SIGNATURES, added by migration 0252.
  // Authored: a signature is the only record that somebody an operation affected agreed to it.
  'readiness_checklists',
  'readiness_signatures',
  // A SIGNING PACKAGE AND ITS ITEMS, added by migration 0270 under two of the owner's
  // decisions. Authored: the person's signature and each item's receipt
  // are the only record of what the office did on that signature.
  'signing_packages',
  'signing_package_items',
  // EVERY ASK FOR A QUICK INPUT, added by migration 0272. Authored: an agent asked and the
  // office answered, and the row is the only record of either.
  'quick_input_asks',
  // A PRESS A SECRETARY MADE FOR THE PERSON, added by migration 0280 (the flow design's step 3). Authored: which door
  // the secretary pressed under the grant, and why, is kept nowhere else.
  'presses_for_the_person',
].sort()

/**
 * THE TABLES THE SCHEMA PARTS DECLARE, read from schema.ts and not typed into the list above. A line
 * adds a table in a file of its own under src/server/db/schema-parts/ (wave 13s round 89), and
 * tests/a-schema-part-says-what-happens-to-its-tables.test.ts checks what each one says. Here each
 * is still a table schema.ts exports and a migration creates.
 */
const PART_TABLE_NAMES = everyPartTable().map((table) => table.name)
const STORAGE_TABLE_NAMES = [schema.storageFiles, schema.storageTotals, schema.storageMeasurement].map(getTableName)

/** drizzle's own bookkeeping. Not one of the twenty-four, and not part of a backup. */
const JOURNAL = '__drizzle_migrations'

/**
 * ---------------------------------------------------------------------------------------
 * THE EXCEPTION THAT USED TO BE HERE, AND WHAT CLOSED IT
 * ---------------------------------------------------------------------------------------
 *
 * `agent_threads`, `agent_messages` and `agent_runs` were declared by migration 0040 and left in
 * NEITHER `AUTHORED_TABLES` nor `DERIVED_TABLES`, as a stated exception with a list of its own in
 * this file. The reason was real: `WORKSPACE_COLUMN` could only say "this column" or "no project",
 * and a message and a run carry no `workspace_id` — they belong to the project their thread names.
 * Classifying them under that rule would have put them in `PERSON_LEVEL_TABLES`, and a
 * project-scoped archive would then have printed, over that project's own conversations, the
 * sentence that set exists to print: that a plan belongs to no project, so there is no project
 * whose archive these would be. A FALSE SENTENCE INSIDE AN ARCHIVE.
 *
 * The exception carried two guards so it could not become a place to hide a table. A migrated
 * database had to hold no row in any of the three, and NOTHING UNDER `src/` could name one — so the
 * first line of code that used them turned this file red and somebody had to decide. That is
 * exactly what happened: `src/server/lib/agents.ts` landed on 18 August 2026 and this file went red
 * naming it.
 *
 * WHAT WAS DECIDED. All three are AUTHORED, and `WORKSPACE_COLUMN` grew a third form: scoped
 * through another table's row. `agent_threads` is scoped by its own `workspace_id`; `agent_messages`
 * and `agent_runs` are scoped through `agent_threads`, reached by `thread_id`. `PERSON_LEVEL_TABLES`
 * is still every authored table whose scope is null, and the third form is not null, so the two
 * stay out of it.
 *
 * BOTH GUARDS ARE GONE, AND ONE PART OF THE SECOND ONE STAYS. The list is empty, so a rule over it
 * would be a rule over nothing — and a test that cannot fail is worse than no test. What is kept is
 * `sourceFiles()` below and the test that proves it really reads this repository, because the rule
 * that nothing under `src/` may CREATE a table is built on the same walk and would pass by reading
 * nothing.
 *
 * WHAT REPLACED THEM. The three tables are now in the hand-written list above and in
 * `AUTHORED_TABLES`, so leaving one out fails here. `describe('a table belongs to a project…')`
 * below checks all three forms of the scoping against a real database, including that a
 * through-scoped table has no `workspace_id` of its own. `tests/agent-archive.test.ts` proves the
 * two claims that follow from the decision: a project-scoped archive carries exactly that project's
 * conversations, and a whole-installation archive carries all of them.
 */

// ---------------------------------------------------------------------------- scratch databases

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/**
 * A database built by running the real migration command, in a subprocess, against a new file.
 *
 * The command rather than the migrator, because the command is what a person runs and what
 * src/server/index.ts runs at startup. Nothing here ever opens ./data/panelx.db: MOLE_OFFICE_DB names a
 * temporary file, which is the only thing db/client.ts reads.
 */
function migratedDatabase(): Database.Database {
  const dir = aTestDatabaseFolder('schema-tables')
  dirs.push(dir)
  const file = join(dir, 'panelx.db')
  execFileSync('npx', ['tsx', 'src/server/db/migrate.ts'], {
    cwd: REPO,
    env: { ...process.env, MOLE_OFFICE_DB: file },
    encoding: 'utf8',
  })
  return new Database(file, { readonly: true })
}

function tableNames(db: Database.Database): string[] {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string }[]
  ).map((r) => r.name)
}

/**
 * Every `sqliteTable` schema.ts exports, by the name SQLite knows it as.
 *
 * Widened to `unknown[]` first because that module also exports the two string arrays and a pile
 * of types, and `is()` narrowing a union that includes them is not something TypeScript will
 * accept as a predicate. The narrowing that matters is `is(value, SQLiteTable)`, which is
 * drizzle's own runtime check, and it happens either way.
 */
function declaredTables(): string[] {
  const names: string[] = []
  for (const value of Object.values(schema) as unknown[]) {
    if (is(value, SQLiteTable)) names.push(getTableName(value))
  }
  return names.sort()
}

// ============================================================================ the inventory

describe('all tables', () => {
  it('are all declared in schema.ts', () => {
    expect(declaredTables()).toEqual([...EVERY_TABLE, ...PART_TABLE_NAMES].sort())
  })

  it('are all created by a migration, and no migration creates anything else but the index of the records\' text', () => {
    // This is the claim migration 0003 exists to make true. Before it, this database came back
    // with five names and the other five arrived only because importing api/layout.ts,
    // lib/resources.ts or lib/sourceindex.ts created them as a side effect.
    //
    // The six tables of the index of the records' text (wave 13y round 64) are the one exception. They are an SQLite
    // full-text table and the five tables SQLite keeps it in, which drizzle cannot declare, so table-name-lists.ts names them in
    // RECORD_TEXT_INDEX_TABLES and they are in none of the three lists above.
    const db = migratedDatabase()
    try {
      expect(tableNames(db)).toEqual([JOURNAL, ...EVERY_TABLE, ...RECORD_TEXT_INDEX_TABLES, ...PART_TABLE_NAMES].sort())
    } finally {
      db.close()
    }
  }, 60_000)

  it('are each classified as authored, derived or measured, in exactly one of the three lists', () => {
    // NO EXCEPTIONS. This used to allow a table in neither list — the three agent tables, with two
    // guards that made the exception close itself. It closed on 18 August 2026; the comment above
    // the scratch databases says how.
    //
    // THE THIRD LIST IS NOT A THIRD EXCEPTION. `MEASURED_TABLES` is an answer, not an absence: these
    // tables are what Mole Office recorded about itself, so nobody wrote them and nothing can rebuild
    // them, and both existing words would have been false in a way the schema then acts on. What
    // matters here is that the three lists PARTITION the database: every table in exactly one.
    const authored = [...AUTHORED_TABLES]
    const derived = [...DERIVED_TABLES]
    const measured = [...MEASURED_TABLES]
    expect([...authored, ...derived, ...measured].sort()).toEqual([...EVERY_TABLE, ...STORAGE_TABLE_NAMES].sort())
    expect([...authored, ...derived, ...measured].length, 'a table is in two of the three lists').toBe(
      new Set([...authored, ...derived, ...measured]).size,
    )
  })

  it('names the measured tables, which no archive carries and no scan rebuilds', () => {
    expect([...MEASURED_TABLES]).toEqual([
      'api_calls',
      'outside_reads',
      'usage_stretches',
      'usage_checks',
      'held_keys',
      'run_tokens',
      'header_only_calls',
      'hourly_calls',
      'gate_counts',
      'gate_count_spool_reads',
    ])
  })

  it('names the authored tables that must round-trip through a backup', () => {
    // Written out, because this list is what a durable format is built from and getting it wrong
    // in the safe-looking direction — leaving one out — produces a backup that restores quietly
    // and is missing something nobody can recreate.
    expect([...AUTHORED_TABLES]).toEqual([
      // The shared scene has no foreign key and is exported before the project rows.
      'office_scene_settings',
      'office_map_layouts',
      // The model each run uses, criterion U2. A singleton settings row like the two above it.
      'run_models',
      // The Casting table and its history, migration 0189. They belong to no project, so they are
      // exported with the settings rows and before the project rows.
      'casting',
      'casting_changes',
      // Several castings for each role and their history, migration 0190, beside the two they were copied from.
      'casting_rows',
      'casting_row_changes',
      // The Casting labels and their history, migration 0349. One list for the whole installation, exported
      // beside the castings that carry them.
      'casting_labels',
      'casting_label_changes',
      // The directories somebody added by hand as preview roots, criterion U4. A singleton settings
      // row like the two above it, exported with them and before the project rows.
      'preview_root_additions',
      // The price table the person sets in Settings, criterion U3. A singleton row like the three
      // above it, exported with them and before the project rows.
      'price_table',
      // The owner's list of quick inputs, migration 0272. A singleton row like the price table, exported with it.
      'quick_input_list',
      // What the person's grant carries in this office, migration 0287. One row per door the person changed, exported
      // beside the quick input list and before the project rows.
      'what_the_grant_carries',
      // FIRST, because every table below names a row of it. The order is what a restore follows.
      'workspaces',
      'records',
      'links',
      'changes',
      // The revision ledger, added by migration 0060. AFTER `records`, because every revision is of
      // one — a restore that put the revisions back first would hold the history of a record that is
      // not there yet, the same rule `workspaces` and `plans` come first for.
      'revisions',
      'submission_baselines', 'legacy_unsealed_runs',
      'reader_anchors',
      'presentation_intent',
      'panel_layouts',
      'session_resources',
  'folder_readings',
      'allocations',
      'planning_capacity',
      'planning_recurrences',
      // Plans, added by migration 0010. `plans` before `plan_lines`, because every line names a
      // plan and a restore that put the lines back first would hold lines belonging to nothing.
      'plans',
      'plan_lines',
      // WHY A LINE WAS ADDED, REORDERED OR DROPPED, added by migration 0170. Criterion P3. AFTER
      // `plan_lines`, because every row names one — and it is authored, because the reason is
      // somebody's own words and nothing can recreate it.
      'plan_line_revisions',
      // EVERY ADDITION, FIRING AND HELD-BACK FIRING OF A COUNTER, added by migration 0172. Criteria
      // CT2 and CT5 to CT7. AFTER `records`, because every row names a counter and a counter is a
      // record. Authored: the caller's reason and what the action answered exist in no other row.
      'counter_rows',
      // What somebody wrote about time, added by migration 0020. LAST, because one of these rows may
      // name a record and may name a plan line, so both have to be back before it. It was left out
      // of this list when the table was built, and the result was a backup that carried no intent
      // at all while the restore still reported success.
      'planning_intents',
      // Round seven, migration 0040. After `records`, because every window names one.
      'work_windows',
      // Talking to an agent, from the same migration and classified on 18 August 2026, the day the
      // first code wrote to them. `agent_threads` FIRST, because a message and a run each name a
      // thread and a restore that put those back first would hold comments belonging to a
      // conversation that is not there yet — the same rule `workspaces` and `plans` come first for.
      'agent_threads',
      'agent_messages',
      'agent_runs',
      // A review, migration 0070. AFTER the three above, because a review brought forward from
      // round seven names the conversation its remarks are still in, and a restore that put it back
      // first would name a conversation that is not there yet.
      'reviews',
      // Round ten. THE ORDER HERE IS TWO LEVELS DEEP AND THAT IS WHY IT IS WRITTEN OUT.
      // `repositories` first, because a revision and a map row each name one.
      // `implementation_revisions` second, because `implementation_map.revision_id` names one — a
      // restore that put the map back first would hold rows pointing at a revision that is not there
      // yet. All three after `records`, because a map row names a record.
      'repositories',
      'implementation_revisions',
      'implementation_map',
      // What one scan saw about one file. It names no record; it is after `records` only because
      // everything is.
      'file_observations',
      // After `records` and `links`: every row names a restriction record, an affected record, and
      // the path of links it was reached by.
      'revalidations',
      // After `records`, because every row names one — and it says which project it is in through
      // that record rather than in a column of its own.
      'annotation_words_fixed',
      // After `records`, because the one row is a fact about what the records hold.
      'measure_words_renamed',
      // WHO TAKES PART. `assets` first, because a person row and an agent row each name one of its
      // rows and a restore that put the people back first would name a picture that is not there yet.
      // `agents` before `agent_records`, for the same reason one level down.
      'assets',
      'people',
      'agents',
      'agent_records',
      // A RESIDENT'S LEAVE, VOID MARKS AND WRITES, after `agents` because every row names a resident.
      'resident_read_grants',
      'resident_void_marks',
      'resident_space_writes',
      // A RESIDENT'S SLEEPS, after `agents` because every row names one.
      'resident_sleeps',
      // WHICH INSTALLATION THIS DATABASE BELONGS TO, added by 0122. One row, written once from the
      // declaration and never rewritten, so nothing can rebuild it: working the id out again would
      // answer about today's declaration rather than about the day this database was first migrated.
      'installation',
      'runtime_settings',
      'office_restart_grants',
      // EVERY WORLD THIS INSTALLATION HAS EVER HAD, added by 0123. Authored: a world appearing and a
      // world disappearing are moments, and nothing can recreate a moment. It names no project, because
      // a world holds every project it has.
      'worlds',
      // A CITIZEN OF ONE WORLD WORKING IN ANOTHER, added by 0124. Authored: somebody said what they
      // came to do, and nothing can recreate a sentence.
      'visits',
      // A VISITING AGENT'S OWN CREDENTIAL AND EVERY REQUEST MADE UNDER IT, added by 0140.
      // `visitor_credentials` before `visitor_requests`, because every request names a credential
      // and a restore that put the requests back first would hold rows belonging to a credential
      // that is not there yet.
      'visitor_credentials',
      'visitor_requests',
      // THE MACHINES THIS OFFICE TRUSTS, added by 0144. After `visitor_credentials`, because a row
      // added by a confirmation names the credential that added it.
      'trusted_machines',
      'message_delivery',
      // After `workspaces`, which everything is after, and after `agents`: a read names a pair of
      // agents, so a restore that put the reads back first would name agents that are not there yet.
      'conversation_reads',
      // A GROUP AND WHO IS IN IT, added by migration 0120. `groups` before `group_members`, because
      // every membership names a group and a restore that put the memberships back first would hold
      // rows belonging to a group that is not there yet.
      'groups',
      'group_members',
// WHAT AN AGENT IS WORKING ON, added by migration 0121. After `records`, because every claim
  // names the session record of the run whose life its lease follows.
  'work_claims',
  // WHICH ADDRESSEE'S DEAD LETTERS A SECRETARY HAS TAKEN ON, added by migration 0160. After
  // `groups`, because every row names the group its broadcast was announced in.
  'dead_letter_claims',
  // WHICH LIVE SESSION IS ANSWERING AS A DURABLE AGENT, added by migration 0131. After `agents`
  // and after `records`, because a hold names a registry row and a session record.
  'handle_holds',
      // HOW ONE PERSON HAS ARRANGED THEIR CONTACTS LIST, added by migration 0127 and given a side
      // and a fold state by 0161. `contact_groups` before `contact_placements`, because a placement
      // may name a group somebody made. The fold table names no row of either, so it comes last.
      'contact_groups',
      'contact_placements',
      'contact_group_collapses',
      // A REQUEST FOR ONE PRESS, added by migration 0206. It names a project and no other row, so it comes last.
      'one_press_requests',
      // ONE USE OF A TOOL IS ONE ROW, added by migration 0231. It names a project, and a run by id only, so it comes last.
      'tool_uses',
      'test_file_runs',
      // A HANDOVER DOCUMENT FOR AN AGENT, added by migration 0232. It names a project and no other row, so it comes last.
      'handovers',
      // A READINESS CHECKLIST AND ITS SIGNATURES, added by migration 0252. After `workspaces`, which every checklist
      // names, and `readiness_checklists` before `readiness_signatures`, because every signature names its checklist.
      'readiness_checklists',
      'readiness_signatures',
      // A SIGNING PACKAGE AND ITS ITEMS, added by migration 0270. After `workspaces`, which every package names, and
      // `signing_packages` before `signing_package_items`, because every item names its package.
      'signing_packages',
      'signing_package_items',
      // EVERY ASK FOR A QUICK INPUT, added by migration 0272. After `agents` and `records`, because every row names an
      // agent and a run, so it comes last.
      'quick_input_asks',
      // A PRESS FOR THE PERSON, added by migration 0280. The change rows it wrote name it by `press_id`, which is not a
      // foreign key, so it comes last.
      'presses_for_the_person',
    ])
  })

  it('names the repository and storage tables that must be rebuilt rather than restored', () => {
    // These are the output of a scan of this machine's files. Restoring them elsewhere would serve a
    // file list for a repository that is not there. `implementation_findings` joins them for the
    // same reason: every row is deleted and written again by the next rebuild of its repository.
    expect([...DERIVED_TABLES]).toEqual([
      'source_files',
      'source_index',
      'source_file_hashes',
      'implementation_findings',
      ...STORAGE_TABLE_NAMES,
    ])
  })

  it('does not count the migration journal as one of them', () => {
    expect(EVERY_TABLE).not.toContain(JOURNAL)
    expect([...AUTHORED_TABLES, ...DERIVED_TABLES, ...MEASURED_TABLES]).not.toContain(JOURNAL)
  })
})

// ============================================================================ the indexes

/**
 * AN INDEX THIS DATABASE HAS THAT `schema.ts` DOES NOT DECLARE, AND WHY THAT IS ON PURPOSE.
 *
 * Every other index in the product is declared in schema.ts and created by the generated migration.
 * These are the ones created by raw SQL inside a data migration instead, because WHEN they are
 * created is part of what they are for.
 *
 * `reviews_one_global_collecting` is the whole list. It is
 * `CREATE UNIQUE INDEX reviews_one_global_collecting ON reviews (workspace_id) WHERE reach =
 * 'global' AND state = 'collecting'`, and it must be created AFTER the step that sets `reach`.
 * Created before it, it would be satisfied by a corpus where nothing is `global` yet — so a corpus
 * that already holds two project-wide reviews collecting at once, which is the state it exists to
 * make impossible, would pass it in silence and never fail again. drizzle-kit emits a partial unique
 * index into the generated file (`session_resources_live_idx` is declared in exactly that form), so
 * declaring it in schema.ts would land it in the create-the-tables migration, several waves before
 * the backfill it is meant to follow.
 *
 * WHAT THIS ARRAY BUYS. Without it the omission is indistinguishable from drift: somebody reading
 * schema.ts would find no such index and assume nobody had built it, and the next unrelated
 * `npm run db:generate` would re-emit it into a migration where it is useless. Named here, the
 * absence is a decision with a reason attached, and the test below fails if the name ever appears in
 * schema.ts.
 */
const INDEXES_A_DATA_MIGRATION_CREATES: { name: string; why: string }[] = [
  {
    name: 'reviews_one_global_collecting',
    why:
      'A partial unique index that makes two project-wide reviews collecting at once impossible. It is created ' +
      'by raw SQL in the step that backfills `reviews.reach`, AFTER that backfill, because created before it ' +
      'would be satisfied by a corpus where nothing is `global` yet and could never fire.',
  },
]

describe('the indexes schema.ts declares are the indexes the database has', () => {
  /** Every index name schema.ts declares, read off the drizzle table objects rather than typed. */
  function declaredIndexes(): string[] {
    const names: string[] = []
    for (const value of Object.values(schema) as unknown[]) {
      if (!is(value, SQLiteTable)) continue
      for (const index of getTableConfig(value).indexes) {
        const name = index.config.name
        if (name !== undefined) names.push(name)
      }
    }
    return names.sort()
  }

  /**
   * Every index a migrated database really has, by name.
   *
   * `sql IS NOT NULL` is what separates an index somebody created from one SQLite made for a PRIMARY
   * KEY or a UNIQUE constraint. Those carry no CREATE statement and are not anybody's declaration.
   */
  function indexesInDatabase(db: Database.Database): string[] {
    return (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name")
        .all() as { name: string }[]
    )
      .map((r) => r.name)
      .sort()
  }

  it('agrees with a freshly migrated database, with the data-migration index named as the exception', () => {
    const db = migratedDatabase()
    try {
      const exceptions = new Set(INDEXES_A_DATA_MIGRATION_CREATES.map((i) => i.name))
      const declared = declaredIndexes()
      const inDatabase = indexesInDatabase(db).filter((name) => !exceptions.has(name))
      expect(inDatabase).toEqual(declared)
      // Not vacuous: there really are indexes on both sides.
      expect(declared.length).toBeGreaterThan(10)
    } finally {
      db.close()
    }
  }, 60_000)

  it('does not declare the index a data migration creates, which is what the exception is for', () => {
    // THE DIRECTION THAT MATTERS MOST. If a later `npm run db:generate` re-emits this index into a
    // schema migration, it would be created at the wrong moment — before the backfill — and the
    // failure it exists to produce could never happen again. This is what makes that loud.
    const declared = new Set(declaredIndexes())
    for (const index of INDEXES_A_DATA_MIGRATION_CREATES) {
      expect(
        declared.has(index.name),
        `${index.name} is declared in schema.ts, so a generated migration will create it. ${index.why}`,
      ).toBe(false)
      expect(index.why.length, `${index.name} is excused with no reason given`).toBeGreaterThan(80)
    }
    // Stated as a number so that a second index outside the schema is a deliberate edit to this line
    // rather than a name quietly joining a list.
    expect(
      INDEXES_A_DATA_MIGRATION_CREATES.length,
      'a second index outside schema.ts was added; read the note above the list first',
    ).toBe(1)
  })
})

// ============================================================ which tables belong to a project

/**
 * `WORKSPACE_COLUMN` AND `PERSON_LEVEL_TABLES`, CHECKED AGAINST A REAL DATABASE.
 *
 * Both are computed from the drizzle declarations, so a test comparing them with those declarations
 * would only be asking the same question twice. These ask SQLite instead: the column each one names
 * has to be a column the migrated database really has, and a table it says has none really has none.
 *
 * The pair was a hand-written map in src/server/lib/export.ts whose comment said two tables belonged
 * to no project. Migrations 0008 and 0009 made it four. Nothing failed, because nothing compared the
 * map with anything, and a project-scoped archive went on reporting two of the four.
 *
 * THERE ARE THREE ANSWERS SINCE 18 AUGUST 2026, not two: a column of this table's own, a column of
 * ANOTHER table's row that this one names, or nothing at all. These tests handle all three, and
 * that is not a formality — a reader that treated the third as the second would look for a column
 * that is not there, and one that treated it as the first would call a project's own conversations
 * person-level.
 */
describe('a table belongs to a project when something says which one', () => {
  /** The column names SQLite reports for a table in the migrated database. */
  function columnsOf(db: Database.Database, table: string): string[] {
    return (db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all() as { name: string }[]).map(
      (r) => r.name,
    )
  }

  it('names columns that are really there, on every authored table, in all three forms', () => {
    const db = migratedDatabase()
    try {
      for (const table of AUTHORED_TABLES) {
        const scope = WORKSPACE_COLUMN[table]
        const columns = columnsOf(db, table)
        if (scope === null) {
          expect(columns, `${table} has a workspace_id and is declared as belonging to no project`).not.toContain(
            'workspace_id',
          )
        } else if (typeof scope === 'string') {
          expect(columns, `${table} is scoped by "${scope}" and has no such column`).toContain(scope)
        } else {
          // THE THIRD FORM, AND ALL FOUR OF ITS CLAIMS ARE CHECKED. Both columns have to exist —
          // this one to hold the other row's id, and that one to be what it names — the table it
          // names has to be a table a backup carries, and it has to be scoped by a column of its
          // own, because this export follows one step and refuses to guess at a second.
          expect(columns, `${table} names a ${scope.table} row through "${scope.column}" and has no such column`)
            .toContain(scope.column)
          expect(
            columnsOf(db, scope.table),
            `${table} is scoped through ${scope.table}.${scope.matches} and there is no such column`,
          ).toContain(scope.matches)
          expect([...AUTHORED_TABLES], `${table} is scoped through ${scope.table}, which is in no backup`).toContain(
            scope.table,
          )
          expect(
            typeof WORKSPACE_COLUMN[scope.table],
            `${table} is scoped through ${scope.table}, which does not say its own project in a column`,
          ).toBe('string')
          // AND IT MUST NOT ALSO HAVE ONE OF ITS OWN. A row carrying both would be the same fact in
          // two places, which is this codebase's recurring defect — and the two could disagree with
          // a scoped archive reading one of them and every screen reading the other.
          expect(
            columns,
            `${table} is scoped through ${scope.table} AND carries a workspace_id, so the same fact is stored twice`,
          ).not.toContain('workspace_id')
        }
      }
    } finally {
      db.close()
    }
  }, 60_000)

  it('every form is really used, so the three branches above are not two branches and a comment', () => {
    const scopes = AUTHORED_TABLES.map((table) => WORKSPACE_COLUMN[table])
    expect(scopes.filter((s) => typeof s === 'string').length, 'no table is scoped by a column of its own').toBeGreaterThan(0)
    expect(scopes.filter((s) => s === null).length, 'no table belongs to no project').toBeGreaterThan(0)
    expect(
      scopes.filter((s) => s !== null && typeof s !== 'string').length,
      'no table is scoped through another table, so the third form is dead code',
    ).toBeGreaterThan(0)
  })

  it('the person-level set is exactly the authored tables nothing can place in a project', () => {
    const db = migratedDatabase()
    try {
      // HALF OF THIS IS ASKED OF SQLITE AND HALF CANNOT BE. "This table has no workspace_id" is a
      // fact the database holds. "…and no other row says which project it is in either" is a
      // judgement, and db/schema.ts is where it is stated — so `scope !== null` is read from there
      // and there is nowhere else it could come from. What this test still does is stop the two
      // drifting: a table given a workspace_id in a migration and left in the person-level set, or
      // taken out of it while still having nothing to place it, fails here.
      const nothingCanPlace = AUTHORED_TABLES.filter(
        (table) =>
          table !== 'workspaces' &&
          !columnsOf(db, table).includes('workspace_id') &&
          WORKSPACE_COLUMN[table] === null,
      )
      expect([...PERSON_LEVEL_TABLES]).toEqual(nothingCanPlace)
      // Not vacuous, and not the whole database either: some tables have one and some do not.
      expect(nothingCanPlace.length).toBeGreaterThan(0)
      expect(nothingCanPlace.length).toBeLessThan(AUTHORED_TABLES.length)
      // AND THE THROUGH-SCOPED TABLES ARE OUT OF IT, WHICH IS THE WHOLE REASON THE THIRD FORM
      // EXISTS. They have no workspace_id either, so the old rule — "no workspace_id means no
      // project" — would have put them here, and a project archive would have said a project's own
      // conversations belong to nobody.
      const throughAnother = AUTHORED_TABLES.filter((table) => {
        const scope = WORKSPACE_COLUMN[table]
        return scope !== null && typeof scope !== 'string'
      })
      expect(throughAnother.length, 'no table is scoped through another one, so this proves nothing').toBeGreaterThan(0)
      for (const table of throughAnother) {
        expect(columnsOf(db, table), `${table} has a workspace_id, so it is not the case this is about`).not.toContain(
          'workspace_id',
        )
        expect(
          [...PERSON_LEVEL_TABLES],
          `${table} belongs to the project its ${String((WORKSPACE_COLUMN[table] as { table: string }).table)} ` +
            'names, and is being reported as belonging to no project',
        ).not.toContain(table)
      }
    } finally {
      db.close()
    }
  }, 60_000)
})

// ============================================================================ one writer only

describe('nothing outside drizzle/ creates a table', () => {
  /** Every .ts and .tsx file under src/, as text with its comments removed. */
  function sourceFiles(): { path: string; code: string }[] {
    const out: { path: string; code: string }[] = []
    for (const entry of readdirSync(SRC, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue
      if (!/\.tsx?$/.test(entry.name)) continue
      const path = join(entry.parentPath, entry.name)
      // Comments are stripped, or this rule would report every file that explains it — including
      // schema.ts, whose header is about exactly this. Same stripping tests/changes.test.ts uses.
      const code = readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '')
      out.push({ path: path.slice(REPO.length), code })
    }
    return out
  }

  /**
   * The parts of a file where SQL is actually RUN, rather than talked about.
   *
   * Two places, and between them they cover every way this codebase has ever executed a
   * statement: a template literal, which is how all three deleted `ensure*` functions wrote their
   * DDL, and the first argument of `.exec()`, `.prepare()` or `.run()`.
   *
   * The distinction earns its lines. `src/server/db/migrate.ts` REFUSES a database with no
   * migration journal, and the sentence it prints says why: "0000 — whose CREATE TABLE statements
   * are bare". That is English inside a quoted string, it is the most useful sentence in the file,
   * and a rule that read the whole file would demand it be deleted.
   *
   * What this cannot see is DDL assembled by concatenating variables. Nothing here does that, and
   * a rule that tried to would have to be an interpreter.
   */
  function executedSql(code: string): string {
    const regions: string[] = []
    for (const m of code.matchAll(/`[^`]*`/g)) regions.push(m[0])
    for (const m of code.matchAll(/\.(?:exec|prepare|run)\(\s*(['"])([\s\S]*?)\1/g)) regions.push(m[2] ?? '')
    return regions.join('\n')
  }

  const makesATable = (code: string): boolean => /CREATE\s+(TABLE|INDEX)/i.test(executedSql(code))


  it('lets off only listed files that still make a table and reach no office database', () => {
    // This file reads src/ only, so it checks the listed files in src/;
    // tests/schema-inventory.test.ts checks every listed file.
    const files = new Map(sourceFiles().map((f) => [f.path, f.code]))
    const said = TABLES_IN_A_FILE_OF_THEIR_OWN.flatMap(({ path }) => {
      const code = files.get(path)
      if (code === undefined) return []
      return [
        ...(makesATable(code) ? [] : [`${path} makes no table, so take it off the list`]),
        ...whatTiesItToTheOfficeDatabase(path, code),
      ]
    })
    expect(said).toEqual([])
  })

  it('would have caught the three functions this change deleted', () => {
    // Without this, the rule above could be passing because `executedSql` returns nothing useful.
    // These are the real statements out of api/layout.ts and lib/sourceindex.ts as they stood
    // before migration 0003, in the two forms the codebase writes SQL in.
    expect(executedSql('sqlite.exec(`\n  CREATE TABLE IF NOT EXISTS panel_layouts (id TEXT)\n`)')).toMatch(
      /CREATE\s+TABLE/i,
    )
    expect(executedSql("sqlite.exec('CREATE UNIQUE INDEX session_resources_live_idx ON session_resources (key)')")).toMatch(
      /CREATE\s+INDEX|CREATE\s+UNIQUE\s+INDEX/i,
    )
    // And it ignores the sentence migrate.ts prints when it refuses a database with no journal.
    expect(executedSql("throw new Error('0000 — whose CREATE TABLE statements are bare, so it would stop')")).toBe('')
  })

  it('found the files it was supposed to be reading', () => {
    // Without this, a broken walk would report an empty list and the rule above would pass by
    // reading nothing at all.
    const files = sourceFiles()
    expect(files.length).toBeGreaterThan(50)
    expect(files.map((f) => f.path)).toContain('src/server/db/schema.ts')
    // Two of the three files that used to carry an `ensure*` function. The third was
    // src/server/api/layout.ts, which was deleted with the panel grid on 2026-08-10, so naming it
    // here would fail for the wrong reason -- an absent file, not a broken walk.
    expect(files.map((f) => f.path)).toContain('src/server/lib/resources.ts')
    expect(files.map((f) => f.path)).toContain('src/server/lib/sourceindex.ts')
  })
})

// ============================================================================ every table migrated

describe('every declared table appears in a migration file', () => {
  it('is created by name in drizzle/, so nothing relies on being created at import', () => {
    const sql = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'))
      .join('\n')
      // Comments first: 0003's header names all five tables in prose, and a rule satisfied by a
      // comment is not a rule.
      .replace(/^\s*--[^\n]*$/gm, '')
    for (const table of [...EVERY_TABLE, ...PART_TABLE_NAMES]) {
      expect(sql, `no migration creates ${table}`).toMatch(
        new RegExp(`CREATE\\s+TABLE\\s+(IF\\s+NOT\\s+EXISTS\\s+)?\`?${table}\`?`, 'i'),
      )
    }
  })
})
