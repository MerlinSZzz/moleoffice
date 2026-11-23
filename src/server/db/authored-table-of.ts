// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { getTableColumns } from 'drizzle-orm'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import {
  officeSceneSettings, officeMapLayouts, runModels, casting, castingChanges, castingRows, castingRowChanges,
  castingLabels, castingLabelChanges, previewRootAdditions, priceTable, quickInputList, whatTheGrantCarries,
  submissionBaselines, legacyUnsealedRuns, workspaces, records, links, changes, revisions, readerAnchors,
  presentationIntent, panelLayouts, sessionResources, folderReadings, allocations, planningCapacity,
  planningRecurrences, plans, planLines, planLineRevisions, counterRows, planningIntents, workWindows, agentThreads,
  agentMessages, agentRuns, reviews, repositories, implementationRevisions, implementationMap, fileObservations,
  revalidations, annotationWordsFixed, measureWordsRenamed, assets, people, agents, agentRecords, residentReadGrants,
  residentVoidMarks, residentSpaceWrites, residentSleeps, installation, runtimeSettings, officeRestartGrants, worlds,
  visits, visitorCredentials, visitorRequests, trustedMachines, messageDelivery, conversationReads, groups,
  groupMembers, workClaims, deadLetterClaims, handleHolds, contactGroups, contactPlacements, contactGroupCollapses,
  onePressRequests, toolUses, testFileRuns, handovers, readinessChecklists, readinessSignatures, signingPackages,
  signingPackageItems, quickInputAsks, pressesForThePerson,
} from './schema.ts'
import { AUTHORED_TABLES, type AuthoredTable } from './table-name-lists.ts'

/**
 * WHICH DECLARATION EACH AUTHORED TABLE IS, AND HOW A ROW OF EACH IS SCOPED TO A PROJECT.
 *
 * THIS FILE IMPORTS schema.ts, AND NOTHING schema.ts LOADS MAY IMPORT THIS FILE. The maps below are made while this
 * file loads, and they read tables schema.ts makes in its own body: `records`, `links`, `implementation_map` and
 * `message_delivery`. A file that schema.ts loads runs before that body. If such a file imported this one, the maps
 * would read those tables before they exist, and the load would stop with a ReferenceError. every-part-table.ts reads
 * `AUTHORED_TABLE_OF`, so schema.ts re-exports neither file. Import these names from here, and `everyPartTable` from
 * every-part-table.ts.
 */

/**
 * The drizzle declaration behind each authored table name.
 *
 * THE ONE PLACE A NAME IS TIED TO ITS COLUMNS, so that anything wanting to know what a table holds
 * asks the declaration rather than restating it. `satisfies Record<AuthoredTable, SQLiteTable>` is
 * what makes a table added to `AUTHORED_TABLES` and forgotten here a COMPILE error rather than a
 * gap somebody finds in a backup.
 */
export const AUTHORED_TABLE_OF = {
  office_scene_settings: officeSceneSettings,
  office_map_layouts: officeMapLayouts,
  run_models: runModels,
  casting,
  casting_changes: castingChanges,
  casting_rows: castingRows,
  casting_row_changes: castingRowChanges,
  casting_labels: castingLabels,
  casting_label_changes: castingLabelChanges,
  preview_root_additions: previewRootAdditions,
  price_table: priceTable,
  quick_input_list: quickInputList,
  what_the_grant_carries: whatTheGrantCarries,
  submission_baselines: submissionBaselines, legacy_unsealed_runs: legacyUnsealedRuns,
  workspaces,
  records,
  links,
  changes,
  revisions,
  reader_anchors: readerAnchors,
  presentation_intent: presentationIntent,
  panel_layouts: panelLayouts,
  session_resources: sessionResources,
  folder_readings: folderReadings,
  allocations,
  planning_capacity: planningCapacity,
  planning_recurrences: planningRecurrences,
  plans,
  plan_lines: planLines,
  plan_line_revisions: planLineRevisions,
  counter_rows: counterRows,
  planning_intents: planningIntents,
  work_windows: workWindows,
  agent_threads: agentThreads,
  agent_messages: agentMessages,
  agent_runs: agentRuns,
  reviews,
  repositories,
  implementation_revisions: implementationRevisions,
  implementation_map: implementationMap,
  file_observations: fileObservations,
  revalidations,
  annotation_words_fixed: annotationWordsFixed,
  measure_words_renamed: measureWordsRenamed,
  assets,
  people,
  agents,
  agent_records: agentRecords,
  resident_read_grants: residentReadGrants,
  resident_void_marks: residentVoidMarks,
  resident_space_writes: residentSpaceWrites,
  resident_sleeps: residentSleeps,
  installation,
  runtime_settings: runtimeSettings,
  office_restart_grants: officeRestartGrants,
  worlds,
  visits,
  visitor_credentials: visitorCredentials,
  visitor_requests: visitorRequests,
  trusted_machines: trustedMachines,
  message_delivery: messageDelivery,
  conversation_reads: conversationReads,
  groups,
  group_members: groupMembers,
  work_claims: workClaims,
  dead_letter_claims: deadLetterClaims,
  handle_holds: handleHolds,
  contact_groups: contactGroups,
  contact_placements: contactPlacements,
  contact_group_collapses: contactGroupCollapses,
  one_press_requests: onePressRequests,
  tool_uses: toolUses,
  test_file_runs: testFileRuns,
  handovers,
  readiness_checklists: readinessChecklists,
  readiness_signatures: readinessSignatures,
  signing_packages: signingPackages,
  signing_package_items: signingPackageItems,
  quick_input_asks: quickInputAsks,
  presses_for_the_person: pressesForThePerson,
} as const satisfies Record<AuthoredTable, SQLiteTable>

