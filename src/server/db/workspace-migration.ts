// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Establish the project boundaries this installation holds, and put every row behind the one it
 * belongs to.
 *
 * ---------------------------------------------------------------------------------------
 * DECISION 13: WHAT THIS WRITES, DECLARED
 * ---------------------------------------------------------------------------------------
 *
 *   INSERTS into `workspaces`   — the project boundaries, from the measurement, PLUS the empty
 *                                 `general` project described under THE CATCH-ALL PAIR below.
 *   `records.workspace_id`      — from the measurement the caller hands in, matched on id, kind and
 *                                 title. This repository hands none in; see below.
 *   `changes.workspace_id`      — COPIED from the record each change is about. Only where NULL,
 *                                 and migration 0006 is what made it NULL on every row.
 *   `links.workspace_id`        — COPIED from the two ends, only where they agree with each other.
 *   `presentation_intent.workspace_id`, `session_resources.workspace_id` — copied from the record
 *                                 the row is about.
 *   INSERTS into `reader_anchors` — one copy of the existing anchor per established workspace.
 *
 * It reads no other column to decide anything, changes no other column, deletes no row and rebuilds
 * no table. Four of those six columns are copies of a value stored on another row, which is what
 * makes them not a judgement: the migration is not deciding which project a change happened in, it
 * is reading it off the record the change is about.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE ASSIGNMENTS COME FROM, AND WHY THERE IS NO RULE HERE
 * ---------------------------------------------------------------------------------------
 *
 * FROM A MEASUREMENT THE CALLER HANDS IN, AND NOTHING IN THIS REPOSITORY HANDS ONE IN. It used to
 * come from `MEASURED_WORKSPACES` in ./workspace-inventory.ts: 389 lines, one per record of the
 * corpus that existed when the boundary arrived, from four lines of evidence that had to agree.
 * That table was the owner's own record ids and record titles written into the product's source, so
 * it left this repository on 5 September 2026 and is kept outside it.
 *
 * IT LEFT BECAUSE THE ROWS IT DESCRIBES ALREADY CARRY THE FACT. The measurement was applied on
 * 12 August 2026 and `records.workspace_id` has held the answer ever since; the archive carries the
 * column, so a restored database comes back placed. Measured on a backup of the owner's live
 * database on 5 September 2026: all 389 measured rows still present, every one of them already in
 * the project the measurement names, and not one of them left for this migration to move.
 *
 * SO THE DEFAULT MEASUREMENT IS THE EMPTY ONE, and every record is then reported as unmeasured and
 * left where it is — the honest reading of a database nobody has measured. The rest of this file
 * still runs on any database: the `default` project is declared, change rows and links are stamped
 * from the records they name, and anchors are copied. A caller who holds the old measurement, which
 * is in the owner's private data repository under `data/inventories/`, can hand it in and get
 * exactly the behaviour that shipped before. The tests hand in a made-up measurement, which is how
 * the matching, the refusals and the counting stay proved.
 *
 * ONE CONSEQUENCE WORTH SAYING OUT LOUD: with no measurement, no project is established except
 * `default`. A workspace is only established when the measurement moves a record into it, so a
 * fresh database now comes up holding one project called Default and nothing else.
 *
 * NOTHING IN THIS FILE INFERS A WORKSPACE. Not from a title, not from a kind, not from `origin` —
 * `origin` is PROVENANCE and a workspace is PROJECT IDENTITY, and neither may stand in for the
 * other. A record this file cannot find in the measurement STAYS WHERE IT IS and is counted,
 * because "nobody has said which project this belongs to" is a real answer and it is the true one.
 *
 * A DATABASE THAT IS NOT THIS ONE THEREFORE GETS ONE WORKSPACE AND NO PROJECTS. A colleague's
 * Mole Office, a database from `npm run db:reset`, or the empty database a test builds holds different
 * rows with different ids; the measurement is not about them. They get the `default` workspace row
 * — because every row in them already says `default` and something has to declare that it exists —
 * and nothing else. Every other project is established only when the measurement handed in moves
 * rows into it, and this repository hands no measurement in, so it establishes nothing but
 * `default`.
 *
 * ---------------------------------------------------------------------------------------
 * THE CATCH-ALL PAIR: `unassigned` KEEPS ITS RECORDS AND `general` ARRIVES EMPTY
 * ---------------------------------------------------------------------------------------
 *
 * The owner settled this on 16 August 2026, in Mole Office decision `AtiSHfG00BVV`. There are two
 * catch-all projects and they mean different things:
 *
 *   `unassigned` — Mole Office knows the item exists and its proper home has not been decided.
 *   `general`    — work that is deliberately miscellaneous and does not deserve its own project.
 *
 * So this migration ESTABLISHES `general` AS A NEW, EMPTY PROJECT AND MOVES NOTHING INTO IT. The
 * records already in `unassigned` were put there because the measurement could not place them,
 * which is the definition of `unassigned` and not the definition of `general`. Moving them would
 * make the first thing anybody saw in General the opposite of what General means. Somebody may
 * file any of them into `general` later, one at a time, with POST /api/records/:id/workspace.
 *
 * IT IS ESTABLISHED ONLY WHERE `unassigned` IS. The word "beside" in the decision is
 * doing real work: General is the second half of a pair, and a database with no Unassigned project
 * is not the corpus that decision is about. That is the same rule the section above states for
 * every project a measurement names — a project nothing puts anything into is not established on
 * somebody else's Mole Office. A fresh database therefore gets `default` and nothing else, exactly as before,
 * and anybody who wants a General project there makes one with POST /api/workspaces.
 *
 * THE TITLE `unassigned` ALREADY STORES IS THE TITLE THE SCREEN NOW PRINTS. Nothing here rewrites
 * it. The browser used to replace the stored word with "Not in a project" at the last moment, so
 * one project had one name on the server and another on the screen; that renaming table is deleted
 * in the same change, in src/web/lib/projects.ts, and the name now comes from this registry alone.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE DEFAULT WORKSPACE IS NOT RENAMED "Mole Office"
 * ---------------------------------------------------------------------------------------
 *
 * Because a row left in it is a row nobody assigned. The measurement covers the 389 records that
 * existed when it was taken; anything written between then and the moment this runs is not in it
 * and is not moved. If `default` were titled Mole Office, every one of those rows would read as Mole Office
 * work on the strength of a SQL column default from before projects existed. So the measured Mole Office
 * records move OUT into `panelx`, exactly as every other measured record moves into whichever
 * project the measurement names for it, and what stays behind stays unclaimed and is reported by
 * number.
 *
 * The visible cost, stated rather than left to be discovered: a caller that names no workspace is
 * answered from `default`, so immediately after this migration the browser — which sends no
 * workspace header — shows the handful of unassigned rows and not the corpus. Nothing is lost and
 * `GET /api/workspaces` says where everything went, but the reading surface has to learn to choose
 * a workspace before this migration is run on the database somebody uses.
 *
 * ---------------------------------------------------------------------------------------
 * SAFE TO RUN TWICE
 * ---------------------------------------------------------------------------------------
 *
 * Every write is idempotent by construction rather than by a flag: a record is moved only when its
 * stored workspace differs from its measured one, a change row is stamped only where it is NULL, a
 * link is refiled only when it disagrees with its ends, and a workspace row is inserted only when
 * it is absent. The second run finds nothing to do and reports `alreadyDone`. That is also what
 * makes it safe after a restore — the archive carries every workspace_id, so the restored rows
 * arrive already assigned and this changes nothing.
 *
 * ONE TRANSACTION. A refusal leaves the database exactly as it was; nothing half-applies.
 */

