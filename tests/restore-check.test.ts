// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Submission evidence coverage: the old snapshot omitted three authored tables and the lease column. Every previous comparison and column assertion remains. */
/**
 * THE CHECKER, CHECKED — can the restore proof in scripts/restore-check.ts actually fail?
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * tests/restore-semantics.test.ts destroys a database, rebuilds it, and reports that everything
 * held. That result is worth exactly as much as the comparison behind it, and a comparison that
 * cannot fail always holds. This project has already shipped that mistake at least twice: four
 * tests promising `GET /api` could not drift all passed while eight endpoints described themselves
 * as nothing, and two stamp columns could be written in UTC with 2,065 tests green.
 *
 * So every comparison is checked by BREAKING the thing it is about and asserting that it, and
 * nothing else, goes red. That is the difference between "the restore is faithful" and "nobody
 * looked".
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT WORKS, AND WHY IT NEEDS ONLY ONE DATABASE
 * ---------------------------------------------------------------------------------------
 *
 * One real snapshot is taken of one real seeded database. A FAITHFUL restore of it is the same
 * snapshot with the two machine columns nulled, the derived tables and key store emptied, and
 * visitor token hashes replaced by removal marks. Every test below starts from that pair,
 * plants one change in the restored side, and asks which comparison notices.
 *
 * The clones are made with JSON, not with structuredClone, on purpose: the command passes snapshots
 * between processes as JSON, so anything that does not survive JSON is not in a snapshot anyway and
 * a test that pretended otherwise would be testing something the command never sees.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { canonicalDatabasePath } from '../src/config/settings.mjs'
import { REMOVED_MARK } from '../src/config/what-a-copy-must-not-carry.mjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getTableColumns } from 'drizzle-orm'
import { freshDb, one, type TestDb } from './helpers.ts'
import { DEFAULT_WORKSPACE } from '@shared/workspaces.ts'
import {
  COMPARISON_NAMES,
  DECLARED_LOSSES,
  assertScratch,
  buildSnapshot,
  compareAccountingForLosses,
  compareSnapshots,
  fillEmptyTables,
  NOT_IN_THIS_PROOF,
  outOfThisProof,
  readOptions,
  readTheRoleCardsAtStart,
  readingIn,
  same,
  type Comparison,
  type Snapshot,
} from '../scripts/restore-check.ts'
import {
  AUTHORED_TABLES,
  officeSceneSettings,
  officeMapLayouts,
  runModels,
  runtimeSettings,
  officeRestartGrants,
  castingRows,
  castingRowChanges,
  castingLabels,
  castingLabelChanges,
  previewRootAdditions,
  priceTable,
  submissionBaselines, legacyUnsealedRuns,
  agentMessages,
  agentRecords,
  agentRuns,
  agents as agentsTable,
  installation as installationTable,
  worlds as worldsTable,
  visits as visitsTable,
  visitorCredentials,
  visitorRequests,
  trustedMachines,
  agentThreads,
  allocations,
  assets,
  people,
  changes,
  links,
  planningCapacity,
  planningIntents,
  planningRecurrences,
  planLines,
  planLineRevisions,
  counterRows,
  plans,
  presentationIntent,
  readerAnchors,
  records,
  revisions,
  repositories as repositoriesTable,
  implementationMap,
  implementationRevisions,
  annotationWordsFixed,
  measureWordsRenamed,
  messageDelivery,
  conversationReads,
  groups as groupsTable,
  groupMembers,
  workClaims,
  handleHolds,
  deadLetterClaims,
  contactGroups,
  contactPlacements,
  contactGroupCollapses,
  onePressRequests,
  toolUses,
  testFileRuns,
  handovers,
  readinessChecklists,
  readinessSignatures,
  signingPackages,
  signingPackageItems,
  quickInputList,
  quickInputAsks,
  whatTheGrantCarries,
  pressesForThePerson,
  residentReadGrants,
  residentVoidMarks,
  residentSpaceWrites,
  residentSleeps,
  fileObservations,
  revalidations as revalidationsTable,
  reviews as reviewsTable,
  sessionResources,
  workspaces,
  workWindows,
  folderReadings,
} from '../src/server/db/schema.ts'
import { everyPartTable } from '../src/server/db/every-part-table.ts'

const NOW = Date.UTC(2026, 7, 10, 12, 0, 0)

let db: TestDb
/** The origin, as Mole Office describes it. */
let origin: Snapshot
/** A faithful restore: machine columns NULL, derived tables and key store empty, visitor hashes removed. */
let faithful: Snapshot

/** A deep copy through JSON, which is how the command itself moves a snapshot between processes. */
function clone(snapshot: Snapshot): Snapshot {
  return JSON.parse(JSON.stringify(snapshot)) as Snapshot
}

/**
 * The project whose reading the planted changes below reach into.
 *
 * NAMED RATHER THAN `[0]`. `snapshot.attention` and `snapshot.sessions` hold one reading per project
 * — both readings are scoped, and the corpus now has two projects — so a test that took the first
 * entry would be pinned to whichever project sorted first, and would silently start testing a
 * different one the day a project was added. The default project is where the seeded corpus lives,
 * which is what makes these lists long enough for a reordering to be worth planting.
 */
const attentionHere = (s: Snapshot) => readingIn(s.attention, DEFAULT_WORKSPACE, 'attention reading')
const sessionsHere = (s: Snapshot) => readingIn(s.sessions, DEFAULT_WORKSPACE, 'session reading')

/**
 * Plant one change on the restored side and hand back the comparisons, losses accounted for.
 *
 * IT REFUSES WHEN THE PLANTED CHANGE CHANGED NOTHING. Most of the mutations below reach into the
 * snapshot with a `find`, and a `find` that matches nothing is a test that passes because it did
 * nothing — which is the failure this whole file exists to rule out, reappearing one level up.
 */
function planted(change: (after: Snapshot) => void): { comparisons: Comparison[]; broken: string[] } {
  const after = clone(faithful)
  const untouched = JSON.stringify(after)
  change(after)
  if (JSON.stringify(after) === untouched) {
    throw new Error('the planted change changed nothing, so this test would have passed without looking')
  }
  const { comparisons } = compareAccountingForLosses(origin, after)
  return {
    comparisons,
    broken: comparisons.filter((c) => c.verdict !== 'held').map((c) => c.name),
  }
}

beforeAll(async () => {
  db = await freshDb()
  // Importing the seed RUNS it, against the throwaway database freshDb just pointed at.
  await import('../scripts/seed.ts')
  // fillEmptyTables presses the dead-letter sweep, which reads the role declaration. This process
  // is the process that builds the database, so it reads the cards once, here, the way buildApp
  // does — see readTheRoleCardsAtStart.
  await readTheRoleCardsAtStart()
  // The seeded run's transcript goes into the folder freshDb made, which db.close() removes.
  await fillEmptyTables(dirname(db.file))
  origin = await buildSnapshot(NOW)

  faithful = clone(origin)
  for (const row of faithful.ledger) {
    row.pgid = null
    row.osStartedAt = null
  }
  for (const table of Object.keys(faithful.derived)) faithful.derived[table] = 0
  // A FAITHFUL RESTORE BRINGS BACK NO KEY HASH. The corpus holds one made-up hash so the assertion
  // is measured rather than vacuous; a restore of the archive must bring back none of it.
  for (const table of Object.keys(faithful.notCarried)) faithful.notCarried[table] = 0
  for (const row of faithful.visitorCredentials) row.tokenHash = REMOVED_MARK + row.id
  // THIS HOOK HAS A LIMIT OF ITS OWN, because the usual 10 seconds is too close. Run alone on
  // 3 November 2026, at a load of 15 on 20 cores, it took 6.7 seconds, 4.6 of them in freshDb.
  // Beside other test files, at a load of 12 to 16, it went past 10 seconds.
}, 60_000)

afterAll(() => {
  db.close()
})

// ================================================================ the baseline

describe('a faithful restore holds everywhere, which is what makes a planted failure mean something', () => {
  it('holds every comparison', () => {
    const { comparisons } = compareAccountingForLosses(origin, faithful)
    for (const comparison of comparisons) {
      expect(comparison.differences, comparison.name).toEqual([])
      expect(comparison.verdict, comparison.name).toBe('held')
    }
  })

  it('covers something in every comparison, and meets every corpus need', () => {
    const { comparisons } = compareAccountingForLosses(origin, faithful)
    for (const comparison of comparisons) {
      expect(comparison.covers, comparison.name).toBeGreaterThan(0)
      for (const need of comparison.needs) {
        expect(need.met, `${comparison.name}: ${need.what} — ${need.measured}`).toBe(true)
      }
    }
  })

  it('makes exactly the comparisons it declares, and no others', () => {
    const { comparisons } = compareAccountingForLosses(origin, faithful)
    expect(comparisons.map((c) => c.name)).toEqual([...COMPARISON_NAMES])
  })
})

// ================================================================ every column is looked at

/**
 * WHICH TABLES ARE OUT OF THIS PROOF IS THE SCRIPT'S OWN STATEMENT, READ HERE RATHER THAN RESTATED.
 *
 * `NOT_IN_THIS_PROOF` in scripts/restore-check.ts says which authored tables the corpus deliberately
 * leaves empty and why. Copying the names here would be the same fact in two places, which is this
 * repository's own named defect, and the copy would be the one that went stale.
 */
/** The authored tables this proof compares: every one of them, less the ones nothing writes. */
const COMPARED: string[] = [...AUTHORED_TABLES].filter((t) => !outOfThisProof(t))

