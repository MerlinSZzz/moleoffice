// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Make the revision ledger describe every record, and say honestly what each row it writes is.
 *
 * ---------------------------------------------------------------------------------------
 * TWO ACTS, ONE JOB
 * ---------------------------------------------------------------------------------------
 *
 *   A RECORD WITH NO REVISION AT ALL gets a `baseline` holding what it contains now. That is what
 *   this file was written for: migration 0060 creates the table empty, and every record that existed
 *   before it needs a first row. `planRevisionBaselines`.
 *
 *   A RECORD WHOSE NEWEST REVISION NO LONGER HOLDS WHAT THE RECORD HOLDS gets a row saying what it
 *   holds now. Two data migrations rewrite records through raw SQL and write no revision, so the
 *   ledger falls behind them; the baseline pass cannot repair that, because a record that already
 *   has a revision is not a record with none. `planStaleLedgers` holds the whole argument for why
 *   the repair is here rather than in each of those migrations.
 *
 * Both leave the same state behind, and it is the sentence the whole table exists to make true: the
 * newest revision of every record holds what that record contains.
 *
 * ---------------------------------------------------------------------------------------
 * DECISION 13: WHAT THIS WRITES, DECLARED
 * ---------------------------------------------------------------------------------------
 *
 * Decision 13 says a migration should normally preserve rows without rewriting them, that one which
 * must rebuild or copy rows is an explicit named exception, and that there is no hidden migration
 * rewrite. So here is this one, named:
 *
 *   IT INSERTS ROWS INTO `revisions` AND WRITES NOTHING ELSE. Not one cell of any other table is
 *   read for writing, changed, created or removed. No row is deleted and no table is rebuilt. It is
 *   on the DATA_MIGRATIONS list in tests/migration.test.ts, and the test that proves there is no
 *   hidden rewrite compares every cell of every table before and after and holds it to that.
 *
 * `rewritesStoredValues` IS FALSE. `revisions` is created empty by migration 0060, moments earlier
 * in the same command, so there is nothing here that anybody wrote and nothing that could be
 * overwritten. The second act adds rows to it and rewrites none: history is never edited here, and
 * a revision that has stopped being true is answered by a later revision rather than by changing it.
 *
 * ---------------------------------------------------------------------------------------
 * A BASELINE REVISION IS NOT THE RECORD AS CREATED, AND IT SAYS SO
 * ---------------------------------------------------------------------------------------
 *
 * This is the whole care this file needs, and getting it wrong would be a fabricated observation of
 * exactly the kind USER.md's third invariant is about.
 *
 * A record that existed before the ledger has NO stored history of its content. `changes` says what
 * changed and never what it was — a `create` row stores the record's TITLE and nothing else — so
 * what these records held on any earlier day was never written down anywhere and cannot be
 * recovered. What this migration can see is what they hold NOW, at the moment it runs.
 *
 * So the baseline revision holds today's content, and three things about it are deliberate:
 *
 *   ITS `op` IS `baseline`, WHICH IS NOT `create`. Nobody performed this write. `create` would claim
 *   a record's first revision is what its author filed, and for these rows that is unknown.
 *
 *   ITS `at` IS THIS MIGRATION'S MOMENT, NOT THE RECORD'S CREATION DATE. Putting the creation date
 *   on content that is not the creation content would be a stamp asserting a measurement nobody
 *   took: it would read as "this is what it looked like on 3 July" about a row last edited in
 *   August.
 *
 *   ITS ACTOR IS `system`, NOT THE PERSON WHO WROTE THE RECORD. A system wrote this row. Attributing
 *   it to the record's author would put words in their mouth about a revision they never made.
 *
 * And its `note` says all of that in plain words, on the row itself, so a reader who never opens
 * this file still knows what they are looking at.
 *
 * ---------------------------------------------------------------------------------------
 * SAFE TO RUN TWICE
 * ---------------------------------------------------------------------------------------
 *
 * It writes a baseline only for a record that has NO revision at all, and it catches a ledger up only
 * where the newest revision does not hold what the record holds. A second run finds every record
 * already covered and every ledger already true, writes nothing, and reports `alreadyDone`. That is
 * also what makes it safe after a restore: an archive carries the revisions with it, the restored
 * records already have them, and this changes nothing.
 *
 * IT HAS NO JOURNAL ROW AND CANNOT HAVE ONE. It decides what to do by looking at the data, exactly
 * as the four data migrations before it do, and for the same reason it lives here rather than in
 * drizzle/: a `.sql` file cannot compute `versionOf`, which is a sha256 over a particular JSON
 * shape, and cannot write a sentence saying what a baseline is not.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT COMES LAST OF THE DATA MIGRATIONS
 * ---------------------------------------------------------------------------------------
 *
 * Because every one of the others CHANGES what a record holds, and one of them CREATES records.
 * `migrateBlocks` turns each stored pipeline step into a block record; `migrateBlockedBy` rewrites
 * `records.data`; `migrateWorkspaces` moves records between projects. A baseline taken before any of
 * those would hold content the record no longer has, and a baseline taken before the block migration
 * would miss the block records entirely. Taken last, it holds what the database really contains when
 * the command finishes, which is the only content this file is entitled to claim anything about.
 *
 * NO `changes` ROW IS WRITTEN FOR A BASELINE, for the reason ./origin-migration.ts gives at the foot
 * of its own file: `changes` IS the daily page, and 536 rows saying "a baseline was recorded" would
 * bury whatever really happened on the day this is run. A baseline is also not an event in the work.
 * What the operator sees instead is the report below, printed by `npm run db:migrate`.
 */