import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import { nowStamp } from '@shared/time.ts'
import { DEFAULT_WORKSPACE, THE_REQUEST_THAT_MOVES_A_RECORD, UNASSIGNED_WORKSPACE } from '@shared/workspaces.ts'

/**
 * One row of a corpus as somebody measured it, with everything needed to recognise it again.
 *
 * Declared here because this is the only file that reads one. The 389-row measurement this shape
 * was written for is in the owner's private data repository under `data/inventories/`; see the
 * header for why it is not here.
 */
export interface MeasuredWorkspace {
  /** The record's id, which is what the assignment is matched on. */
  id: string
  /** Where the evidence put it: a workspace id, or `unassigned`. */
  workspace: string
  /**
   * Which lines of evidence spoke, joined with `+`. `nothing` when none did, `conflict` when two
   * disagreed. Carried so the strength of each assignment is readable from the row.
   */
  by: string
  /** The kind it had when measured. Checked, not used to decide anything. */
  kind: string
  /** The title it had when measured. Checked, not used to decide anything. */
  title: string
}

/**
 * What this repository ships: nothing measured.
 *
 * Not a placeholder for a measurement that is coming. It is the whole truth about a database this
 * code has never seen, and it is also true of the owner's, whose rows are already behind the
 * project boundary the old measurement put them behind.
 */
const NOTHING_MEASURED: readonly MeasuredWorkspace[] = []

/**
 * THE LINKS WHOSE TWO RECORDS ARE IN DIFFERENT PROJECTS, as the end of a query. The migration counts them
 * with it, and its note quotes it so a reader can list them (problem P1-fTNDwwF2H).
 */
const THE_LINKS_ACROSS_A_PROJECT_BOUNDARY =
  'FROM links l JOIN records a ON a.id = l.from_id JOIN records b ON b.id = l.to_id WHERE a.workspace_id <> b.workspace_id'

/** Something the migration would not do, and why. Every one is printed by the command. */
export interface WorkspaceNote {
  kind:
    | 'not_measured'
    | 'title_changed'
    | 'kind_changed'
    | 'moved_since'
    | 'cross_workspace_link'
    | 'change_without_record'
    | 'intent_unscopable'
    | 'resource_without_session'
    | 'layout_left'
  detail: string
}

/**
 * The project for work that is deliberately miscellaneous, from decision
 * `AtiSHfG00BVV`.
 *
 * DECLARED HERE AND NOWHERE ELSE, unlike `UNASSIGNED_WORKSPACE`, which src/shared/workspaces.ts
 * exports because two files used to need to recognise that one id. `general` is an ordinary
 * project: nothing in the product treats it specially, no screen names it in code, and its title
 * reaches a reader from the registry like every other project's. A shared constant for it would be
 * an id nobody compares against.
 */
const GENERAL_WORKSPACE = 'general'