/**
 * Every file under src/ that writes to one table, by drizzle or by raw SQL.
 *
 * TWO FORMS, BECAUSE THIS CODEBASE HAS TWO. `db.insert(theTable)` names the drizzle object, and the
 * SQL string form names the table. Comments are stripped first, or a file explaining that it does
 * NOT write a table would report itself.
 */
function filesWriting(table: string): string[] {
  const src = fileURLToPath(new URL('../src', import.meta.url))
  const camel = table.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
  const found: string[] = []
  for (const entry of readdirSync(src, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue
    const path = join(entry.parentPath, entry.name)
    const code = readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
    const writes =
      new RegExp(`insert\\(\\s*${camel}\\b`).test(code) ||
      // THE NAME IS READ WHOLE, so a table whose name begins with another's (casting_rows and casting) is not
      // taken for it.
      new RegExp(`INSERT\\s+INTO\\s+\`?${table}\`?(?![\\w])`, 'i').test(code) ||
      new RegExp(`UPDATE\\s+\`?${table}\`?\\s+SET`, 'i').test(code)
    if (writes) found.push(path.slice(src.length))
  }
  return found
}

describe('every column of every authored table reaches the comparison', () => {
  /**
   * Which part of a snapshot carries each table's rows.
   *
   * A MAPPING, NOT A SECOND LIST OF COLUMNS. The column names come from the drizzle objects
   * themselves, so a column added to src/server/db/schema.ts and not carried into the snapshot
   * fails here rather than being silently left out of every restore proof from then on.
   */
  const sections: Record<string, { table: unknown; rows: () => Record<string, unknown>[]; sqlColumnNames?: boolean }> = {
    // This snapshot preserves raw SQLite names; the remaining sections use Drizzle property names.
    office_scene_settings: { table: officeSceneSettings, rows: () => origin.officeSceneSettings, sqlColumnNames: true },
    office_map_layouts: { table: officeMapLayouts, rows: () => origin.officeMapLayouts, sqlColumnNames: true },
    run_models: { table: runModels, rows: () => origin.runModels, sqlColumnNames: true },
    runtime_settings: { table: runtimeSettings, rows: () => origin.runtimeSettings },
    office_restart_grants: { table: officeRestartGrants, rows: () => origin.officeRestartGrants },
    // Migration 0189's `casting` and `casting_changes` are on NOT_IN_THIS_PROOF: retired by migration 0190, with
    // no writer under src/ any more, so the corpus leaves them empty. THE CASTINGS of 0190:
    casting_rows: { table: castingRows, rows: () => origin.castingRows, sqlColumnNames: true },
    casting_row_changes: { table: castingRowChanges, rows: () => origin.castingRowChanges, sqlColumnNames: true },
    // THE CASTING LABELS of 0349 and their history, beside the castings that carry them.
    casting_labels: { table: castingLabels, rows: () => origin.castingLabels, sqlColumnNames: true },
    casting_label_changes: { table: castingLabelChanges, rows: () => origin.castingLabelChanges, sqlColumnNames: true },
    preview_root_additions: { table: previewRootAdditions, rows: () => origin.previewRootAdditions, sqlColumnNames: true },
    price_table: { table: priceTable, rows: () => origin.priceTable, sqlColumnNames: true },
    submission_baselines: { table: submissionBaselines, rows: () => origin.submissionBaselines },
    legacy_unsealed_runs: { table: legacyUnsealedRuns, rows: () => origin.legacyUnsealedRuns },
    workspaces: { table: workspaces, rows: () => origin.workspaces as unknown as Record<string, unknown>[] },
    records: { table: records, rows: () => origin.records as unknown as Record<string, unknown>[] },
    links: { table: links, rows: () => origin.links as unknown as Record<string, unknown>[] },
    changes: { table: changes, rows: () => origin.changes as unknown as Record<string, unknown>[] },
    // The revision ledger. Its snapshot rows carry every column, including the CONTENT — a revision
    // is the only stored copy of what a record used to hold, so a column dropped here is a column
    // whose loss nothing else in the database could reveal.
    revisions: { table: revisions, rows: () => origin.revisions as unknown as Record<string, unknown>[] },
    reader_anchors: { table: readerAnchors, rows: () => origin.anchors as unknown as Record<string, unknown>[] },
    presentation_intent: { table: presentationIntent, rows: () => origin.intent as unknown as Record<string, unknown>[] },
    // `panel_layouts` is on NOT_IN_THIS_PROOF: a decision takes it out of every backup and
    // export.
    session_resources: { table: sessionResources, rows: () => origin.ledger as unknown as Record<string, unknown>[] },
    folder_readings: {
      table: folderReadings,
      rows: () => origin.folderReadings as unknown as Record<string, unknown>[],
    },
    // The two tables with no workspace column. Their snapshot rows are keyed by their own primary
    // keys rather than by a project, which is why they are the only sections here whose rows carry
    // no `workspaceId` for this check to find — and the check is over the drizzle columns, so that
    // is not something this file has to know.
    allocations: { table: allocations, rows: () => origin.allocations as unknown as Record<string, unknown>[] },
    planning_capacity: { table: planningCapacity, rows: () => origin.capacities as unknown as Record<string, unknown>[] },
    planning_recurrences: {
      table: planningRecurrences,
      rows: () => origin.recurrences as unknown as Record<string, unknown>[],
    },
    plans: { table: plans, rows: () => origin.plans as unknown as Record<string, unknown>[] },
    plan_lines: { table: planLines, rows: () => origin.planLines as unknown as Record<string, unknown>[] },
    // WHY EACH LINE WAS ADDED, REORDERED OR DROPPED. Criterion P3, 16 September 2026. It is carried
    // for the reason the revision ledger is: the row is the only copy of why a plan changed, and
    // nothing else in the database could reveal that it had been lost.
    plan_line_revisions: {
      table: planLineRevisions,
      rows: () => origin.planLineRevisions as unknown as Record<string, unknown>[],
    },
    // EVERY ADDITION, FIRING AND HELD-BACK FIRING OF A COUNTER. Criteria CT2 and CT5 to CT7. It is
    // carried for the reason the revision ledger is, one step further on: the rows are not a copy of
    // the count, they ARE the count, which is added up from them on every read and stored nowhere.
    counter_rows: {
      table: counterRows,
      rows: () => origin.counterRows as unknown as Record<string, unknown>[],
    },
    planning_intents: {
      table: planningIntents,
      rows: () => origin.planningIntents as unknown as Record<string, unknown>[],
    },
    work_windows: { table: workWindows, rows: () => origin.workWindows as unknown as Record<string, unknown>[] },
    // Who takes part, and the pictures they are drawn with. None of the first three carries a
    // `workspaceId` for this check to find, because none of them belongs to a project: the owner is
    // the same person in every project on this machine and so is a durable agent. `agent_records` is
    // the one that IS placed, by the record it names.
    assets: { table: assets, rows: () => origin.assets as unknown as Record<string, unknown>[] },
    people: { table: people, rows: () => origin.people as unknown as Record<string, unknown>[] },
    agents: { table: agentsTable, rows: () => origin.agents as unknown as Record<string, unknown>[] },
    agent_records: { table: agentRecords, rows: () => origin.agentRecords as unknown as Record<string, unknown>[] },
    // Which installation this database belongs to. One row, and it carries no `workspaceId` either:
    // it is a fact about the whole database.
    installation: { table: installationTable, rows: () => origin.installation as unknown as Record<string, unknown>[] },
    // Every world the office knows. It carries no `workspaceId` either: a world holds every project
    // it has, so it belongs to none of them.
    worlds: { table: worldsTable, rows: () => origin.officeWorlds as unknown as Record<string, unknown>[] },
    // A visit is about two worlds rather than about any project inside either, so it carries no
    // `workspaceId` for this check to find.
    visits: { table: visitsTable, rows: () => origin.officeVisits as unknown as Record<string, unknown>[] },
    // A visiting agent's credential and every request made under it. Neither carries a
    // `workspaceId` for this check to find: a credential is held against the whole installation,
    // because an agent that visits does not visit one project.
    visitor_credentials: {
      table: visitorCredentials,
      rows: () => origin.visitorCredentials as unknown as Record<string, unknown>[],
    },
    visitor_requests: {
      table: visitorRequests,
      rows: () => origin.visitorRequests as unknown as Record<string, unknown>[],
    },
    // THE MACHINES THIS OFFICE TRUSTS, criterion P73. No workspace column: which machines an office
    // trusts belongs to the installation, like the credentials above it.
    trusted_machines: {
      table: trustedMachines,
      rows: () => origin.trustedMachines as unknown as Record<string, unknown>[],
    },
    // Talking to an agent. Only the conversation carries a `workspaceId` for this check to find:
    // a comment and a run belong to the project their conversation names, and the check is over the
    // drizzle columns, so that is not something this file has to know.
    agent_threads: { table: agentThreads, rows: () => origin.agentThreads as unknown as Record<string, unknown>[] },
    agent_messages: { table: agentMessages, rows: () => origin.agentMessages as unknown as Record<string, unknown>[] },
    agent_runs: { table: agentRuns, rows: () => origin.agentRuns as unknown as Record<string, unknown>[] },
    // A review. Its snapshot rows carry `entry` and `frozen` whole: `entry` is where somebody was
    // standing, which everything the review collects is worked out from, and `frozen` is what was
    // inside at the moment collecting finished — the one fact in the table that nothing else in the
    // database can say afterwards.
    reviews: { table: reviewsTable, rows: () => origin.reviews as unknown as Record<string, unknown>[] },
    // The implementation map. Three tables and one comparison, because a relationship names a
    // repository and may name a code revision, and any of the three coming back without the others
    // leaves a statement about code pointing at nothing.
    repositories: { table: repositoriesTable, rows: () => origin.repositories as unknown as Record<string, unknown>[] },
    implementation_map: {
      table: implementationMap,
      rows: () => origin.implementationMap as unknown as Record<string, unknown>[],
    },
    implementation_revisions: {
      table: implementationRevisions,
      rows: () => origin.codeRevisions as unknown as Record<string, unknown>[],
    },
    // What each scan saw. It left NOT_IN_THIS_PROOF in the commit that gave it a writer, which is
    // the rule that list states: the wave that builds a writer adds the section. It is the one
    // authored table nothing can rebuild from the disk — a scan rebuilds `source_files`, and no scan
    // rebuilds what a scan on Tuesday saw.
    file_observations: {
      table: fileObservations,
      rows: () => origin.fileObservations as unknown as Record<string, unknown>[],
    },
    // Window B's one-way marker. It left NOT_IN_THIS_PROOF in the commit that gave it a writer,
    // which is the rule that list states: the wave that builds a writer adds the section.
    annotation_words_fixed: {
      table: annotationWordsFixed,
      rows: () => origin.annotationWordsFixed as unknown as Record<string, unknown>[],
    },
    // Migration 0173's one row, written by the measure-word data step. Raw SQLite names, like the
    // other one-row tables above.
    measure_words_renamed: { table: measureWordsRenamed, rows: () => origin.measureWordsRenamed, sqlColumnNames: true },
    // Which work a restriction reached. THE LAST NAME TO LEAVE NOT_IN_THIS_PROOF, and it left by
    // exactly the mechanism that list describes: wave 8 built `writeRevalidationRows` and
    // `recordJudgement`, the scan below went red naming both files, and the section had to be
    // written before this suite was green again.
    revalidations: {
      table: revalidationsTable,
      rows: () => origin.revalidations as unknown as Record<string, unknown>[],
    },
    // How far each message got with each recipient, added with the one message pool. It arrives with
    // its writer already built, so it never sat in NOT_IN_THIS_PROOF.
    message_delivery: {
      table: messageDelivery,
      rows: () => origin.messageDelivery as unknown as Record<string, unknown>[],
    },
    // Who read a conversation they were not part of, added with the durable record of that read. It
    // arrives with its writer already built, so it never sat in NOT_IN_THIS_PROOF either.
    conversation_reads: {
      table: conversationReads,
      rows: () => origin.conversationReads as unknown as Record<string, unknown>[],
    },
    // A group and who is in it, added with groups themselves. Both arrive with their writers already
    // built, so neither sat in NOT_IN_THIS_PROOF.
    groups: {
      table: groupsTable,
      rows: () => origin.groups as unknown as Record<string, unknown>[],
    },
    group_members: {
      table: groupMembers,
      rows: () => origin.groupMembers as unknown as Record<string, unknown>[],
    },
    // What an agent is working on, added with work claims. It arrives with its writer already built,
    // so it never sat in NOT_IN_THIS_PROOF.
    work_claims: {
      table: workClaims,
      rows: () => origin.workClaims as unknown as Record<string, unknown>[],
    },
    // Which session was answering as which agent, added with the holds themselves. It arrives with
    // its writer already built, so it never sat in NOT_IN_THIS_PROOF.
    handle_holds: {
      table: handleHolds,
      rows: () => origin.handleHolds as unknown as Record<string, unknown>[],
    },
    // Which addressee's dead letters a secretary has taken on, criterion M111. It arrives with its
    // writer already built — the sweep names the addressees and a secretary claims them — so it
    // never sat in NOT_IN_THIS_PROOF. The seeded rows hold both shapes: one claimed, one waiting.
    dead_letter_claims: {
      table: deadLetterClaims,
      rows: () => origin.deadLetterClaims as unknown as Record<string, unknown>[],
    },
    contact_groups: {
      table: contactGroups,
      rows: () => origin.contactGroups as unknown as Record<string, unknown>[],
    },
    contact_placements: {
      table: contactPlacements,
      rows: () => origin.contactPlacements as unknown as Record<string, unknown>[],
    },
    // WHETHER ONE PERSON HAS FOLDED ONE CONTACT GROUP AWAY, added with M121. It arrives with its
    // writer already built — `setAContactGroupCollapsed` is what the panel's fold press calls — so
    // it never sat in NOT_IN_THIS_PROOF.
    contact_group_collapses: {
      table: contactGroupCollapses,
      rows: () => origin.contactGroupCollapses as unknown as Record<string, unknown>[],
    },
    // A REQUEST FOR ONE PRESS, added by migration 0206 with its writers, so it never sat in NOT_IN_THIS_PROOF.
    one_press_requests: { table: onePressRequests, rows: () => origin.onePressRequests as unknown as Record<string, unknown>[] },
    // A USE OF A TOOL, added by migration 0231 with its writer, so it never sat in NOT_IN_THIS_PROOF.
    tool_uses: { table: toolUses, rows: () => origin.toolUses as unknown as Record<string, unknown>[] },
    test_file_runs: { table: testFileRuns, rows: () => origin.testFileRuns as unknown as Record<string, unknown>[] },
    // A HANDOVER DOCUMENT FOR AN AGENT, added by migration 0232 with its writer, so it never sat in NOT_IN_THIS_PROOF.
    handovers: { table: handovers, rows: () => origin.handovers as unknown as Record<string, unknown>[] },
    // A READINESS CHECKLIST AND ITS SIGNATURES, added by migration 0252 with their writers, so neither sat in NOT_IN_THIS_PROOF.
    readiness_checklists: { table: readinessChecklists, rows: () => origin.readinessChecklists as unknown as Record<string, unknown>[] },
    readiness_signatures: { table: readinessSignatures, rows: () => origin.readinessSignatures as unknown as Record<string, unknown>[] },
    // A SIGNING PACKAGE AND ITS ITEMS, added by migration 0270 with their writers, so neither sat in NOT_IN_THIS_PROOF.
    signing_packages: { table: signingPackages, rows: () => origin.signingPackages as unknown as Record<string, unknown>[] },
    signing_package_items: { table: signingPackageItems, rows: () => origin.signingPackageItems as unknown as Record<string, unknown>[] },
    // THE OWNER'S LIST OF QUICK INPUTS AND EVERY ASK FOR ONE, added by migration 0272 with their writers, so neither sat
    // in NOT_IN_THIS_PROOF. Both snapshots keep the raw SQLite names.
    quick_input_list: { table: quickInputList, rows: () => origin.quickInputList, sqlColumnNames: true },
    quick_input_asks: { table: quickInputAsks, rows: () => origin.quickInputAsks, sqlColumnNames: true },
    // WHAT THE PERSON'S GRANT CARRIES IN THIS OFFICE, added by migration 0287 with its writer, so it never sat in
    // NOT_IN_THIS_PROOF.
    what_the_grant_carries: { table: whatTheGrantCarries, rows: () => origin.whatTheGrantCarries },
    // A PRESS FOR THE PERSON, added by migration 0280 with its writer, so it never sat in NOT_IN_THIS_PROOF.
    presses_for_the_person: { table: pressesForThePerson, rows: () => origin.pressesForThePerson },
    // A RESIDENT'S LEAVE TO READ, VOID MARKS AND WRITES, added by the residents' migration with their writers.
    resident_read_grants: { table: residentReadGrants, rows: () => origin.residentReadGrants as unknown as Record<string, unknown>[] },
    resident_void_marks: { table: residentVoidMarks, rows: () => origin.residentVoidMarks as unknown as Record<string, unknown>[] },
    resident_space_writes: { table: residentSpaceWrites, rows: () => origin.residentSpaceWrites as unknown as Record<string, unknown>[] },
    // A RESIDENT'S SLEEPS AND POSTPONED SLEEPS, added by 0233 with their writers.
    resident_sleeps: { table: residentSleeps, rows: () => origin.residentSleeps as unknown as Record<string, unknown>[] },
  }

  it('has a snapshot section for every authored table anything can write, so none can be forgotten', () => {
    expect(Object.keys(sections).sort()).toEqual(COMPARED.sort())
  })

  it('and the tables it leaves out are exactly the ones nothing in the product writes', () => {
    // THIS IS THE HALF THAT MAKES THE LIST SAFE. A named exception with no check on it is a place to
    // hide a table for ever, which is how `work_windows` spent a day out of every backup. So the
    // reason each entry gives is tested rather than believed: the walk below reads every file under
    // src/ and fails the moment one of them writes to one of these tables, whether by drizzle's
    // insert or by raw SQL. The wave that builds a writer then has to add the snapshot section in
    // the same commit, because its own tests will be red until it does.
    //
    // The walk is the one `tests/one-run-door.test.ts` uses to keep a single insert site honest.
    for (const table of NOT_IN_THIS_PROOF) {
      expect(table.why.length, `${table.table} is excused with no reason given`).toBeGreaterThan(60)
      const writers = filesWriting(table.table)
      expect(
        writers,
        `${table.table} is excused from the restore proof because nothing writes it, and ${writers.join(', ')} ` +
          'does. Give it a snapshot section and take it off this list.',
      ).toEqual([])
    }
    // And every one of them really is an authored table, so the list cannot excuse a name that is
    // not in the backup at all.
    // A table a schema part declares counts as one: its own declaration put it on this list (wave 13s round 103).
    for (const table of NOT_IN_THIS_PROOF) {
      expect([...AUTHORED_TABLES, ...everyPartTable().map((t) => t.name)], `${table.table} is not an authored table`).toContain(table.table)
    }
  })

  it.each(COMPARED)('%s — every column is in the snapshot', (table) => {
    const section = sections[table]
    expect(section, `no snapshot section for ${table}`).toBeDefined()
    if (section === undefined) return
    const rows = section.rows()
    expect(rows.length, `${table} is empty, so this proves nothing about its columns`).toBeGreaterThan(0)
    const first = rows[0]
    if (first === undefined) return
    for (const [property, column] of Object.entries(getTableColumns(section.table as Parameters<typeof getTableColumns>[0]))) {
      const name = section.sqlColumnNames ? column.name : property
      expect(Object.keys(first), `${table}.${name} is not carried into the snapshot`).toContain(name)
    }
  })
})

// ================================================================ each comparison can fail

describe('each comparison notices when the thing it is about is broken', () => {
  it('mole size — losing the saved scale changes the restore comparison', () => {
    const { broken } = planted((after) => {
      const agent = after.agents.find(row => row.pixelScale !== null)
      expect(agent, 'the source must contain a saved size').toBeDefined()
      if (agent) agent.pixelScale = null
    })
    expect(broken).toEqual(['pixel appearances and office scene'])
  })

  it('records of every kind — a changed title', () => {
    const { broken } = planted((after) => {
      const record = after.records[0]
      if (record !== undefined) record.title = `${record.title} (moved)`
    })
    expect(broken).toEqual(['records of every kind'])
  })

  it('records of every kind — a record that did not come back', () => {
    const { broken } = planted((after) => {
      after.records = after.records.slice(1)
      after.recordsByKind = {}
      for (const r of after.records) after.recordsByKind[r.kind] = (after.recordsByKind[r.kind] ?? 0) + 1
    })
    expect(broken).toContain('records of every kind')
  })

  it('records of every kind — one changed leaf, eight levels down inside `data`', () => {
    const { broken } = planted((after) => {
      // A LONG RECORD WITH A DIGIT TO CHANGE. Since wave 13k's round 17 the first long record in the
      // seed can be a card message holding a role's handbook, which has no digit before a comma or a
      // bracket, so the find names both conditions rather than trusting the first long record.
      const digit = /([0-9])(?=[,}\]])/
      const deep = after.records.find((r) => JSON.stringify(r.data).length > 4000 && digit.test(JSON.stringify(r.data)))
      expect(deep, 'the corpus has no deep record, so this test proves nothing').toBeDefined()
      if (deep === undefined) return
      const text = JSON.stringify(deep.data).replace(digit, (d) => String((Number(d) + 1) % 10))
      deep.data = JSON.parse(text) as unknown
    })
    expect(broken).toContain('records of every kind')
  })

  it('counters — a held-back firing that came back as a firing', () => {
    // THE TRAP THE COMPARISON NAMES. A held-back row says the office decided NOT to act because of
    // the limit; a firing says it acted. A restore that turned one into the other would say a line
    // went out that never did, with every row present and every count matching.
    const { broken } = planted((after) => {
      const held = after.counterRows.find((row) => row.what === 'held back')
      expect(held, 'the corpus holds no held-back firing, so this test proves nothing').toBeDefined()
      if (held !== undefined) held.what = 'firing'
    })
    expect(broken).toEqual(['counters, and what they counted'])
  })

  it('counters — a firing that came back with no account of what its action did', () => {
    const { broken } = planted((after) => {
      const fired = after.counterRows.find((row) => row.what === 'firing')
      expect(fired, 'the corpus holds no firing, so this test proves nothing').toBeDefined()
      if (fired !== undefined) fired.answer = null
    })
    expect(broken).toEqual(['counters, and what they counted'])
  })

  it('permanent residents — a void mark that did not come back', () => {
    // THE TRAP THE COMPARISON NAMES: a file the resident struck out would be back among the ones it reads.
    const { broken } = planted((after) => {
      expect(after.residentVoidMarks.length, 'the corpus holds no void mark, so this test proves nothing').toBeGreaterThan(0)
      after.residentVoidMarks = after.residentVoidMarks.slice(1)
    })
    expect(broken).toEqual(['permanent residents and their spaces'])
  })

  it('permanent residents — a residency that came back confirmed by nobody', () => {
    const { broken } = planted((after) => {
      const resident = after.agents.find((agent) => agent.residentSince !== null)
      expect(resident, 'the corpus holds no resident, so this test proves nothing').toBeDefined()
      if (resident !== undefined) resident.residentConfirmedById = null
    })
    expect(broken).toEqual(['permanent residents and their spaces'])
  })

  it('links and backlinks — a link that did not come back', () => {
    const { broken } = planted((after) => {
      const gone = one(after.links.slice(0, 1), 'a link to drop')
      after.links = after.links.filter((l) => l.id !== gone.id)
      for (const end of after.backlinks) end.links = end.links.filter((l) => l.linkId !== gone.id)
    })
    expect(broken).toContain('links and backlinks')
  })

  it('links and backlinks — a broken link that came back looking whole', () => {
    const { broken } = planted((after) => {
      for (const end of after.backlinks) for (const link of end.links) link.broken = false
    })
    expect(broken).toEqual(['links and backlinks'])
  })

  it('inferred versus confirmed — a guess that came back as an assertion', () => {
    const { broken } = planted((after) => {
      const inferred = after.links.find((l) => l.inferred)
      expect(inferred, 'the corpus has no inferred link').toBeDefined()
      if (inferred !== undefined) inferred.inferred = false
    })
    expect(broken).toEqual(
      expect.arrayContaining(['links and backlinks', 'inferred versus confirmed relationships']),
    )
  })

  it('block-to-module mappings — a block that lost the module carrying it', () => {
    const { broken } = planted((after) => {
      for (const pipeline of after.pipelines) {
        for (const block of pipeline.blocks) {
          if (block.moduleIds.length > 0) {
            block.moduleIds = []
            block.modules = []
            return
          }
        }
      }
    })
    expect(broken).toEqual(['block-to-module mappings'])
  })

  it('block-to-module mappings — a pipeline whose blocks came back in a different order', () => {
    const { broken } = planted((after) => {
      const pipeline = after.pipelines.find((p) => p.blocks.length > 1)
      if (pipeline !== undefined) pipeline.blocks.reverse()
    })
    expect(broken).toEqual(['block-to-module mappings'])
  })

  it('gates — a partial gate that came back hard', () => {
    const { broken } = planted((after) => {
      const partial = after.links.find((l) => l.gate === 'partial')
      expect(partial, 'the corpus has no partial gate').toBeDefined()
      if (partial !== undefined) partial.gate = 'hard'
    })
    expect(broken).toEqual(expect.arrayContaining(['gates, hard and partial']))
  })

  it('gates — a NULL gate that came back hard, which is the mistake `partial` exists to stop', () => {
    const { broken } = planted((after) => {
      const none = after.links.find((l) => l.type === 'blocks' && l.gate === null)
      expect(none, 'the corpus has no unqualified gate').toBeDefined()
      if (none !== undefined) none.gate = 'hard'
    })
    expect(broken).toEqual(expect.arrayContaining(['gates, hard and partial']))
  })

  it('gates — a stage a partial gate stops at, dropped', () => {
    const { broken } = planted((after) => {
      const upTo = after.links.find((l) => l.gateUpTo !== null)
      if (upTo !== undefined) upTo.gateUpTo = null
    })
    expect(broken).toEqual(expect.arrayContaining(['gates, hard and partial']))
  })

  it('presentation intent — an arrangement that came back changed', () => {
    const { broken } = planted((after) => {
      const row = after.intent[0]
      if (row !== undefined) row.intent = { lane: 'somewhere else' }
    })
    expect(broken).toEqual(['presentation intent'])
  })

  it('attention — the ranked list in a different order', () => {
    const { broken } = planted((after) => {
      // ONE PROJECT'S READING, named. `attention` is one entry per project now, and reaching for
      // `[0]` would pin this test to whichever project sorted first.
      const keys = attentionHere(after).visibleKeys
      const first = keys[0]
      const second = keys[1]
      if (first === undefined || second === undefined) return
      keys[0] = second
      keys[1] = first
    })
    expect(broken).toEqual(['attention-relevant semantics'])
  })

  it('attention — one row with a different score', () => {
    const { broken } = planted((after) => {
      const row = attentionHere(after).rows[0] as { score?: number } | undefined
      if (row !== undefined) row.score = (row.score ?? 0) + 1
    })
    expect(broken).toEqual(['attention-relevant semantics'])
  })

  it('attention — a row that lost its recorded consequence', () => {
    const { broken } = planted((after) => {
      for (const row of attentionHere(after).rows as { reason?: { consequence?: unknown } }[]) {
        if (row.reason?.consequence != null) {
          row.reason.consequence = null
          return
        }
      }
    })
    expect(broken).toEqual(['attention-relevant semantics'])
  })

  it('attention — a record that dropped out of a passed-over bucket', () => {
    const { broken } = planted((after) => {
      const bucket = attentionHere(after).passedOver.find((g) => g.keys.length > 1)
      if (bucket !== undefined) bucket.keys = bucket.keys.slice(1)
    })
    expect(broken).toEqual(['attention-relevant semantics'])
  })

  it('sessions — a change row filed under a different session', () => {
    const { broken } = planted((after) => {
      const ref = sessionsHere(after).storedRefs[0]
      if (ref !== undefined) ref.rows += 1
    })
    expect(broken).toEqual(['sessions where they belong'])
  })

  it('sessions — a ledger row that came back under nobody', () => {
    const { broken } = planted((after) => {
      sessionsHere(after).ledgerBySession = []
    })
    expect(broken).toEqual(['sessions where they belong'])
  })

  it('Unicode — a Chinese title normalised on the way back', () => {
    const { broken } = planted((after) => {
      const chinese = after.text.find((t) => /[一-鿿]/.test(t.text))
      expect(chinese, 'the corpus has no Chinese text').toBeDefined()
      if (chinese === undefined) return
      // One code point swapped for another that looks nothing like it, which is the mild version of
      // what a normalising format does.
      chinese.codePoints = [...chinese.codePoints.slice(0, -1), 0x4e00]
    })
    expect(broken).toEqual(['Unicode and Chinese text'])
  })

  it('soft-deleted — a deleted record that came back alive', () => {
    const { broken } = planted((after) => {
      const gone = after.deleted[0]
      if (gone === undefined) return
      after.deleted = after.deleted.filter((r) => r.id !== gone.id)
      const record = after.records.find((r) => r.id === gone.id)
      if (record !== undefined) record.deletedAt = null
    })
    expect(broken).toEqual(
      expect.arrayContaining(['records of every kind', 'soft-deleted records with their recoverable history']),
    )
  })

  it('soft-deleted — a deleted record that came back without the history that recovers it', () => {
    const { broken } = planted((after) => {
      const gone = after.deleted.find((r) => r.history.length > 0)
      if (gone !== undefined) gone.history = []
    })
    expect(broken).toEqual(['soft-deleted records with their recoverable history'])
  })

  it('the change log — one change row with a rewritten value', () => {
    const { broken } = planted((after) => {
      const row = after.changes.find((c) => c.oldValue !== null)
      if (row !== undefined) row.oldValue = 'something else'
    })
    expect(broken).toEqual(['the change log itself'])
  })

  it('the change log — a row that did not come back', () => {
    const { broken } = planted((after) => {
      after.changes = after.changes.slice(1)
    })
    // TWO COMPARISONS NOTICE, and both are right about a different thing. `the change log itself`
    // says the row is gone. `project boundaries` says the project that row was filed in came back
    // holding one fewer change row — which is the reading that would catch a restore that brought
    // every row back and filed them all in the wrong project, where the row-by-row comparison
    // compares each `workspaceId` against itself and holds.
    expect([...broken].sort()).toEqual(['project boundaries', 'the change log itself'])
  })

  it('the change log — a row that lost the press for the person that wrote it', () => {
    const { broken } = planted((after) => {
      const row = after.changes.find((c) => c.pressId !== null)
      expect(row, 'no change row in the corpus names a press for the person, so this test proves nothing').toBeDefined()
      if (row !== undefined) row.pressId = null
    })
    expect(broken).toEqual(['the change log itself'])
  })

  it('the change log — a press for the person that did not come back', () => {
    const { broken } = planted((after) => {
      expect(after.pressesForThePerson.length, 'the corpus holds no press for the person').toBeGreaterThan(0)
      after.pressesForThePerson = after.pressesForThePerson.slice(1)
    })
    expect(broken).toEqual(['the change log itself'])
  })

  it('what the grant carries — an answer this office set that came back as another answer', () => {
    // THE CHECK PLANTS ONE ROW THROUGH THE PRODUCT'S OWN WRITER, and the corpus holds no other, so a
    // find that matches nothing would make this test pass without looking. Changing the answer is the
    // smallest restore mistake with a consequence: the row is still there, every count still matches,
    // and the door the person opened or closed has silently gone the other way.
    const { broken } = planted((after) => {
      const row = after.whatTheGrantCarries[0]
      expect(row, 'the corpus holds no answer set by the person, so this test proves nothing').toBeDefined()
      if (row !== undefined) row.answer = row.answer === 'kept' ? 'may-press' : 'kept'
    })
    expect(broken).toEqual(['what the grant carries in this office'])
  })

  it('plans and their lines — a line that came back with its trailing space trimmed', () => {
    const { broken } = planted((after) => {
      const line = after.planLines.find((l) => l.text !== l.text.trimEnd())
      expect(line, 'no plan line in the corpus has a trailing space, so this test proves nothing').toBeDefined()
      if (line !== undefined) line.text = line.text.trimEnd()
    })
    expect(broken).toEqual(['plans and their lines'])
  })

  it('plans and their lines — a blank line that was dropped on the way through', () => {
    const { broken } = planted((after) => {
      const blank = after.planLines.find((l) => l.text === '')
      expect(blank, 'no plan line in the corpus is blank, so this test proves nothing').toBeDefined()
      if (blank !== undefined) after.planLines = after.planLines.filter((l) => l.id !== blank.id)
    })
    expect(broken).toEqual(['plans and their lines'])
  })

  it('plans and their lines — a filed line that came back looking as though nobody had filed it', () => {
    const { broken } = planted((after) => {
      const filed = after.planLines.find((l) => l.recordId !== null)
      expect(filed, 'no plan line in the corpus was filed as work, so this test proves nothing').toBeDefined()
      if (filed !== undefined) filed.recordId = null
    })
    expect(broken).toEqual(['plans and their lines'])
  })

  it('the plan — hours that came back having forgotten the plan line they came from', () => {
    const { broken } = planted((after) => {
      const fromPlan = after.allocations.find((a) => a.fromPlanLine !== null)
      expect(fromPlan, 'no allocation in the corpus came from a plan line, so this test proves nothing').toBeDefined()
      if (fromPlan !== undefined) fromPlan.fromPlanLine = null
    })
    expect(broken).toEqual(['the plan'])
  })

  // WHY THE THREE BELOW ARE THREE AND NOT ONE. A window is two dates, a note and a state, and it
  // carries no hours — so nothing else in the database disagrees when one of them comes back wrong.
  // Each of the three is a different way that happens, and a single test over one of them would
  // leave the other two unwatched.
  it('when somebody means to work — a span that came back one day shorter', () => {
    const { broken } = planted((after) => {
      const span = after.workWindows.find((w) => w.startsOn !== w.endsOn)
      expect(span, 'no window in the corpus runs across more than one day, so this test proves nothing').toBeDefined()
      // What an end date read as EXCLUSIVE would produce. Both days are inside a window.
      if (span !== undefined) {
        const day = new Date(`${span.endsOn}T00:00:00`)
        day.setDate(day.getDate() - 1)
        span.endsOn = day.toISOString().slice(0, 10)
      }
    })
    expect(broken).toEqual(['when somebody means to work'])
  })

  it('when somebody means to work — a dropped span that came back looking planned', () => {
    const { broken } = planted((after) => {
      const dropped = after.workWindows.find((w) => w.state === 'dropped')
      expect(dropped, 'no window in the corpus was dropped, so this test proves nothing').toBeDefined()
      if (dropped !== undefined) dropped.state = 'planned'
    })
    expect(broken).toEqual(['when somebody means to work'])
  })

  it('when somebody means to work — a handover note that did not come back', () => {
    const { broken } = planted((after) => {
      const noted = after.workWindows.find((w) => w.note !== null)
      expect(noted, 'no window in the corpus carries a note, so this test proves nothing').toBeDefined()
      if (noted !== undefined) noted.note = null
    })
    expect(broken).toEqual(['when somebody means to work'])
  })

  // WHY THESE FIVE ARE FIVE. A review is one human act with several facts in it, and each of the
  // five below is a different way a restore can bring back all the rows and a different review.
  // Nothing else in the database disagrees with any of them: no count changes, no id goes missing,
  // and no other comparison is looking.
  it('a review — a comment that came back addressed to the other agent', () => {
    // THE ONE THIS COMPARISON EXISTS FOR. One review goes to several agents; if a comment comes back
    // under a different recipient, every comment is still there, every run is still there, and the
    // review now asks a different agent to do the work.
    const { broken } = planted((after) => {
      const addressed = after.agentMessages.filter((m) => m.recipientKind === 'session')
      const moved = addressed[0]
      const elsewhere = after.agentMessages.find((m) => m.recipientKind === 'new')
      expect(moved, 'no comment in the corpus is addressed to a session, so this test proves nothing').toBeDefined()
      expect(elsewhere, 'every comment goes to the same place, so moving one proves nothing').toBeDefined()
      if (moved !== undefined && elsewhere !== undefined) {
        moved.recipientKind = 'new'
        moved.recipientSessionId = null
      }
    })
    expect(broken).toEqual(['a review, and who each comment went to'])
  })

  it('a review — the sentence saying how a recipient was chosen, gone', () => {
    // `recipientWhy` is what makes a chosen recipient arguable rather than a thing that happened.
    // Losing it leaves the choice on the screen with no account of how it was made.
    const { broken } = planted((after) => {
      const explained = after.agentMessages.find((m) => m.recipientWhy !== null)
      expect(explained, 'no comment carries a reason, so this test proves nothing').toBeDefined()
      if (explained !== undefined) explained.recipientWhy = null
    })
    expect(broken).toEqual(['a review, and who each comment went to'])
  })

  it('a review — a quoted span that came back without the words it quoted', () => {
    // The quote is why a comment still says what it was about after the text under it is rewritten.
    // A restore that dropped it would leave the comment pointing at an offset into a document that
    // has moved on, which is the pretending this product refuses to do.
    const { broken } = planted((after) => {
      const quoting = after.agentMessages.find((m) => m.context !== null && m.context.includes('"quote"'))
      expect(quoting, 'no comment in the corpus quotes anything, so this test proves nothing').toBeDefined()
      if (quoting !== undefined) quoting.context = null
    })
    expect(broken).toEqual(['a review, and who each comment went to'])
  })

  it('a review — a run that came back holding a different question', () => {
    // `request` is written once and is the only record of what a worker was asked. An answer read
    // against a question nobody has is not evidence of anything.
    const { broken } = planted((after) => {
      const asked = after.agentRuns.find((r) => r.request !== null)
      expect(asked, 'no run carries a request, so this test proves nothing').toBeDefined()
      if (asked !== undefined) asked.request = { messages: [] }
    })
    expect(broken).toEqual(['a review, and who each comment went to'])
  })

  it('a review — a comment that came back under a conversation in another project', () => {
    // THE THROUGH-SCOPING, AND THE REASON IT IS COMPARED SEPARATELY. A comment carries no workspace
    // of its own, so moving it to another conversation changes no column that says a project — and
    // the row-by-row comparison of `agent_messages` would report one changed `threadId` and nothing
    // about the project it now belongs to. The reading that follows the conversation is what says
    // that out loud.
    const { broken, comparisons } = planted((after) => {
      const thread = after.agentThreads[0]
      expect(thread, 'the corpus holds no conversation, so this test proves nothing').toBeDefined()
      if (thread !== undefined) thread.workspaceId = 'somewhere-else'
    })
    expect(broken).toEqual(['a review, and who each comment went to'])
    const review = one(
      comparisons.filter((c) => c.name === 'a review, and who each comment went to'),
      'the review comparison',
    )
    expect(review.differences.map((d) => d.where).join(' ')).toContain('the project of comment')
  })

  it('reader anchors — an anchor pointing at a different change row', () => {
    const { broken } = planted((after) => {
      const anchor = after.anchors[0]
      if (anchor !== undefined) anchor.lastChangeId = null
    })
    expect(broken).toEqual(['reader anchors'])
  })

  // THE THREE THINGS A RESTORE CAN QUIETLY DO TO A RE-VALIDATION ROW, and each one leaves every row
  // present and every count matching. This is the table's whole risk: it is not the rows, it is what
  // they say.
  it('what a restriction reached — a judged row that came back saying nobody has looked', () => {
    const { broken } = planted((after) => {
      const judged = after.revalidations.find((r) => r.decidedBy !== null)
      if (judged !== undefined) {
        judged.state = 'needs_review'
        judged.decidedBy = null
        judged.decidedAt = null
        judged.note = null
      }
    })
    expect(broken).toEqual(['which work a restriction reached, and who re-checked it'])
  })

  it('what a restriction reached — a frozen path that came back emptied', () => {
    const { broken } = planted((after) => {
      const withAPath = after.revalidations.find((r) => r.reachedBy !== '[]')
      if (withAPath !== undefined) withAPath.reachedBy = '[]'
    })
    expect(broken).toEqual(['which work a restriction reached, and who re-checked it'])
  })

  it('what a restriction reached — a row naming a record that did not come back', () => {
    const { broken } = planted((after) => {
      const row = after.revalidations[0]
      if (row !== undefined) row.recordId = 'notarecord1'
    })
    expect(broken).toEqual(['which work a restriction reached, and who re-checked it'])
  })
})