import type Database from 'better-sqlite3'
import { anOfficeId } from './ids.ts'
import { nowStamp } from '@shared/time.ts'
// The one hash, from the file that opens no database. See its header for why it is not in
// lib/records.ts: importing that would open `./data/panelx.db` merely by loading this module.
import { contentOf, versionOf } from './version.ts'

export interface RevisionBackfillReport {
  /**
   * True when the `revisions` table is not there, so migration 0060 has not been applied here.
   *
   * REPORTED RATHER THAN THROWN, for the reason ./origin-migration.ts gives: migrating to an
   * intermediate point is a real thing to do, and tests/migration.test.ts builds databases part-way
   * through on purpose. A data migration that crashed on those would make the intermediate state
   * untestable, and the intermediate state is where every migration accident happens.
   */
  tableMissing: boolean
  /** True when nothing was written: no record needed a baseline and no ledger had fallen behind. */
  alreadyDone: boolean
  /** Baselines written by THIS run. */
  written: number
  /**
   * Records whose newest revision no longer held what the record holds, and were caught up.
   *
   * See `planStaleLedgers` below. Zero on a first upgrade, and zero on every ordinary run.
   */
  caughtUp: number
  /** Records that already had at least one revision and were left alone. */
  alreadyCovered: number
  /** The moment stamped on every row this run wrote. Empty when it wrote none. */
  at: string
}

/** A record as this file needs it. Read with raw SQL, so nothing is parsed that need not be. */
interface RecordRow {
  id: string
  workspace_id: string
  kind: string
  title: string
  summary: string | null
  data: string | null
  deleted_at: string | null
}

/**
 * THE SENTENCE ON EVERY BASELINE ROW, and the one thing in this file that a person will actually
 * read. It says what the revision is and, in the same breath, what it is not.
 *
 * Built here rather than written inline so the report, the row and any test all quote one string.
 */
export function baselineNote(at: string): string {
  return (
    `What this record held when the revision ledger was built, on ${at}. What it held before that was ` +
    `never stored — the change log says what changed and never what it was — so there is nothing earlier ` +
    `to compare with. This is NOT the record as it was created, and nobody performed this write: a ` +
    `migration wrote it, which is why it is attributed to the system.`
  )
}

/**
 * THE SENTENCE ON A ROW WRITTEN BECAUSE THE LEDGER HAD FALLEN BEHIND THE RECORD.
 *
 * It is careful about one thing: it does not say who made the write it is catching up with, because
 * this file cannot know. It says what happened, what this row holds, and where to look.
 */
export function caughtUpNote(at: string): string {
  return (
    `Something rewrote this record without keeping a revision of it, so the ledger had stopped describing ` +
    `the record. This row holds what the record contained at ${at}, when \`npm run db:migrate\` last ran. ` +
    `It is NOT evidence of who made that write or when: the data migrations in this same command are the ` +
    `usual cause, the report that command printed says which of them ran, and this record's change log ` +
    `holds the rows they wrote.`
  )
}