/** What one run did. Every number here is counted from what was written, not estimated. */
export interface WorkspaceMigrationReport {
  /** True when migration 0006 has not been applied, so there is no `workspaces` table to write. */
  tableMissing: boolean
  /** True when there was nothing left to do. */
  alreadyDone: boolean
  /** Workspace ids this run established. Empty on a second run. */
  established: string[]
  /** Records moved into each workspace by this run, by workspace id. */
  moved: Record<string, number>
  /** Records the measurement covers that were already where it says. */
  alreadyPlaced: number
  /** Records in the table the measurement says nothing about. They were not touched. */
  notMeasured: number
  /** Change rows stamped with the workspace of the record they are about. */
  changesStamped: number
  /** Change rows left NULL because no record answers to their `record_id`. */
  changesWithoutRecord: number
  /** Links refiled into the workspace both their ends agree on. */
  linksRefiled: number
  /** Links whose two ends are in different workspaces. Left alone, and every one is a note. */
  crossWorkspaceLinks: number
  /** Reader anchors copied into a newly established workspace. */
  anchorsCopied: number
  presentationRefiled: number
  resourcesRefiled: number
  /**
   * The two catch-all projects and how many live records each one holds, counted AFTER this run.
   *
   * Null on a database that has no `unassigned` project, which is every database this migration's
   * measurement is not about. Where it is not null it is the proof of the decision: the
   * records stayed in Unassigned and General arrived holding none of them.
   */
  catchAll: { unassignedRecords: number; generalRecords: number } | null
  notes: WorkspaceNote[]
}

/** What a project needs before a record can be filed behind it: an id, a name and a sentence. */
export interface ProjectSpec {
  title: string
  note: string
}

/**
 * The projects this product knows the names of, and the only ones it can establish on its own.
 *
 * A measurement may name a project that is not here — the one this migration was written for named
 * two — and then the caller must hand its declaration in beside the measurement. `plan` refuses
 * rather than moving a record behind a project boundary that does not exist, because nothing in the
 * schema declares that foreign key: the move would be accepted and the product would then refuse to
 * serve those records, with nothing saying why.
 */
const ESTABLISHED: Record<string, ProjectSpec> = {
  panelx: {
    title: 'Mole Office',
    // THE TITLE CHANGED WITH THE RENAME AND THE ID DID NOT, AND THAT IS DELIBERATE.
    //
    // A person reads the title. A machine reads the id, and 23,441 rows across ten tables carry
    // `workspace_id = 'panelx'` — every record, link, change, revision and api_call this project
    // has ever written about itself. Changing it is a migration that updates one primary key and
    // 23,440 referencing rows in one transaction, with no declared foreign keys in the schema to
    // catch a missed table. This campaign's one announced migration window is spent on the
    // lifecycle tables, so the id keeps the name it was established under on 12 August 2026.
    //
    // It is not a stale reference. It is a stored identifier, visible only in Developer mode and
    // in the workspace header an agent sends, and the note below is where a developer looking at
    // it will read why. If it is ever to be migrated, that needs its own announced window, its
    // own backup, its own row counts before and after, and its own commit.
    note:
      "This product's own development record: the problems, claims, decisions and sessions of building Mole Office. " +
      'Established by src/server/db/workspace-migration.ts from the measurement it was handed. ' +
      "Its id is `panelx` because that is the name this product was established under on 12 August 2026, and " +
      '23,441 rows point at it. The product was renamed to Mole Office on 28 August 2026 and the id was ' +
      'deliberately left alone: it is a historical identifier, not a name anybody reads.',
  },
  [UNASSIGNED_WORKSPACE]: {
    title: 'Unassigned',
    note:
      'Records no measurement could place: nothing said which project they belong to, or two lines of evidence ' +
      'said different things. They are here rather than in a project because assigning them would have been a ' +
      `guess. Move one with ${THE_REQUEST_THAT_MOVES_A_RECORD} {"to":"<project id>"} once somebody knows.`,
  },
  [GENERAL_WORKSPACE]: {
    title: 'General',
    note:
      'Work that is deliberately miscellaneous: small, real and not worth a project of its own. It is different ' +
      'from Unassigned, which holds records whose proper home nobody has decided yet. This project starts empty ' +
      `and stays empty until somebody files something into it on purpose, with ${THE_REQUEST_THAT_MOVES_A_RECORD} or the ` +
      'move panel on a record. Established beside Unassigned on 16 August 2026.',
  },
}

/** The default workspace row, which every database has because every row in it already says so. */
const DEFAULT_ROW = {
  title: 'Default',
  note:
    'The workspace every row was in before Mole Office had project boundaries, and the one a request that names none ' +
    'is answered from. It is NOT a project: a record still in here after the corpus migration is a record nobody ' +
    'has assigned to one.',
}

interface RecordRow {
  id: string
  kind: string
  title: string
  workspace_id: string
}

/**
 * Work out everything this run would write, without writing any of it.
 *
 * Separate from applying it so the whole plan — including every refusal — is decided before the
 * first write, and so a test can read the plan.
 */