// ================================================================ the machine columns

describe('the machine columns are asserted absent, not skipped', () => {
  it('fails when a restored ledger row comes back carrying a pgid', () => {
    const { broken, comparisons } = planted((after) => {
      const row = after.ledger[0]
      if (row !== undefined) row.pgid = 4242
    })
    expect(broken).toEqual(['machine state, asserted absent'])
    const machine = one(comparisons.filter((c) => c.name === 'machine state, asserted absent'), 'the machine comparison')
    expect(machine.differences.map((d) => d.where).join(' ')).toContain('pgid')
  })

  it('fails when a restored ledger row comes back carrying an os_started_at', () => {
    const { broken } = planted((after) => {
      const row = after.ledger[0]
      if (row !== undefined) row.osStartedAt = '2026-08-10 14:29:03'
    })
    expect(broken).toEqual(['machine state, asserted absent'])
  })

  it('fails when an AUTHORED ledger column is dropped, which is the other half of the same rule', () => {
    const { broken } = planted((after) => {
      const row = after.ledger.find((r) => r.releaseNote !== null)
      if (row !== undefined) row.releaseNote = null
    })
    expect(broken).toEqual(['machine state, asserted absent'])
  })

  it('is vacuous, not held, when nothing in the corpus ever carried a machine fact', () => {
    const before = clone(origin)
    for (const row of before.ledger) {
      row.pgid = null
      row.osStartedAt = null
    }
    const comparison = one(
      compareSnapshots(before, faithful).filter((c) => c.name === 'machine state, asserted absent'),
      'the machine comparison',
    )
    expect(comparison.differences).toEqual([])
    expect(comparison.verdict).toBe('vacuous')
  })
})