/** Whether this database has been through migration 0060 yet. */
function hasRevisionsTable(sqlite: Database.Database): boolean {
  return (
    sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'revisions'").get() !== undefined
  )
}

/**
 * Which records would be given a baseline, without writing any of it.
 *
 * Exported for the reason `planOriginStamps` gives: an operator can see what a migration would do to
 * their corpus before it does it, and a test can assert on the plan without a database it is willing
 * to lose. `previewMigration` in ./migrate.ts is built on the same idea, one level up.
 */
export function planRevisionBaselines(sqlite: Database.Database): {
  tableMissing: boolean
  /** Every record with no revision at all, oldest first, so the ledger is filled in a stable order. */
  records: RecordRow[]
  alreadyCovered: number
} {
  if (!hasRevisionsTable(sqlite)) return { tableMissing: true, records: [], alreadyCovered: 0 }

  // EVERY RECORD, INCLUDING THE SOFT-DELETED ONES. A deleted record is kept, is restorable, and has
  // content worth keeping — one that came back with no revision while its neighbours had one would
  // have a hole in its ledger that nothing explains. `deleted_at` is stored on the baseline, so the
  // revision says the record was deleted at the moment the ledger was built.
  const records = sqlite
    .prepare(
      'SELECT r.id, r.workspace_id, r.kind, r.title, r.summary, r.data, r.deleted_at FROM records r ' +
        'WHERE NOT EXISTS (SELECT 1 FROM revisions v WHERE v.record_id = r.id) ' +
        'ORDER BY r.created_at, r.id',
    )
    .all() as RecordRow[]

  const covered = sqlite
    .prepare('SELECT count(DISTINCT record_id) AS n FROM revisions WHERE record_id IN (SELECT id FROM records)')
    .get() as { n: number }

  return { tableMissing: false, records, alreadyCovered: covered.n }
}

/**
 * Which records the ledger has stopped describing, without writing any of it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS HERE AND NOT IN THE MIGRATIONS THAT CAUSE IT
 * ---------------------------------------------------------------------------------------
 *
 * Two data migrations rewrite what a record holds through raw SQL: `migrateBlockedBy` moves a task's
 * `blocked_by` sentence into `also_waiting_on`, and `migrateBlocks` turns a pipeline's stored steps
 * into block records. Both write `changes` rows saying what moved, and neither wrote a revision —
 * so the change log and the ledger disagreed about the same write with nothing failing, and the
 * baseline pass could not repair it because that pass only fills records with NO revision at all.
 * Measured on 18 August 2026: a task's `data` became `{"also_waiting_on":"…"}`, two change rows
 * appeared, the ledger's only row still held `{}`, and every screen went on serving that row as
 * what the record contains.
 *
 * The repair is here, once, rather than in each of those two files, for the reason this pass already
 * runs LAST of the data migrations: it is the only point in `npm run db:migrate` where nothing else
 * is going to move afterwards. A copy of it in each migration would be the same fact worked out in
 * as many places as there are migrations, and the next migration would forget.
 *
 * IT IS NOT LIMITED TO MIGRATIONS AND DOES NOT CLAIM TO BE. Anything that leaves the ledger behind
 * is caught here the next time this command runs. `caughtUpNote` is careful to say that the row is
 * not evidence of who made the write it is catching up with, because this file cannot know.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT "STOPPED DESCRIBING" MEANS, EXACTLY
 * ---------------------------------------------------------------------------------------
 *
 * The record's newest revision — highest `seq`, which the UNIQUE index makes a single row — carries a
 * `content_hash` that is not `versionOf` of what the record now holds. That is the same token
 * `GET /api/records/:id` serves as `version`, so the rule this keeps true is the sentence a caller
 * can check: the version you are served names the newest revision you can read.
 *
 * lib/version.ts says two different tokens are not proof that the content differs, because key order
 * inside `data` is part of the hash. So this can write a row when only the order of two keys moved.
 * That is the safe direction: the cost is one extra row holding exactly what the record holds, and
 * the cost of the other direction is the ledger staying wrong.
 */