function plan(
  sqlite: Database.Database,
  measurement: readonly MeasuredWorkspace[],
  extraProjects: Readonly<Record<string, ProjectSpec>>,
) {
  const notes: WorkspaceNote[] = []
  const measured = new Map(measurement.map((m) => [m.id, m]))
  const declared: Record<string, ProjectSpec> = { ...ESTABLISHED, ...extraProjects }

  // Asked of the database rather than assumed from the migration folder, because this file has no
  // way to know which migrations the caller pointed drizzle at.
  const tableMissing =
    (
      sqlite
        .prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'workspaces'")
        .get() as { n: number }
    ).n === 0

  // Every record, including the soft-deleted ones: which project a record belongs to does not
  // change when somebody deletes it, and a restored record that came back unassigned while its
  // neighbours were placed would read as a row somebody had judged differently.
  const rows = sqlite.prepare('SELECT id, kind, title, workspace_id FROM records').all() as RecordRow[]

  const moves: { id: string; to: string }[] = []
  let alreadyPlaced = 0
  let notMeasured = 0
  for (const row of rows) {
    const known = measured.get(row.id)
    if (known === undefined) {
      notMeasured += 1
      continue
    }
    if (known.title !== row.title) {
      notes.push({
        kind: 'title_changed',
        detail:
          `the record ${row.id} was measured as "${known.title}" and is now called "${row.title}". The ` +
          `measurement is a fact about a row and this is not demonstrably that row, so it is NOT moved. It ` +
          `stays in "${row.workspace_id}".`,
      })
      continue
    }
    if (known.kind !== row.kind) {
      notes.push({
        kind: 'kind_changed',
        detail:
          `the record ${row.id} ("${row.title}") was measured as a ${known.kind} and is now a ${row.kind}. ` +
          `That is not the row that was measured, so it is NOT moved.`,
      })
      continue
    }
    if (row.workspace_id === known.workspace) {
      alreadyPlaced += 1
      continue
    }
    if (row.workspace_id !== DEFAULT_WORKSPACE) {
      // Somebody has already put this record somewhere on purpose — the measurement is older than
      // that decision and must not overrule it.
      notes.push({
        kind: 'moved_since',
        detail:
          `"${row.title}" was measured as ${known.workspace} work and is filed in "${row.workspace_id}", which ` +
          `is neither that nor the default. Somebody moved it since the measurement was taken, so it is left ` +
          `where they put it.`,
      })
      continue
    }
    moves.push({ id: row.id, to: known.workspace })
  }

  if (notMeasured > 0) {
    notes.push({
      kind: 'not_measured',
      detail:
        `${notMeasured} record${notMeasured === 1 ? ' is' : 's are'} not in the measurement, so nothing here ` +
        `knows which project ${notMeasured === 1 ? 'it belongs' : 'they belong'} to. ` +
        `${notMeasured === 1 ? 'It was' : 'They were'} not moved and ${notMeasured === 1 ? 'is' : 'are'} still ` +
        `in whichever workspace ${notMeasured === 1 ? 'it was' : 'they were'} written into. Either ` +
        `${notMeasured === 1 ? 'it was' : 'they were'} written after the measurement was taken, or this is a ` +
        `different database.`,
    })
  }

  // The workspaces this plan actually needs. A workspace with nothing going into it is not
  // established: an empty "Greenhouse" on somebody else's Mole Office would be a project they do not have.
  const needed = new Set(moves.map((m) => m.to))

  // NOTHING IS ASKED OF A TABLE THAT IS NOT THERE. `tableMissing` means migration 0006 has not been
  // applied yet, and `migrateWorkspaces` returns without writing in that case — but this planning
  // runs first, so a query here would throw "no such table: workspaces" out of a command whose
  // whole job is to be safe to run against any database. That is not hypothetical: this file used
  // to reach the table only from inside a filter over a set that is empty on such a database, so
  // the query never ran, and a straight-line query added beside it took down every test that starts
  // at migration 0000.
  const alreadyThere = (id: string): boolean =>
    !tableMissing &&
    (sqlite.prepare('SELECT count(*) AS n FROM workspaces WHERE id = ?').get(id) as { n: number }).n > 0

  // THE ONE EMPTY PROJECT THIS MIGRATION ESTABLISHES, and the one exception to the rule above. See
  // THE CATCH-ALL PAIR in the header: `general` is the second half of a pair, so it is established
  // wherever `unassigned` is — whether this run is establishing that one or found it already here —
  // and on no other database. Nothing is ever moved into it.
  const catchAllHere = !tableMissing && (needed.has(UNASSIGNED_WORKSPACE) || alreadyThere(UNASSIGNED_WORKSPACE))
  if (catchAllHere) needed.add(GENERAL_WORKSPACE)

  // A PROJECT THE MEASUREMENT NAMES THAT NOBODY DECLARED STOPS THE MIGRATION HERE, before a single
  // row moves. The alternative is what this code used to do: skip it silently, then file records
  // behind a project boundary with no row in `workspaces`. No foreign key would catch that, and the
  // symptom would be the server refusing to serve those records with nothing saying why.
  if (!tableMissing) {
    const undeclared = [...needed].filter((id) => declared[id] === undefined && !alreadyThere(id))
    if (undeclared.length > 0) {
      throw new Error(
        `The measurement moves records into ${undeclared.length === 1 ? 'a project' : 'projects'} this database ` +
          `does not have and nobody declared: ${undeclared.join(', ')}. Hand the declaration in beside the ` +
          `measurement — each project needs a title and a note saying what it is — or take those rows out of ` +
          `the measurement. Nothing has been written.`,
      )
    }
  }

  const established = tableMissing
    ? []
    : [...needed].filter((id) => declared[id] !== undefined && !alreadyThere(id))

  return { tableMissing, moves, alreadyPlaced, notMeasured, established, catchAllHere, declared, notes }
}