/**
 * A row of THIS table belongs to a project because a row of THAT table says so.
 *
 * The third form of the answer below. `column` is this table's SQL column holding the other row's
 * id, and `matches` is the column it names over there — so `agent_messages` is scoped by
 * `agent_messages.thread_id = agent_threads.id`, and the project is whatever that thread's
 * `workspace_id` says.
 *
 * BOTH COLUMN NAMES ARE READ OFF THE DECLARATIONS rather than typed, so renaming a column in the
 * table above moves this with it instead of leaving a string that no longer names anything.
 */
export interface ScopedThroughAnotherTable {
  /** The table whose row says which project this row is in. */
  readonly table: AuthoredTable
  /** The SQL column on THIS table that names a row of it. */
  readonly column: string
  /** The SQL column over there that the one above names. */
  readonly matches: string
}

/** How a row of one authored table is scoped to a project: a column, nothing, or another row. */
export type WorkspaceScope = string | null | ScopedThroughAnotherTable

/**
 * The tables whose project is a fact about another table's row, and which row that is.
 *
 * STATED HERE BECAUSE NOTHING IN SQLITE SAYS IT. A missing `workspace_id` is a fact the schema
 * carries; "and the thread is where the project lives" is a judgement, and this is the one place it
 * is written. It is the smallest thing that could not be derived: everything else about the scoping
 * below is read off the declarations.
 */
const SCOPED_THROUGH: Partial<Record<AuthoredTable, ScopedThroughAnotherTable>> = {
  agent_messages: { table: 'agent_threads', column: agentMessages.threadId.name, matches: agentThreads.id.name },
  agent_runs: { table: 'agent_threads', column: agentRuns.threadId.name, matches: agentThreads.id.name },
  // A marker belongs to the project its comment belongs to. Without this line the rule above would
  // read a table with no `workspace_id` as belonging to no project at all, and a project-scoped
  // archive would print, over that project's own comments, the sentence that says a plan belongs to
  // nobody.
  //
  // FIVE TESTS FAIL WITHOUT IT, AND THEY ARE ALL IN ONE FILE THIS COMMENT USED TO NOT NAME. It said
  // "Nothing fails without it, which is exactly why it is written here", and that was measured false
  // on 25 August 2026. Deleting this entry leaves `npx tsc --noEmit` at exit 0, because the map is a
  // `Partial<Record<...>>` and a missing key is a legal value; it also leaves
  // tests/schema-tables.test.ts and tests/export-format.test.ts green, and those are the two files
  // the prose around here is about and the two a maintainer would check. What goes red is
  // tests/export-workspace.test.ts > "a project archive states what it cannot carry, with the
  // numbers": five `it`s, among them "names every person-level table in its notes, with the count
  // the database holds". So the compiler does not hold this entry and the suite does — RUN THAT FILE.
  // A DELIVERY ROW BELONGS TO THE PROJECT ITS MESSAGE IS IN, and the message is a record. So a
  // project archive carries the marks of that project's messages and no others, which is what a
  // reader of the archive would expect: the message is there and how far it got is there with it.
  message_delivery: {
    table: 'records',
    column: messageDelivery.messageId.name,
    matches: records.id.name,
  },
  annotation_words_fixed: {
    table: 'records',
    column: annotationWordsFixed.annotationId.name,
    matches: records.id.name,
  },
  // A MEMBERSHIP BELONGS TO THE PROJECT ITS GROUP IS IN. `groups` carries its own `workspace_id`;
  // a membership carries none, because a copy of it on every row would be the same fact twice.
  // Without this line the rule below would read a table with no `workspace_id` as belonging to no
  // project at all, and a project archive would carry the groups and leave out who was in them.
  group_members: { table: 'groups', column: groupMembers.groupId.name, matches: groups.id.name },
  // A SIGNATURE BELONGS TO THE PROJECT ITS CHECKLIST WAS RAISED IN, for the reason a membership does: without this line a
  // project archive would carry the checklists and leave out who signed them.
  signing_package_items: { table: 'signing_packages', column: signingPackageItems.packageId.name, matches: signingPackages.id.name },
  readiness_signatures: { table: 'readiness_checklists', column: readinessSignatures.checklistId.name, matches: readinessChecklists.id.name },
  // `agent_records` IS NOT HERE, AND THE REASON WAS MEASURED. It names a project record, so the third
  // form would place it — and a project-scoped archive would then carry mapping rows pointing at
  // `agents` rows no project archive can carry, because a durable agent belongs to no project. The
  // restore of such an archive fails on the foreign key, which is what happened when it WAS listed
  // here: tests/agent-archive.test.ts imports a scoped archive and stopped with
  // `FOREIGN KEY constraint failed`. Half a mapping is worse than none, so the mapping travels with
  // the registry it points into: both belong to no project, and the whole-installation archive is
  // the one that carries them.
}