export function planStaleLedgers(sqlite: Database.Database): {
  tableMissing: boolean
  /** Every record whose newest revision no longer holds what it holds, with that revision's number. */
  records: (RecordRow & { newest_seq: number })[]
} {
  if (!hasRevisionsTable(sqlite)) return { tableMissing: true, records: [] }

  const rows = sqlite
    .prepare(
      'SELECT r.id, r.workspace_id, r.kind, r.title, r.summary, r.data, r.deleted_at, ' +
        '       v.seq AS newest_seq, v.content_hash AS newest_hash ' +
        '  FROM records r ' +
        '  JOIN revisions v ON v.record_id = r.id ' +
        ' WHERE v.seq = (SELECT max(w.seq) FROM revisions w WHERE w.record_id = r.id) ' +
        ' ORDER BY r.created_at, r.id',
    )
    .all() as (RecordRow & { newest_seq: number; newest_hash: string })[]

  const stale = rows.filter((row) => {
    const content = contentOf({
      kind: row.kind,
      title: row.title,
      summary: row.summary,
      data: decodeData(row.data),
      deletedAt: row.deleted_at,
    })
    return versionOf(content) !== row.newest_hash
  })

  return { tableMissing: false, records: stale.map(({ newest_hash: _ignored, ...row }) => row) }
}

/**
 * The stored `data` column, decoded, or `{}` when it holds nothing readable.
 *
 * A ROW WHOSE `data` WILL NOT PARSE IS NOT A REASON TO REFUSE THE WHOLE MIGRATION, and it is not a
 * reason to guess either. `records.data` is NOT NULL with a SQL default of `{}` and everything that
 * writes it writes JSON, so this cannot happen through any door the product has — but a database is
 * a file somebody can edit, and a migration that threw here would leave the ledger unbuilt for every
 * record because of one hand-edited row. `{}` is what every reader already sees for an absent value,
 * through `contentOf` in lib/version.ts, and the row is counted in neither direction: it gets its
 * baseline like every other record, holding what a reader would see.
 */