/**
 * Establish the workspaces and refile everything that names a record.
 *
 * NO `dryRun`, unlike the origin migration. Half of what this reports — the crossing links, the
 * change rows with no record, the layouts left behind — is counted from the same statements that
 * write, so a dry run would have to be a second implementation of the plan, and a second
 * implementation that could disagree with the first is worse than not having one. An operator who
 * wants to see it first runs it against `cp data/panelx.db /tmp/copy.db`, which is what the header
 * of db/migrate.ts already tells them to do.
 */
export function migrateWorkspaces(
  sqlite: Database.Database,
  opts: { measurement?: readonly MeasuredWorkspace[]; projects?: Readonly<Record<string, ProjectSpec>> } = {},
): WorkspaceMigrationReport {
  const { tableMissing, moves, alreadyPlaced, notMeasured, established, catchAllHere, declared, notes } = plan(
    sqlite,
    opts.measurement ?? NOTHING_MEASURED,
    opts.projects ?? {},
  )

  const report: WorkspaceMigrationReport = {
    tableMissing,
    alreadyDone: false,
    established,
    moved: {},
    alreadyPlaced,
    notMeasured,
    changesStamped: 0,
    changesWithoutRecord: 0,
    linksRefiled: 0,
    crossWorkspaceLinks: 0,
    anchorsCopied: 0,
    presentationRefiled: 0,
    resourcesRefiled: 0,
    catchAll: null,
    notes,
  }
  if (tableMissing) return report

  // Counted before anything is written, so the report describes what this run found rather than
  // what it left behind.
  report.changesWithoutRecord = (
    sqlite
      .prepare(
        'SELECT count(*) AS n FROM changes c LEFT JOIN records r ON r.id = c.record_id ' +
          'WHERE c.workspace_id IS NULL AND r.id IS NULL',
      )
      .get() as { n: number }
  ).n
  if (report.changesWithoutRecord > 0) {
    notes.push({
      kind: 'change_without_record',
      detail:
        `${report.changesWithoutRecord} change rows name a record that is not in the table, so no workspace can ` +
        `be read off it. They keep a NULL workspace, which is what NULL means in that column: nobody can say. ` +
        `They are excluded from every per-project reading of the log and counted here so that exclusion is not ` +
        `silent.`,
    })
  }

  const stamp = nowStamp()
  const apply = sqlite.transaction(() => {
    // 1. THE DEFAULT WORKSPACE, ALWAYS. Every row of every Mole Office database already says `default`,
    //    and `requireWorkspace` refuses a workspace that is not declared — so a database whose one
    //    workspace was undeclared would refuse every write it has ever accepted.
    sqlite
      .prepare(
        'INSERT INTO workspaces (id, title, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ' +
          'ON CONFLICT(id) DO NOTHING',
      )
      .run(DEFAULT_WORKSPACE, DEFAULT_ROW.title, DEFAULT_ROW.note, stamp, stamp)

    // 2. THE PROJECTS THE MEASUREMENT ESTABLISHES.
    for (const id of established) {
      const spec = declared[id]
      if (spec === undefined) continue
      sqlite
        .prepare(
          'INSERT INTO workspaces (id, title, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ' +
            'ON CONFLICT(id) DO NOTHING',
        )
        .run(id, spec.title, spec.note, stamp, stamp)
    }

    // 3. THE RECORDS. `AND workspace_id = ?` as well as the id, so a plan built against a row that
    //    somebody moved in between cannot overwrite the newer value.
    //
    //    NO REVISION IS WRITTEN HERE, for the reason ./blocked-by-migration.ts gives at its own
    //    write: `planStaleLedgers` in ./revision-backfill.ts runs last in the same command and
    //    catches up every record whose ledger stopped describing it. `workspace_id` is not one of
    //    the five things `versionOf` hashes, so moving a record between projects does not on its own
    //    make its newest revision untrue — but this migration runs beside ones that do, and the
    //    repair is one place for all of them rather than a judgement made again in each.
    const move = sqlite.prepare('UPDATE records SET workspace_id = ? WHERE id = ? AND workspace_id = ?')
    for (const m of moves) {
      const done = move.run(m.to, m.id, DEFAULT_WORKSPACE)
      if (done.changes === 1) report.moved[m.to] = (report.moved[m.to] ?? 0) + 1
    }

    // 4. THE CHANGE LOG, copied off the record each row is about. Only where NULL: a row that
    //    already carries one was written by `logChange` after the boundary existed, and it read the
    //    same value from the same place.
    report.changesStamped = sqlite
      .prepare(
        'UPDATE changes SET workspace_id = (SELECT r.workspace_id FROM records r WHERE r.id = changes.record_id) ' +
          'WHERE workspace_id IS NULL AND EXISTS (SELECT 1 FROM records r WHERE r.id = changes.record_id)',
      )
      .run().changes

    // 5. THE LINKS. A link belongs to the project both its ends are in. Where they disagree it
    //    belongs to neither, and this migration will not choose: the row is left exactly as it is
    //    and reported, because a link across a project boundary is the thing the product now
    //    refuses to create and quietly deleting one would destroy something somebody wrote.
    //
    //    ONE LINE FOR ALL OF THEM, NOT ONE PER LINK (problem P1-fTNDwwF2H). A note per link was about
    //    500 bytes, and the live corpus holds over 2,500 such links: the report outgrew the 1 MiB
    //    output buffer of the tool that starts an isolated office on a copy, which killed the
    //    migration and read it as failed. The count is said here, and the list is kept nowhere: the
    //    query in the note lists them, from the same clause this count is taken with.
    const crossing = sqlite.prepare(`SELECT l.id ${THE_LINKS_ACROSS_A_PROJECT_BOUNDARY}`).all() as { id: string }[]
    report.crossWorkspaceLinks = crossing.length
    if (crossing.length > 0) {
      notes.push({
        kind: 'cross_workspace_link',
        detail:
          `${crossing.length} link${crossing.length === 1 ? ' joins' : 's join'} two records in different projects. ` +
          `${crossing.length === 1 ? 'It was' : 'They were'} made before there was a project boundary to cross, and ` +
          `${crossing.length === 1 ? 'it is' : 'they are'} left alone: nothing here may decide which of the two projects a link ` +
          `belongs to, and deleting one would throw away a relationship somebody wrote. The list is not printed and ` +
          `not kept anywhere; this query lists them: SELECT l.id, l.type, l.from_id, l.to_id ` +
          `${THE_LINKS_ACROSS_A_PROJECT_BOUNDARY}. DELETE /api/links/<id> for one that is wrong, or move one of its ` +
          `two records so that they agree.`,
      })
    }
    if (crossing.length > 0) {
      // WHAT IT COSTS, once, after the count — because the count says what the links are and not
      // what having any of them means.
      //
      // The importer refuses a link whose two ends are in different projects, which is the right
      // rule and is not negotiable here. But an EXPORT of this database still succeeds, so the
      // archive it writes cannot be imported: measured on 2026-08-12 on an upgraded copy of the
      // live corpus, `scripts/export.ts` wrote 461 files and exit 0, and importing that archive
      // failed with 17 refusals and wrote 0 rows. An operator who upgrades tonight, takes the
      // documented archive backup, and needs it tomorrow finds out then.
      //
      // The file-copy backup route is unaffected — it copies bytes and asks no questions — which is
      // why the sentence names it.
      notes.push({
        kind: 'cross_workspace_link',
        detail:
          `THIS DATABASE'S ARCHIVE CANNOT CURRENTLY BE IMPORTED. ${crossing.length} link` +
          `${crossing.length === 1 ? '' : 's'} above cross${crossing.length === 1 ? 'es' : ''} a project ` +
          `boundary, and the importer refuses those — so \`scripts/export.ts\` will write an archive happily ` +
          `and \`scripts/import.ts --apply\` will refuse the whole of it and write nothing. Settle each of ` +
          `them (delete it, or move one of its two records) to make the archive restorable. Until then a ` +
          `file copy is the backup that works: npm run db:backup.`,
      })
    }
    report.linksRefiled = sqlite
      .prepare(
        'UPDATE links SET workspace_id = (SELECT a.workspace_id FROM records a WHERE a.id = links.from_id) ' +
          'WHERE EXISTS (SELECT 1 FROM records a JOIN records b ON b.id = links.to_id ' +
          'WHERE a.id = links.from_id AND a.workspace_id = b.workspace_id AND a.workspace_id <> links.workspace_id)',
      )
      .run().changes

    // 6. PRESENTATION INTENT follows the record it is about. A `pipeline:<id>` scope row follows
    //    the pipeline. The `structure` scope's own row follows nothing — it is one namespace over
    //    every module in the installation — so it is left where it is and reported rather than
    //    filed under a project it is only partly about.
    report.presentationRefiled = sqlite
      .prepare(
        'UPDATE presentation_intent SET workspace_id = ' +
          '(SELECT r.workspace_id FROM records r WHERE r.id = presentation_intent.target) ' +
          'WHERE EXISTS (SELECT 1 FROM records r WHERE r.id = presentation_intent.target ' +
          'AND r.workspace_id <> presentation_intent.workspace_id)',
      )
      .run().changes
    report.presentationRefiled += sqlite
      .prepare(
        "UPDATE presentation_intent SET workspace_id = (SELECT r.workspace_id FROM records r " +
          "WHERE 'pipeline:' || r.id = presentation_intent.scope) " +
          "WHERE target = '(scope)' AND EXISTS (SELECT 1 FROM records r WHERE 'pipeline:' || r.id = " +
          "presentation_intent.scope AND r.workspace_id <> presentation_intent.workspace_id)",
      )
      .run().changes
    const unscopable = (
      sqlite
        .prepare(
          "SELECT count(*) AS n FROM presentation_intent WHERE target = '(scope)' AND scope = 'structure'",
        )
        .get() as { n: number }
    ).n
    if (unscopable > 0) {
      notes.push({
        kind: 'intent_unscopable',
        detail:
          `${unscopable} presentation_intent row${unscopable === 1 ? '' : 's'} set the direction of the ` +
          `\`structure\` scope, which was one namespace over every module in the installation. There is no ` +
          `record to read a project off, so ${unscopable === 1 ? 'it is' : 'they are'} left in ` +
          `"${DEFAULT_WORKSPACE}" and the arrangement has to be written again per project.`,
      })
    }

    // 7. SESSION RESOURCES follow the session that started them. A row whose session record is
    //    missing is left alone: a port and a pid are facts about this machine, and filing one under
    //    a project nothing connects it to would put a stranger's process in somebody's orphan list.
    report.resourcesRefiled = sqlite
      .prepare(
        'UPDATE session_resources SET workspace_id = ' +
          '(SELECT r.workspace_id FROM records r WHERE r.id = session_resources.session_record_id) ' +
          'WHERE EXISTS (SELECT 1 FROM records r WHERE r.id = session_resources.session_record_id ' +
          'AND r.workspace_id <> session_resources.workspace_id)',
      )
      .run().changes
    const orphanResources = (
      sqlite
        .prepare(
          'SELECT count(*) AS n FROM session_resources s LEFT JOIN records r ON r.id = s.session_record_id ' +
            'WHERE r.id IS NULL',
        )
        .get() as { n: number }
    ).n
    if (orphanResources > 0) {
      notes.push({
        kind: 'resource_without_session',
        detail:
          `${orphanResources} session_resources row${orphanResources === 1 ? '' : 's'} name a session record ` +
          `that is not in the table, so no workspace can be read off it. Left in "${DEFAULT_WORKSPACE}".`,
      })
    }

    // 8. READER ANCHORS are COPIED into each newly established workspace rather than moved.
    //
    //    The anchor says "this reader had seen everything up to change C". At the moment it was
    //    written the installation was one undivided pile, so that statement was true of ALL of it,
    //    and it stays true of each project the pile turns out to have contained. Moving it into one
    //    project would tell the reader they have never looked at the others and show them a
    //    fortnight of already-read work as new, which is the exact exhaustion the anchor exists to
    //    remove. Copying is the truthful reading, and it is only done for a workspace this run
    //    established — an anchor already in a workspace is never overwritten.
    for (const id of established) {
      report.anchorsCopied += sqlite
        .prepare(
          'INSERT INTO reader_anchors (workspace_id, reader, last_seen_at, last_change_id) ' +
            'SELECT ?, reader, last_seen_at, last_change_id FROM reader_anchors WHERE workspace_id = ? ' +
            'ON CONFLICT(workspace_id, reader) DO NOTHING',
        )
        .run(id, DEFAULT_WORKSPACE).changes
    }

    // 9. PANEL LAYOUTS are left where they are, always. The table is retired and can no longer gain
    //    a row; a layout is where a reader dragged the panels on a page, which is a fact about the
    //    page rather than about a project.
    const layouts = (sqlite.prepare('SELECT count(*) AS n FROM panel_layouts').get() as { n: number }).n
    if (layouts > 0) {
      notes.push({
        kind: 'layout_left',
        detail:
          `${layouts} panel_layouts row${layouts === 1 ? '' : 's'} left in "${DEFAULT_WORKSPACE}". The table is ` +
          `retired and a layout is where somebody dragged the panels on a page, which is not a fact about a ` +
          `project.`,
      })
    }
  })

  apply()

  // THE PROOF OF THE CATCH-ALL DECISION, counted from the rows rather than claimed. Live records
  // only, because a deleted record is still filed in a project and is not what a reader counts.
  if (catchAllHere) {
    const liveIn = (id: string): number =>
      (
        sqlite
          .prepare('SELECT count(*) AS n FROM records WHERE workspace_id = ? AND deleted_at IS NULL')
          .get(id) as { n: number }
      ).n
    report.catchAll = { unassignedRecords: liveIn(UNASSIGNED_WORKSPACE), generalRecords: liveIn(GENERAL_WORKSPACE) }
  }

  // Counted from what was WRITTEN rather than from what was planned: a move whose row somebody had
  // already taken elsewhere updates nothing, and reporting it as work done would be a small lie
  // about the one thing this report exists to state.
  const recordsMoved = Object.values(report.moved).reduce((a, b) => a + b, 0)
  report.alreadyDone =
    recordsMoved === 0 &&
    report.established.length === 0 &&
    report.changesStamped === 0 &&
    report.linksRefiled === 0 &&
    report.anchorsCopied === 0 &&
    report.presentationRefiled === 0 &&
    report.resourcesRefiled === 0
  return report
}