/**
 * How each authored table says which project a row of it belongs to. Three answers, not two.
 *
 *   a column name   the row says so itself, in that column. `workspaces` answers with its own
 *                   primary key, because the row IS the project.
 *   a `through`     the row says which OTHER row it belongs to, and that row carries the project.
 *   null            nothing can say. The planning layer, which is person-level on purpose.
 *
 * READ OFF THE DECLARATIONS, except for the one judgement `SCOPED_THROUGH` above states. A table
 * that declares `workspace_id` is scoped by it; a table that does not, and is not named up there,
 * has no project — and that is a fact about the schema rather than a decision made here.
 *
 * EVERY READER HANDLES ALL THREE, and there are three of them: `readTable` in lib/export.ts, and
 * two tests in tests/schema-tables.test.ts that check this against a migrated database. A reader
 * that only handled the first two would treat a through-scoped table as person-level, which is
 * exactly the wrong answer this form was added to remove — so `typeof scope === 'string'` is the
 * test, never `scope !== null`.
 *
 * It was a hand-written map in lib/export.ts whose comment said "`null` MEANS THE REGION BELONGS TO
 * NO PROJECT, and two do". Two migrations later four did, and the archive built from that map went
 * on describing two.
 */
export const WORKSPACE_COLUMN: Readonly<Record<AuthoredTable, WorkspaceScope>> = Object.fromEntries(
  AUTHORED_TABLES.map((table) => {
    if (table === 'workspaces') return [table, workspaces.id.name]
    const through = SCOPED_THROUGH[table]
    if (through !== undefined) return [table, through]
    const columns = getTableColumns(AUTHORED_TABLE_OF[table]) as Record<string, { name: string } | undefined>
    return [table, columns['workspaceId']?.name ?? null]
  }),
) as Record<AuthoredTable, WorkspaceScope>

/**
 * The authored tables that belong to NO project: the planning layer, the ones that hold who takes
 * part, and the ones that hold how one person has arranged their contacts.
 *
 * TWO KINDS OF TABLE ARE IN HERE AND THE REASONS ARE DIFFERENT. The planning layer is person-level
 * — a plan is one person's overlay across work that belongs to projects. `assets`, `people`,
 * `agents`, `agent_records`, `contact_groups` and `contact_placements` are installation-level: the
 * owner is the same person in every project on this machine, and so is a durable agent, and so is
 * the group the person has put that agent in. Both answers come out the same way here,
 * because the question this list asks is "can a project-scoped archive carry this row", and for
 * both kinds the answer is no. The archive's note names them; it does not have to know why.
 *
 * A plan is a person-level time-allocation overlay across workspace-owned work — the settled
 * decision written out in full on `allocations` in schema-parts/allocations.ts — so an allocation, a capacity row,
 * a draft, a recurrence and a work window have no project to be in. That is why a PROJECT-SCOPED archive
 * cannot carry any of them, and why it has to say so with the numbers rather than print a page
 * saying "Nothing has been drafted" over a database full of drafts.
 *
 * THE RULE IS "NOTHING CAN SAY WHICH PROJECT THIS ROW IS IN", WHICH IS NARROWER THAN "NO
 * `workspace_id` COLUMN". A table scoped through another table's row has no `workspace_id` either,
 * and it is not person-level: its project is written down, one row along. `WORKSPACE_COLUMN`
 * answers with a `through` for those, which is not null, so this filter leaves them out — and that
 * is the whole reason the third form exists. Until 18 August 2026 the rule really was the wider
 * one, and `agent_messages` and `agent_runs` were left out of `AUTHORED_TABLES` altogether rather
 * than be called person-level by it.
 *
 * `drizzle/0007_planning.sql` SAYS "NEITHER TABLE HAS A `workspace_id`, AND THEY ARE THE ONLY TWO",
 * AND THAT SENTENCE STAYS WRONG WHERE IT IS. It was true when 0007 was written; 0008 and 0009 added
 * `planning_drafts` and `planning_recurrences` on the same footing. An applied migration is history
 * and is never edited — not even its comments — because every existing database's journal row is a
 * claim about that file, and one edited comment has already cost this project a restore path. THIS
 * LIST IS THE CORRECTION, and it is where the migration's own header sends a reader.
 */
export const PERSON_LEVEL_TABLES: readonly AuthoredTable[] = AUTHORED_TABLES.filter(
  (table) => WORKSPACE_COLUMN[table] === null,
)