function decodeData(raw: string | null): Record<string, unknown> {
  if (raw === null) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/**
 * Make the ledger describe every record. One transaction, and it either all lands or none of it does.
 *
 * TWO ACTS, AND THEY ARE THE SAME JOB FROM TWO STARTING POINTS. A record with no revision at all gets
 * a `baseline`; a record whose newest revision no longer holds what the record holds gets a row
 * saying what it holds now. Both leave the same state behind: the newest revision of every record is
 * what that record contains. See `planRevisionBaselines` and `planStaleLedgers` for each argument.
 *
 * `dryRun` plans and reports and writes nothing, which is what an operator should run first against
 * a copy of anything they care about.
 */
export function migrateRevisions(
  sqlite: Database.Database,
  opts: { dryRun?: boolean } = {},
): RevisionBackfillReport {
  const { tableMissing, records, alreadyCovered } = planRevisionBaselines(sqlite)
  // ASKED AFTER THE BASELINES ARE PLANNED AND BEFORE ANY OF THEM IS WRITTEN. A record with no
  // revision is not a record whose ledger fell behind — it has no ledger — so the two lists never
  // overlap, and a baseline written first would move a row out of one and into neither.
  const stale = planStaleLedgers(sqlite).records

  if (tableMissing || (records.length === 0 && stale.length === 0)) {
    return { tableMissing, alreadyDone: true, written: 0, caughtUp: 0, alreadyCovered, at: '' }
  }
  if (opts.dryRun === true) {
    return {
      tableMissing: false,
      alreadyDone: false,
      written: records.length,
      caughtUp: stale.length,
      alreadyCovered,
      at: '',
    }
  }

  // ONE MOMENT FOR THE WHOLE RUN. Every row this migration writes was taken at the same time,
  // because it was: they are all the same observation of the same database. Stamping each row with
  // its own reading of the clock would put a spread of times on one act and invite a reader to
  // believe the order meant something.
  const at = nowStamp()
  const note = baselineNote(at)
  const stillTrue = caughtUpNote(at)

  const insert = sqlite.prepare(
    'INSERT INTO revisions ' +
      '(id, record_id, workspace_id, seq, content_hash, kind, title, summary, data, deleted_at, op, ' +
      ' actor_type, actor_id, session_id, at, note) ' +
      'VALUES (@id, @record_id, @workspace_id, @seq, @content_hash, @kind, @title, @summary, @data, @deleted_at, ' +
      ' @op, \'system\', \'system\', NULL, @at, @note)',
  )

  /** One row, from a record as it stands. The two acts differ only in `seq`, `op` and the sentence. */
  const write = (row: RecordRow, seq: number, op: 'baseline' | 'update', sentence: string): void => {
    const data = decodeData(row.data)
    // THE SAME HASH THE SERVER COMPUTES, through the same two functions, so a baseline's
    // `content_hash` is the very string `GET /api/records/:id` hands back as `version` for a
    // record nobody has touched since. A second hash here is the defect lib/version.ts exists to
    // prevent — see its header.
    const content = contentOf({
      kind: row.kind,
      title: row.title,
      summary: row.summary,
      data,
      deletedAt: row.deleted_at,
    })
    insert.run({
      id: anOfficeId(),
      record_id: row.id,
      // DERIVED FROM THE RECORD, in the same statement, exactly as `saveRevision` derives it and
      // for the same reason: a revision's project is the project of the record it is of, which is
      // the same fact rather than a second one that could differ.
      workspace_id: row.workspace_id,
      seq,
      content_hash: versionOf(content),
      kind: content.kind,
      title: content.title,
      summary: content.summary,
      // Re-serialised from what was decoded rather than copied through, so the stored document is
      // the one that was hashed. A row whose `data` did not parse stores `{}` here, which is what
      // every reader sees for it.
      data: JSON.stringify(content.data),
      deleted_at: content.deletedAt,
      op,
      at,
      note: sentence,
    })
  }

  const run = sqlite.transaction(() => {
    for (const row of records) write(row, 1, 'baseline', note)
    // `update` AND NOT `baseline`. A baseline is the row nobody performed; this one is catching up
    // with a write that really happened to a record that already had a ledger, so calling it a
    // baseline would claim the record had no history before it. Its `note` says what it is.
    for (const row of stale) write(row, row.newest_seq + 1, 'update', stillTrue)
  })
  run()

  return {
    tableMissing: false,
    alreadyDone: false,
    written: records.length,
    caughtUp: stale.length,
    alreadyCovered,
    at,
  }
}

/** The report `npm run db:migrate` prints for this migration. */
export function describeRevisionBackfill(report: RevisionBackfillReport): string {
  if (report.tableMissing) {
    return (
      'revisions: this database has no `revisions` table, so migration 0060 has not been applied to it and ' +
      'NOTHING was written. Point the command at the whole drizzle/ folder to create it.'
    )
  }
  if (report.alreadyDone) {
    return `revisions: nothing to backfill (${report.alreadyCovered} record${report.alreadyCovered === 1 ? '' : 's'} already carry one)`
  }
  // EACH PASS SPEAKS ONLY WHEN IT WROTE SOMETHING, and never as "0 baselines" or "0 caught up",
  // because that is a line an operator has to read past on every run to find the ones that mean
  // something. `alreadyDone` above has already answered the run where neither pass wrote anything,
  // so at least one of the two sentences below is always printed.
  const baselines =
    report.written === 0
      ? `no record needed a baseline (${report.alreadyCovered} record${report.alreadyCovered === 1 ? '' : 's'} already carried one).`
      : `${report.written} baseline revision${report.written === 1 ? '' : 's'} written at ${report.at}, ` +
        `${report.alreadyCovered} record${report.alreadyCovered === 1 ? '' : 's'} already carried one.\n` +
        `  A baseline holds what the record contains NOW and says so on the row: it is NOT the record as it was ` +
        `created, because what these records held earlier was never stored anywhere. Its actor is the system, ` +
        `because a migration wrote it, and its time is this migration's moment.`
  const caughtUp =
    report.caughtUp === 0
      ? ''
      : `\n  ${report.caughtUp} record${report.caughtUp === 1 ? '' : 's'} had a ledger that no longer described ` +
        `${report.caughtUp === 1 ? 'it' : 'them'}: something rewrote the record and kept no revision, so a ` +
        `revision was written at ${report.at} holding what the record contains now. Two of the data migrations ` +
        `above rewrite records in raw SQL and are the usual cause. The row says in plain words that it is not ` +
        `evidence of who made that write.`
  return `revisions: ${baselines}${caughtUp}`
}