/**
 * The report in words. EVERY note is printed except the bulk ones, for the reason describeOrigin
 * gives: a row the measurement does not cover is the ordinary case on any other database, and a
 * count says everything there is to say about it, while a cross-workspace link or a record that has
 * been renamed since is one somebody has to look at.
 */
export function describeWorkspaces(report: WorkspaceMigrationReport): string {
  if (report.tableMissing) {
    return (
      'workspaces: this database has no `workspaces` table, so migration 0006 has not been applied to it and ' +
      'NOTHING was established. Point the command at the whole drizzle/ folder.'
    )
  }
  const placed = Object.entries(report.moved)
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${n} into ${id}`)
  const head = report.alreadyDone
    ? `workspaces: nothing to establish (${report.alreadyPlaced} records already in the workspace the ` +
      `measurement puts them in)`
    : `workspaces: established ${report.established.length === 0 ? 'none' : report.established.join(', ')}; ` +
      `moved ${placed.length === 0 ? 'no records' : placed.join(', ')}; ${report.alreadyPlaced} already there; ` +
      `${report.changesStamped} change rows stamped, ${report.linksRefiled} links refiled, ` +
      `${report.anchorsCopied} reader anchors copied, ${report.presentationRefiled} intent rows and ` +
      `${report.resourcesRefiled} resource rows refiled`
  // THE TWO CATCH-ALL PROJECTS, SAID IN FULL WHEN THIS RUN MADE ONE OF THEM. An operator reading
  // "established general" has no way to tell whether the 92 records came with it, and that is the
  // one thing the decision is about — so the counts are printed rather than left to be
  // looked up afterwards.
  const catchAll =
    report.catchAll === null || !report.established.includes(GENERAL_WORKSPACE)
      ? ''
      : `\n  [catch_all] "General" is now a project and it is EMPTY: ${report.catchAll.generalRecords} records. ` +
        `"Unassigned" keeps its ${report.catchAll.unassignedRecords}. Nothing was moved between them. The two ` +
        `mean different things — General is work that is deliberately miscellaneous, Unassigned is work whose ` +
        `proper home nobody has decided — and a record moves from one to the other only when somebody says so.`
  const lines = report.notes.map((n) => `  [${n.kind}] ${n.detail}`)
  return head + catchAll + (lines.length === 0 ? '' : `\n${lines.join('\n')}`)
}

// ============================================================ the notes that named the wrong route

/**
 * THE TWO NOTES THIS MIGRATION USED TO WRITE, BY THE HASH OF THEIR WORDS. Problem JwtgCLiccj7N.
 *
 * Until 30 September 2026 the notes on `unassigned` and `general` told a reader to move a record
 * with `PATCH /api/records/:id`, and that request refuses the move. The notes above now name the
 * route that does it. The migration inserts a note only when the row does not exist yet, so a
 * database that already holds these two rows keeps the old words until something rewrites them.
 * These are the SHA-256 of the exact old words, kept only so `repairTheNotesThatNamedPatch` below
 * can tell them apart from a note somebody wrote. The words themselves are not kept here, because
 * a string here ships in the bundle and the old general note cited a record of one office;
 * tests/the-workspace-notes-name-the-route-that-moves-a-record.test.ts holds them.
 */
const THE_NOTES_THAT_NAMED_PATCH: Readonly<Record<string, string>> = {
  [UNASSIGNED_WORKSPACE]: '6cbe9ae09c65d41f657bda88849cd9b91ee1f72cf5af3d7cc8df487e3640ae49',
  [GENERAL_WORKSPACE]: 'a29cd05134d1083bfc6463c006cebaef5aca5970ee0d9a8ab0e29afa8a3a607d',
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

/** What the repair found on one row, and what it did or would do. */
export interface NoteRepairRow {
  id: string
  /**
   * `rewritten`: the stored note was the old words exactly, and now holds the new ones (on a dry
   * run: would hold). `left`: the stored note names `PATCH /api/records/:id` but is not the old
   * words exactly, so a person may have written it; it is not changed. `current`: the stored note
   * already holds the new words. `other`: the row holds a note that does not name that route, and
   * it is not changed. `absent`: this database has no such row.
   */
  found: 'rewritten' | 'left' | 'current' | 'other' | 'absent'
}

/**
 * REWRITE THE STORED NOTE ON `unassigned` AND `general` WHERE IT IS STILL THE OLD WORDS EXACTLY.
 *
 * NOTHING CALLS IT AT START-UP. The stored notes are rows in somebody's office, and changing them
 * is a person's choice to run a command. `scripts/repair-the-workspace-notes-that-named-patch.ts`
 * calls it, and writes nothing without `--do-it`.
 *
 * IT CHANGES AT MOST TWO ROWS: `workspaces` where `id` is `unassigned` or `general` and `note` is
 * exactly the old words whose hash is above. It sets `note` to the sentence the migration writes today and
 * `updated_at` to now. A note that differs by one character is reported and not changed, because a
 * person may have written it with PATCH /api/workspaces/:id. A second run changes nothing.
 */
export function repairTheNotesThatNamedPatch(sqlite: Database.Database, doIt: boolean): NoteRepairRow[] {
  const found: NoteRepairRow[] = []
  const read = sqlite.prepare('SELECT note FROM workspaces WHERE id = ?')
  const write = sqlite.prepare('UPDATE workspaces SET note = ?, updated_at = ? WHERE id = ? AND note = ?')
  sqlite.transaction(() => {
    for (const [id, oldWordsSha256] of Object.entries(THE_NOTES_THAT_NAMED_PATCH)) {
      const current = ESTABLISHED[id]?.note
      if (current === undefined) throw new Error(`the workspace migration declares no note for "${id}"`)
      const row = read.get(id) as { note: string | null } | undefined
      if (row === undefined) {
        found.push({ id, found: 'absent' })
      } else if (row.note === current) {
        found.push({ id, found: 'current' })
      } else if (row.note !== null && sha256(row.note) === oldWordsSha256) {
        if (doIt) write.run(current, nowStamp(), id, row.note)
        found.push({ id, found: 'rewritten' })
      } else if ((row.note ?? '').includes('PATCH /api/records/:id')) {
        found.push({ id, found: 'left' })
      } else {
        found.push({ id, found: 'other' })
      }
    }
  })()
  return found
}