// ================================================================ the key store

/**
 * THE RESTORE PROOF ASKS WHETHER THE KEY STORE CAME BACK, and it asks it as a measurement.
 *
 * `held_keys` holds the SHA-256 of every key the office issued, and the owner ruled that a copy, a
 * backup and an export carry no key. An import carries none. Restoring a RAW BACKUP by file
 * copy is the other path, and it brings the whole file back — so the proof counts the table and
 * refuses a restored side that holds a row. The corpus mints one made-up hash on purpose, because an
 * assertion over an empty table is vacuous and never held.
 */
describe('the key store is counted, and asserted empty rather than skipped', () => {
  it('counts held_keys on the origin and requires it empty after a restore', () => {
    expect(Object.keys(origin.notCarried)).toContain('held_keys')
    expect(origin.notCarried['held_keys'], 'the corpus held no key hash, so this proves nothing').toBeGreaterThan(0)
    expect(faithful.notCarried['held_keys']).toBe(0)
    const comparison = one(
      compareSnapshots(origin, faithful).filter((c) => c.name === 'key hashes, asserted absent'),
      'the key-hash comparison',
    )
    expect(comparison.covers).toBeGreaterThan(0)
    expect(comparison.differences).toEqual([])
    expect(comparison.verdict).toBe('held')
    // AND IT SAYS SO IN ITS OUTPUT, because an absence nobody prints is an absence nobody checks.
    expect(comparison.question, 'the comparison does not name what it is about').toContain('key store')
    expect(comparison.question).toContain('EMPTY')
  })

  it('fails when a restored database brought a key hash back', () => {
    const { broken, comparisons } = planted((after) => {
      after.notCarried['held_keys'] = 1
    })
    expect(broken).toEqual(['key hashes, asserted absent'])
    const found = one(
      comparisons.filter((c) => c.name === 'key hashes, asserted absent'),
      'the key-hash comparison',
    )
    expect(found.differences.map((d) => d.where).join(' ')).toContain('held_keys')
  })
})

describe('visitor credentials keep their fields and lose their token hashes', () => {
  it('fails when a restored credential brings its token hash back', () => {
    const before = origin.visitorCredentials[0]!
    expect(before.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    const { broken, comparisons } = planted((after) => {
      after.visitorCredentials.find((row) => row.id === before.id)!.tokenHash = before.tokenHash
    })
    expect(broken).toEqual(['visitor credentials without token hashes'])
    const comparison = one(comparisons.filter((row) => row.name === 'visitor credentials without token hashes'), 'visitor credentials')
    expect(comparison.differences.map((difference) => difference.where)).toEqual([`visitor credential ${before.id} · tokenHash`])
  })

  it('compares every other visitor credential field', () => {
    const before = origin.visitorCredentials[0]!
    for (const field of Object.keys(before).filter((key) => key !== 'tokenHash')) {
      const { broken } = planted((after) => {
        const row = after.visitorCredentials.find((one) => one.id === before.id)! as unknown as Record<string, unknown>
        row[field] = row[field] === null ? 'changed' : `${String(row[field])} changed`
      })
      expect(broken, field).toEqual(['visitor credentials without token hashes'])
    }
  })
})

// ================================================================ vacuity

describe('a comparison that looked at nothing reads vacuous, never held', () => {
  it.each([
    ['soft-deleted records with their recoverable history', (s: Snapshot) => (s.deleted = [])],
    ['presentation intent', (s: Snapshot) => ((s.intent = []), (s.scopes = []))],
    ['reader anchors', (s: Snapshot) => (s.anchors = [])],
    ['machine state, asserted absent', (s: Snapshot) => (s.ledger = [])],
    ['Unicode and Chinese text', (s: Snapshot) => (s.text = [])],
  ])('%s over an empty corpus', (name, empty) => {
    const before = clone(origin)
    const after = clone(faithful)
    empty(before)
    empty(after)
    const comparison = one(compareSnapshots(before, after).filter((c) => c.name === name), `comparison ${name}`)
    expect(comparison.differences).toEqual([])
    expect(comparison.verdict).toBe('vacuous')
  })

  it('says which corpus need was not met, rather than only that it was vacuous', () => {
    const before = clone(origin)
    const after = clone(faithful)
    before.deleted = []
    after.deleted = []
    const comparison = one(
      compareSnapshots(before, after).filter((c) => c.name === 'soft-deleted records with their recoverable history'),
      'the soft-delete comparison',
    )
    const unmet = comparison.needs.filter((n) => !n.met)
    expect(unmet.length).toBeGreaterThan(0)
    expect(unmet.map((n) => n.what).join(' ')).toContain('soft-deleted')
  })
})

// ================================================================ declared losses stay narrow

describe('a declared loss accounts for what it names and cannot widen to cover anything else', () => {
  /*
   * TWO OF THESE ASSERTED THAT A REORDERING WAS ABSORBED, AND THEY ARE NOW THE OPPOSITE.
   *
   * A fourth declared loss used to say that the three unranked lists and the names inside a
   * `standing` sentence came back in a different order after a restore, because neither had an
   * order of its own — both inherited the database's rowids, and an import renumbers those. Its
   * own `repair` field named the fix and said it was in a file the check did not own. The fix is
   * made, in `src/shared/attention.ts`, so the loss no longer happens and the declaration is gone.
   *
   * With nothing left to absorb them, a reordering is now a real difference and must break the
   * comparison. That is a stronger property than the one these tests used to hold: it says two
   * databases with the same content answer this question in the same order, rather than saying the
   * check knows how to forgive them for not doing so.
   */
  it('does NOT absorb a list that came back reordered, or with a member changed', () => {
    const reordered = planted((after) => {
      attentionHere(after).noStateKeys = [...attentionHere(after).noStateKeys].reverse()
    })
    expect(reordered.broken).toEqual(['attention-relevant semantics'])

    const swapped = planted((after) => {
      const keys = [...attentionHere(after).noStateKeys]
      keys[0] = 'rec:something-that-was-never-there'
      attentionHere(after).noStateKeys = keys
    })
    expect(swapped.broken).toEqual(['attention-relevant semantics'])
  })

  it('does NOT absorb a `standing` sentence whose names were reordered, or one that lost a name', () => {
    const reordered = planted((after) => {
      reorderStandingSentence(after)
    })
    expect(reordered.broken).toEqual(['attention-relevant semantics'])

    const shortened = planted((after) => {
      for (const row of attentionHere(after).rows as { reason?: { factors?: { name: string; why: string }[] } }[]) {
        const factor = row.reason?.factors?.find((f) => f.name === 'standing' && f.why.includes('", "'))
        if (factor === undefined) continue
        factor.why = factor.why.replace(/, "[^"]*"/, '')
        return
      }
    })
    expect(shortened.broken).toEqual(['attention-relevant semantics'])
  })

  it('does NOT absorb a change row whose content moved, even though the log is where the loss lives', () => {
    const { broken } = planted((after) => {
      const row = after.changes[0]
      if (row !== undefined) row.at = '2026-01-01 00:00:00'
    })
    expect(broken).toContain('the change log itself')
  })

  it('reports a declared loss that did NOT happen, rather than staying quiet about it', () => {
    const before = clone(origin)
    // The derived layer was never built here, so "it comes back empty" cannot have happened.
    for (const table of Object.keys(before.derived)) before.derived[table] = 0
    const { losses } = compareAccountingForLosses(before, faithful)
    const derived = losses.filter((l) => l.what.includes('derived layer'))
    expect(one(derived, 'the derived-layer loss').happened).toBe(false)
  })
})

/** Swap the first two quoted names in the first `standing` sentence that has two. */
function reorderStandingSentence(after: Snapshot): void {
  for (const row of attentionHere(after).rows as { reason?: { factors?: { name: string; why: string }[] } }[]) {
    const factor = row.reason?.factors?.find((f) => f.name === 'standing')
    if (factor === undefined) continue
    const names = factor.why.match(/"[^"]*"/g)
    if (names === null || names.length < 2) continue
    const [first, second] = names
    if (first === undefined || second === undefined) continue
    factor.why = factor.why.replace(first, '\u0000').replace(second, first).replace('\u0000', second)
    return
  }
}

// ================================================================ the guards on the check itself

describe('the check refuses rather than answering a question it cannot answer', () => {
  it('refuses to compare two snapshots taken against different clocks', () => {
    const later = clone(faithful)
    later.now = NOW + 60_000
    expect(() => compareSnapshots(origin, later)).toThrow(/different clocks/)
  })

  it('refuses a database path outside the working directory it was given', () => {
    expect(() => assertScratch('/tmp/somewhere-else/panelx.db', '/tmp/mole-office-restore-x')).toThrow(
      /refuses to point at one it did not create/,
    )
    expect(() => assertScratch('/tmp/mole-office-restore-x/origin.db', '/tmp/mole-office-restore-x')).not.toThrow()
  })

  it('refuses a path that only looks like it is inside the working directory', () => {
    expect(() => assertScratch('/tmp/mole-office-restore-x-evil/origin.db', '/tmp/mole-office-restore-x')).toThrow()
  })

  /**
   * CONTAINMENT ON ITS OWN IS NOT A GUARD, and this is the test that says so.
   *
   * An agent asked to break the check found it in one line: EVERY ANCESTOR of a path contains it, so
   * `--scratch .` from the repository root satisfied "the database is inside the working directory"
   * and accepted `./data/panelx.db`. `--scratch /home` did the same for anything under /home. The
   * command reads as compliance, which is worse than no guard at all, because a person typing it
   * believes they have been careful.
   *
   * So the rule that matters is about the thing being protected: this script may not be pointed at
   * the database this checkout serves, however the point was made.
   */
  it('refuses this checkout\'s own database whatever working directory is claimed', () => {
    // THE PATH FROM THE DECLARATION, NEVER TYPED HERE. It used to be `../data/panelx.db`, which is
    // the declaration's default written a second time, so this failed in every checkout whose `.env`
    // names a database of its own — CLAUDE.md's worktree recipe. Problem `3X-GCt-0TXUG`.
    const live = canonicalDatabasePath()
    const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
    for (const claimed of [root, `${root}/data`, '/home', '/']) {
      expect(() => assertScratch(live, claimed), `--scratch ${claimed}`).toThrow(/live database/)
    }
    // And by a relative spelling, which is what a person actually types.
    expect(() => assertScratch(`./${relative(root, live)}`, root)).toThrow(/live database/)
    // The copy it asks for is made by the backup command, because a plain cp of a database in WAL
    // mode leaves out what is still in the -wal file. Problem `EeG8kifLtJNx`.
    expect(() => assertScratch(live, root)).toThrow(/npm run db:backup -- --to /)
  })

  it('refuses a working directory wide enough to contain this checkout', () => {
    // The other half of the same mistake: a `--scratch` that contains the repository accepts every
    // database in it, including one a later change adds beside the current one.
    const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
    expect(() => assertScratch(`${dirname(root)}/anything.db`, dirname(root))).toThrow(/contains this checkout/)
    expect(() => assertScratch(`${root}/scratch.db`, root)).toThrow(/contains this checkout/)
    // A directory beside the checkout is fine — it contains no database of this repository's.
    expect(() => assertScratch('/tmp/px/origin.db', '/tmp/px')).not.toThrow()
  })

  it('refuses an option it does not know, rather than ignoring it', () => {
    expect(() => readOptions(['--wipe'])).toThrow(/I do not know the option --wipe/)
    expect(() => readOptions(['--work'])).toThrow(/needs a value/)
  })

  it('reads the options it does know', () => {
    const parsed = readOptions(['--work', '/tmp/x', '--keep', '--json'])
    expect('help' in parsed).toBe(false)
    if ('help' in parsed) return
    expect(parsed.work).toBe('/tmp/x')
    expect(parsed.keep).toBe(true)
    expect(parsed.json).toBe(true)
  })

  it('compares objects by structure and arrays by order, with no normalising of any value', () => {
    expect(same({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
    expect(same([1, 2], [2, 1])).toBe(false)
    // A stamp is a local wall-clock string and this product lost two months to reading one as UTC.
    // Nothing here may treat these two as the same value.
    expect(same('2026-08-10 12:00:00', '2026-08-10T12:00:00Z')).toBe(false)
    expect(same(0, null)).toBe(false)
    expect(same(null, undefined)).toBe(false)
  })
})

// ================================================================ nothing here touched the real db

describe('this test never opened the real database', () => {
  it('is pointed at a throwaway file', () => {
    expect(db.file).toContain('mole-office-test-')
    expect(db.file).not.toContain('/data/panelx.db')
    expect(process.env.MOLE_OFFICE_DB).toBe(db.file)
  })

  it('declares a loss for every part of the format that says it drops something', () => {
    // Not a restatement of the list: it asserts each declaration carries the three sentences a
    // reader needs, so a loss cannot be added as a name with no reason and no repair.
    expect(DECLARED_LOSSES.length).toBeGreaterThan(0)
    for (const loss of DECLARED_LOSSES) {
      expect(loss.what.length, loss.what).toBeGreaterThan(20)
      expect(loss.why.length, loss.what).toBeGreaterThan(60)
      expect(loss.repair.length, loss.what).toBeGreaterThan(20)
    }
  })
})

for (const choice of ['runtimeSettings','officeRestartGrants'] as const) it(`reports a lost ${choice} row after a restore`,()=>{
  expect(origin[choice].length).toBeGreaterThan(0)
  const {broken}=planted(after=>{after[choice].splice(0,1)})
  expect(broken).toEqual(['pixel appearances and office scene'])
})

it('carries a saved gate choice end into the restore snapshot and notices when that end is lost', async () => {
  const name = 'MOLE_OFFICE_CONFLICT_RESOLVING'
  const until = '2099-10-21 07:00:00'
  db.client.sqlite.prepare('INSERT INTO runtime_settings(name,value,until) VALUES (?,?,?)').run(name, '1', until)
  try {
    const before = await buildSnapshot(NOW)
    expect(before.runtimeSettings.find(row => row.name === name)).toMatchObject({value: '1', until})
    const after = clone(before)
    Object.assign(after.runtimeSettings.find(row => row.name === name)!, {until: null})
    const comparisons = compareSnapshots(before, after)
    const choice = comparisons.find(one => one.name === 'pixel appearances and office scene')
    expect(choice).toMatchObject({verdict: 'differs'})
    expect(choice!.differences.some(one => one.where.includes('office runtime choices'))).toBe(true)
  } finally { db.client.sqlite.prepare('DELETE FROM runtime_settings WHERE name = ?').run(name) }
})

// ================================================================ a record and its history

// Four comparisons about how a record got here and what its revisions and markers still say, each
// broken by the one quiet change its question names rather than by a row going missing.
describe("each comparison of a record's history notices a change planted in it", () => {
  it('how each record got here — a record nobody said anything about that came back authored', () => {
    const { broken } = planted((after) => {
      const row = after.origins.find((r) => r.origin === null)
      expect(row, 'the corpus holds no record with no origin recorded, so this test proves nothing').toBeDefined()
      if (row !== undefined) row.origin = 'authored'
    })
    expect(broken).toEqual(['how each record got here'])
  })

  it('the revision ledger — a revision taken at a soft delete that came back live', () => {
    const { broken } = planted((after) => {
      const row = after.revisions.find((r) => r.deletedAt !== null)
      expect(row, 'the corpus holds no revision taken at a soft delete, so this test proves nothing').toBeDefined()
      if (row !== undefined) row.deletedAt = null
    })
    expect(broken).toEqual(['the revision ledger'])
  })

  it('the revision ledger — a revision that came back saying its chapters were somewhere else', () => {
    // The cut's chapter feature stores a run's chapters once and leaves `parts` on the later revision
    // naming where they are. The corpus holds no such row yet, so this plants the column on a revision
    // that had none: the first half of the proof is the every-column test, which fails when `parts`
    // is absent from the snapshot; this half fails when the comparison ignores the column.
    const { broken } = planted((after) => {
      const row = after.revisions.find((r) => r.parts === null)
      expect(row, 'every revision in the corpus already has parts, so this test proves nothing').toBeDefined()
      if (row !== undefined) row.parts = { 'extra.roundChapters': 1 }
    })
    expect(broken).toEqual(['the revision ledger'])
  })

  it('the markers on comments whose words had already gone out — a marker whose moment came back changed', () => {
    const { broken } = planted((after) => {
      const row = after.annotationWordsFixed.find((r) => r.annotationId !== '')
      expect(row, 'the corpus holds no words-fixed marker, so this test proves nothing').toBeDefined()
      if (row !== undefined) row.fixedAt = '2000-01-01 00:00:00'
    })
    expect(broken).toEqual(['the markers on comments whose words had already gone out'])
  })

  it('the marker saying the reading-measure words were renamed — the one row whose sentence came back changed', () => {
    const { broken } = planted((after) => {
      const row = after.measureWordsRenamed.find((r) => r['only_row'] === 1)
      expect(row, 'the corpus holds no measure-words marker row, so this test proves nothing').toBeDefined()
      if (row !== undefined) row['because'] = String(row['because']) + ' (changed)'
    })
    expect(broken).toEqual(['the marker saying the reading-measure words were renamed'])
  })
})

// Each of these breaks one thing its comparison is about, and expects that comparison, and no other, to fail.
describe('each comparison of code, scans, time and reviews notices a change planted in it', () => {
  it('what each scan saw about each file — a content hash emptied on a row that was not a removal', () => {
    const { broken } = planted((after) => {
      const row = after.fileObservations.find((r) => r.hash !== null && r.change !== 'removed')
      expect(row, 'the corpus holds no file observation with a content hash, so this test proves nothing').toBeDefined()
      if (row !== undefined) row.hash = null
    })
    expect(broken).toEqual(['what each scan saw about each file'])
  })

  it('the implementation map, and what a guess became — an acceptance that came back with nobody who accepted it', () => {
    const { broken } = planted((after) => {
      const row = after.implementationMap.find((r) => r.acceptedBy !== null)
      expect(row, 'the corpus holds no accepted implementation row, so this test proves nothing').toBeDefined()
      if (row !== undefined) row.acceptedBy = null
    })
    expect(broken).toEqual(['the implementation map, and what a guess became'])
  })

  it('what somebody wrote about time — a period filled in where the reading was nothing', () => {
    const { broken } = planted((after) => {
      const row = after.planningIntents.find((r) => r.period === null && r.state === 'kept')
      expect(row, 'the corpus holds no kept intent with a null period, so this test proves nothing').toBeDefined()
      if (row !== undefined) row.period = '2026-W36'
    })
    expect(broken).toEqual(['what somebody wrote about time'])
  })

  it('a review, and what was in it when collecting finished — a review still collecting that came back with an empty frozen list', () => {
    const { broken } = planted((after) => {
      const row = after.reviews.find((r) => r.frozen === null)
      expect(row, 'the corpus holds no review still collecting, so this test proves nothing').toBeDefined()
      if (row !== undefined) row.frozen = '[]'
    })
    expect(broken).toEqual(['a review, and what was in it when collecting finished'])
  })
})

// What the person answered, what a run did, what a test file said, and whose words a handover holds.
describe('each comparison of presses, tool uses, test results and handovers notices a change planted in it', () => {
  it('requests for one press — an answered request that came back unanswered', () => {
    const { broken } = planted((after) => {
      const row = after.onePressRequests.find((r) => r.answeredAt !== null)
      expect(row, 'the corpus holds no answered request, so this test proves nothing').toBeDefined()
      if (row !== undefined) row.answeredAt = null
    })
    expect(broken).toEqual(['requests for one press'])
  })

  it('tool uses — a use migration 0231 moved that came back unmoved', () => {
    const { broken } = planted((after) => {
      const row = after.toolUses.find((r) => r.movedAt !== null)
      expect(row, 'the corpus holds no use moved out of a run\'s record, so this test proves nothing').toBeDefined()
      if (row !== undefined) row.movedAt = null
    })
    expect(broken).toEqual(['tool uses'])
  })

  it('test file results — a passed result that came back as failed', () => {
    const { broken } = planted((after) => {
      const row = after.testFileRuns.find((r) => r.result === 'passed')
      expect(row, 'the corpus holds no passed test file result, so this test proves nothing').toBeDefined()
      if (row !== undefined) row.result = 'failed'
    })
    expect(broken).toEqual(['test file results'])
  })

  it('handovers — a handover the person wrote that came back written by an agent', () => {
    const { broken } = planted((after) => {
      const row = after.handovers.find((r) => r.writtenByKind === 'person')
      expect(row, 'the corpus holds no handover the person wrote, so this test proves nothing').toBeDefined()
      if (row !== undefined) row.writtenByKind = 'agent'
    })
    expect(broken).toEqual(['handovers'])
  })
})

// EACH TEST PLANTS THE ONE CHANGE ITS COMPARISON'S OWN SENTENCE NAMES, with every row and count left in place.
describe('each comparison of signing, readiness and quick inputs notices a change planted in it', () => {
  it('readiness checklists and their signatures — a signature its signer took back came back still standing', () => {
    const { broken } = planted((after) => {
      const row = after.readinessSignatures.find((row) => row.withdrawnAt !== null)
      expect(row, 'the corpus holds no signature its signer took back, so this test proves nothing').toBeDefined()
      if (row !== undefined) row.withdrawnAt = null
    })
    expect(broken).toEqual(['readiness checklists and their signatures'])
  })

  it('signing packages and their items — an item that was done came back with no time it was done', () => {
    const { broken } = planted((after) => {
      const row = after.signingPackageItems.find((row) => row.doneAt !== null)
      expect(row, 'the corpus holds no item that was done, so this test proves nothing').toBeDefined()
      if (row !== undefined) row.doneAt = null
    })
    expect(broken).toEqual(['signing packages and their items'])
  })

  it('quick inputs: the owner\'s list and every ask — a list the person cleared came back holding the list a fresh office starts with', () => {
    const { broken } = planted((after) => {
      const row = after.quickInputList.find((row) => row['inputs'] === null)
      expect(row, 'the corpus holds no quick-input list the person cleared, so this test proves nothing').toBeDefined()
      if (row !== undefined) row['inputs'] = '["/context","/compact"]'
    })
    expect(broken).toEqual(['quick inputs: the owner\'s list and every ask'])
  })
})

// Every other comparison that reads a link row reads it in full through `links and backlinks`, so only a workspace field can be seen alone.
describe('each comparison named only with another notices a change that only it sees', () => {
  it('project boundaries — a project title that came back changed', () => {
    const { broken } = planted((after) => {
      const project = after.workspaces.find((w) => w.title !== '')
      expect(project, 'the corpus holds no project with a title, so this test proves nothing').toBeDefined()
      if (project !== undefined) project.title = `${project.title} (renamed)`
    })
    expect(broken).toEqual(['project boundaries'])
  })
})
