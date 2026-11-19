// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW WIDE EVERY STORED REVIEW IS, WRITTEN DOWN — AND THE PARTIAL UNIQUE INDEX THAT ONLY MEANS
 * ANYTHING ONCE IT IS. One transaction, written and proved and NOT REGISTERED.
 *
 * ---------------------------------------------------------------------------------------
 * TWO ACTS, ONE TRANSACTION, AND THE ORDER BETWEEN THEM IS THE WHOLE POINT
 * ---------------------------------------------------------------------------------------
 *
 * ACT ONE — every review's `reach` says what that review already was:
 *
 *     entry names a `page` or a `uiSurface` target  ->  reach = 'global'
 *     anything else                                 ->  reach = 'local', which it already reads
 *
 * The two kinds are not a guess. `SCOPE_READERS` in src/server/lib/reviews.ts answered
 * `{scope: {kind: 'project'}}` for both of them from the day the map was written: a review started
 * from a page or from a part of the screen collected the WHOLE PROJECT, because nothing narrower
 * was honestly true of it. So those reviews were project-wide in behaviour and had no word for it.
 * This act gives them the word. Nothing about what any of them collects changes.
 *
 * ACT TWO — `CREATE UNIQUE INDEX reviews_one_global_collecting ON reviews (workspace_id) WHERE
 * reach = 'global' AND state = 'collecting'`, in raw SQL, AFTER act one.
 *
 * IT IS NOT DECLARED IN `schema.ts`, AND THAT IS A DECISION RATHER THAN AN OVERSIGHT. drizzle-kit
 * emits a partial unique index into the generated file — `session_resources_live_idx` is declared in
 * exactly that form — so declaring it there would have landed it in window A's create-the-columns
 * migration, several waves before the backfill it is supposed to follow. Created before act one it
 * would be satisfied by a corpus where nothing is `global` yet, and the loud failure it is bought
 * for — a corpus that already holds two project-wide reviews collecting in one project — could
 * never happen. `tests/schema-tables.test.ts` names it as the one declared exception when it
 * compares `schema.ts`'s index set with the database's, so the omission can never be mistaken for
 * drift and a later `db:generate` cannot re-emit it silently.
 *
 * ---------------------------------------------------------------------------------------
 * IT ONLY EVER WIDENS, AND THAT IS WHAT MAKES IT SAFE TO RUN TWICE
 * ---------------------------------------------------------------------------------------
 *
 * A row already reading `global` is LEFT EXACTLY AS IT IS and counted. It is never narrowed back,
 * for a reason the corpus cannot show you and the product can: from the wave that lands global
 * review, a person may start a project-wide review FROM WHEREVER THEY ARE STANDING, so a `global`
 * review's entry is free to name a record. Narrowing on the entry would delete that person's press.
 *
 * At the moment this runs there is nothing to narrow anyway — `startReview` writes `reach: 'local'`
 * and no route writes anything else — so the widening rule and the "leave `global` alone" rule
 * cannot disagree here. They are written apart because the second one is what stops a re-run, or a
 * run against a database somebody has since used, from undoing a decision.
 *
 * ---------------------------------------------------------------------------------------
 * IT REWRITES NO `records.data`, SO IT RESTAMPS NOTHING, AND THAT IS SAID RATHER THAN ASSUMED
 * ---------------------------------------------------------------------------------------
 *
 * Window B's ordering rule is that every step rewriting `records.data` runs ABOVE `migrateRevisions`
 * or restamps the newest revision itself. This step touches one column of `reviews` and creates one
 * index. It writes no record, so no record's newest revision can come to disagree with what the
 * record holds, so there is nothing for it to restamp and no ledger for it to leave stale. It may
 * therefore sit below `migrateRevisions`, where the build plan puts it, without taking either
 * option — because the rule does not reach it. A step that later grew a `records.data` write would
 * have to take one, and `tests/every-window-b-step-keeps-the-ledger.test.ts` is what would notice:
 * it runs this step on a corpus and asserts it moves no record and no revision at all, and it holds
 * the ordering rule over every step in the product's own table of steps.
 *
 * ---------------------------------------------------------------------------------------
 * HOW BIG IT IS, MEASURED RATHER THAN PLANNED
 * ---------------------------------------------------------------------------------------
 *
 * The build plan's window-B table, row 7, said **21 and 10** until 25 August 2026 and neither figure
 * was ever this corpus's. Re-measured on 26 August 2026 by
 * design/round-ten/scratch/w7-reviews-reach-count.mjs — the plan's own two statements, in a file
 * anybody can re-run — against a copy made by `VACUUM INTO` so the write-ahead log is included:
 *
 *     reviews, all rows ...............................  2
 *     entry names a page or uiSurface target ..........  0
 *     review entry targets by kind ....................  planLine 1, record 1
 *     projects holding more than one wide review .....   none
 *     reviews_one_global_collecting ...................  not created yet
 *
 * SO THE `global` HALF RUNS ON NOTHING AND THE INDEX IS PROVED ON A FIXTURE. The plan says exactly
 * that, and this file does not pretend otherwise: `tests/reviews-reach-migration.test.ts` builds a
 * corpus holding two project-wide reviews collecting in one project and watches the whole
 * transaction refuse, by name, because that is the only place the failure this index is bought for
 * can be made to happen.
 *
 * **THE PLAN'S "2 SET `local`" IS A WRITE OF ZERO ROWS AND THE REPORT SAYS SO.** `reach` is
 * `NOT NULL DEFAULT 'local'`, so both of this corpus's reviews already read `local` and issuing two
 * UPDATEs that change nothing would put two lines in a ledger about nothing. They are counted as
 * `affirmedLocal` — read, decided, found already right — and `rowsWritten` is the number of rows
 * that actually changed. The two numbers are reported apart so that "it did nothing" and "there was
 * nothing to do" cannot be read as each other.
 *
 * THE COUNTS ARE A PARAMETER AND NOT A CONSTANT, for the reason ./block-identity.ts gives: a
 * function with the corpus's numbers baked in cannot be tested against anything else, and the first
 * thing anybody would do is take the check out. The runner holds the corpus's numbers with the date
 * they were taken; a test holds its fixture's. Any difference and the whole run refuses, naming each
 * one — a migration that runs against a corpus nobody counted is a broken assumption carried
 * quietly, which is the fourth invariant.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT LIVES HERE AND IS NOT REGISTERED
 * ---------------------------------------------------------------------------------------
 *
 * It is NOT in `drizzle/meta/_journal.json` and NOT in `migrateInPlace`, and that is deliberate.
 * `npm run db:migrate` runs on every clone and on every server start, including the owner's. This
 * creates a unique index on the owner's live corpus, and an index creation that fails takes the boot with
 * it. It is applied by its own runner, `run-reviews-reach.mjs`, against a database named on the
 * command line, which refuses the live corpus by name. Window B is when it runs for real, and
 * there is no window B in this run.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE CHECKS, INSIDE THE TRANSACTION
 * ---------------------------------------------------------------------------------------
 *
 *   1. EVERY ROW THIS WROTE READS BACK AS THE REACH IT MEANT TO WRITE. Re-read from the row, not
 *      from the plan.
 *   2. NO REVIEW IS LEFT THAT THIS STEP SHOULD HAVE WIDENED. Asked of the database afterwards, in
 *      the plan's own statement, so "it is done" is a measurement rather than the absence of an
 *      error.
 *   3. THE INDEX IS THERE AFTERWARDS AND ITS SQL IS THE DECLARED ONE. An index created with a
 *      different predicate is an index that permits the thing it was bought to forbid, and it looks
 *      identical from the outside until the day it matters.
 *
 * All three throw from inside the transaction, so a disagreement rolls the whole thing back.
 *
 * IT IS SAFE TO RUN TWICE. A second run finds every review already holding the reach its entry
 * implies and the index already there, plans nothing, writes nothing, and reports `alreadyDone`.
 */

import type Database from 'better-sqlite3'

/**
 * THE TWO TARGET KINDS THAT WERE PROJECT-WIDE IN ALL BUT NAME.
 *
 * Read against `SCOPE_READERS` in src/server/lib/reviews.ts, whose `page` and `uiSurface` arms both
 * answered `{scope: {kind: 'project', id: ''}}`. They are named here and not derived from that map,
 * because that map is about to stop widening — the arms become refusals in the same wave — and a
 * migration that read the new map would find nothing to widen and quietly do nothing.
 */
export const WIDE_TARGET_KINDS = ['page', 'uiSurface'] as const
export type WideTargetKind = (typeof WIDE_TARGET_KINDS)[number]

/** The index's name, in one place, so the create, the check and the test cannot disagree. */
export const INDEX_NAME = 'reviews_one_global_collecting'

/**
 * The index's SQL, in one place and in the spelling `sqlite_master` hands back.
 *
 * SQLite stores the text of a `CREATE INDEX` verbatim, so check 3 can compare what it finds with
 * what was asked for character by character. That is stricter than asking whether an index of that
 * name exists, which an index with the wrong predicate would also satisfy.
 */
export const INDEX_SQL =
  `CREATE UNIQUE INDEX ${INDEX_NAME} ON reviews (workspace_id) WHERE reach = 'global' AND state = 'collecting'`

/** One review this step would widen. */
export interface Move {
  id: string
  workspaceId: string
  /** The reach the row holds now. Always `local`, because a `global` row is never a move. */
  from: string
  /** The reach this would write. Always `global`, because this step only ever widens. */
  to: 'global'
  /** The kind its entry names, which is why it is being widened. */
  targetKind: WideTargetKind
  /** Its state, which is what the partial unique index is about. */
  state: string
}

/** One row this step would not touch, and why. Left exactly as it is. */
export interface SkipNote {
  kind: 'unreadable_entry' | 'no_target' | 'already_global'
  id: string
  detail: string
}

/** What the caller says it measured. Re-measured here and compared; any difference refuses. */
export interface MeasuredCorpus {
  /** Every row of `reviews`. */
  reviews: number
  /** Rows whose entry names a `page` or `uiSurface` target — the `global` half's size. */
  wide: number
}

export interface Report {
  /**
   * TRUE WHEN THIS DATABASE HAS NO `reviews` TABLE AT ALL, so there was nothing to widen.
   *
   * Window A creates that table. Until window B registered this step its only caller was a runner
   * pointed at a copy by hand, where a missing table meant the wrong file; `migrateInPlace` is also
   * run against a database migrated part-way — every test that applies a subset of the schema files
   * does it — and throwing there would stop the whole run over a table the next schema file makes.
   * IT IS NOT A SILENT SKIP: the flag is on the report and `describeReviewsReach` says it.
   */
  tableMissing: boolean
  /** True when every review already held the reach its entry implies AND the index was already there. */
  alreadyDone: boolean
  /** Every row of `reviews` that was read. */
  reviews: number
  /** Rows widened to `global`. */
  setGlobal: number
  /**
   * Rows read, decided, and found already right at `local`. NOT a write.
   *
   * The plan's row 7 calls this "2 set `local`". `reach` is `NOT NULL DEFAULT 'local'`, so on this
   * corpus that is two rows nothing has to be done to, and this number is reported apart from
   * `rowsWritten` so the two cannot be read as each other.
   */
  affirmedLocal: number
  /** Rows already reading `global`, left exactly as they are. */
  alreadyGlobal: number
  /** How many rows actually changed. `setGlobal`, and nothing else writes a row. */
  rowsWritten: number
  /** True when this run created the index. */
  indexCreated: boolean
  /** True when the index was already there when this run started. */
  indexAlreadyThere: boolean
  /** Every row this would not decide from, named. */
  notes: SkipNote[]
}

/** As much of a review row as this file reads. */
interface ReviewRow {
  id: string
  workspace_id: string
  entry: string
  state: string
  reach: string
}

/** Whether a table is there at all. A fresh database, or one migrated part-way, may not have it. */
function tableIsThere(sqlite: Database.Database, name: string): boolean {
  return sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined
}

/** The `CREATE INDEX` text SQLite is holding for this index, or null because it has none. */
export function indexSqlIn(sqlite: Database.Database): string | null {
  const row = sqlite
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?")
    .pluck()
    .get(INDEX_NAME) as string | undefined
  return row === undefined ? null : row
}

/**
 * THE KIND A STORED ENTRY NAMES, or null when the row holds nothing this can read.
 *
 * NOTHING HERE ASKS WHETHER THE KIND IS ONE OF THE TWO. That question is asked by the caller, once,
 * against `WIDE_TARGET_KINDS`, so the list of wide kinds has exactly one statement.
 */
function targetKindOf(entry: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(entry)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const target = (parsed as Record<string, unknown>)['target']
  if (typeof target !== 'object' || target === null || Array.isArray(target)) return null
  const kind = (target as Record<string, unknown>)['kind']
  return typeof kind === 'string' ? kind : null
}

/** Whether a kind is one of the two that were project-wide in all but name. */
function isWide(kind: string | null): kind is WideTargetKind {
  return (WIDE_TARGET_KINDS as readonly string[]).includes(kind ?? '')
}

/**
 * WHAT THE DATABASE HOLDS RIGHT NOW, in the plan's own two statements.
 *
 * This is what the runner re-measures against the numbers it says it took, and what a second run is
 * handed instead of the first run's numbers — the corpus has legitimately changed by then.
 */
export function countReachShapes(sqlite: Database.Database): MeasuredCorpus {
  if (!tableIsThere(sqlite, 'reviews')) return { reviews: 0, wide: 0 }
  const rows = sqlite.prepare('SELECT id, workspace_id, entry, state, reach FROM reviews').all() as ReviewRow[]
  let wide = 0
  for (const row of rows) if (isWide(targetKindOf(row.entry))) wide += 1
  return { reviews: rows.length, wide }
}

/** What this step would do, computed and written nowhere. */
export function planReviewsReach(sqlite: Database.Database): {
  moves: Move[]
  notes: SkipNote[]
  reviews: number
  affirmedLocal: number
  alreadyGlobal: number
  indexAlreadyThere: boolean
} {
  if (!tableIsThere(sqlite, 'reviews')) {
    return { moves: [], notes: [], reviews: 0, affirmedLocal: 0, alreadyGlobal: 0, indexAlreadyThere: false }
  }
  const rows = sqlite.prepare('SELECT id, workspace_id, entry, state, reach FROM reviews').all() as ReviewRow[]
  const moves: Move[] = []
  const notes: SkipNote[] = []
  let affirmedLocal = 0
  let alreadyGlobal = 0

  for (const row of rows) {
    // A ROW ALREADY READING `global` IS LEFT EXACTLY AS IT IS, whatever its entry names. See the
    // header: from the wave that lands global review, a project-wide review may be started from
    // wherever the person was standing, so narrowing on the entry would delete their press.
    if (row.reach === 'global') {
      alreadyGlobal += 1
      notes.push({
        kind: 'already_global',
        id: row.id,
        detail: `Review ${row.id} already says it is project-wide. Nothing here narrows one back.`,
      })
      continue
    }
    const kind = targetKindOf(row.entry)
    if (kind === null) {
      // IT IS LEFT AS IT IS AND NAMED. `local` is what the column already holds and what the review
      // already behaved as, so leaving it is not a guess — it is the answer that was already true.
      notes.push({
        kind: row.entry.trim() === '' || row.entry.trim()[0] !== '{' ? 'unreadable_entry' : 'no_target',
        id: row.id,
        detail:
          `Review ${row.id} holds an entry this step cannot read a target kind out of, so it is left reading ` +
          `"${row.reach}" — which is what it already collected as.`,
      })
      affirmedLocal += 1
      continue
    }
    if (!isWide(kind)) {
      affirmedLocal += 1
      continue
    }
    moves.push({ id: row.id, workspaceId: row.workspace_id, from: row.reach, to: 'global', targetKind: kind, state: row.state })
  }

  return {
    moves,
    notes,
    reviews: rows.length,
    affirmedLocal,
    alreadyGlobal,
    indexAlreadyThere: indexSqlIn(sqlite) !== null,
  }
}

/**
 * RUN IT. One transaction; any check that disagrees rolls the whole thing back.
 *
 * `measured` is what the caller says it counted before this was called. It is re-counted here and
 * compared, and any difference refuses the whole run naming both numbers.
 */
export function migrateReviewsReach(sqlite: Database.Database, measured: MeasuredCorpus): Report {
  const here = countReachShapes(sqlite)
  if (here.reviews !== measured.reviews || here.wide !== measured.wide) {
    throw new Error(
      `This database is not the one that was counted. It holds ${here.reviews} reviews of which ${here.wide} name a ` +
        `page or a part of the screen; the caller says it counted ${measured.reviews} and ${measured.wide}. Count it ` +
        `again with design/round-ten/scratch/w7-reviews-reach-count.mjs and run this against what that printed. ` +
        `Nothing has been written.`,
    )
  }

  if (!tableIsThere(sqlite, 'reviews')) {
    return {
      tableMissing: true,
      alreadyDone: true,
      reviews: 0,
      setGlobal: 0,
      affirmedLocal: 0,
      alreadyGlobal: 0,
      rowsWritten: 0,
      indexCreated: false,
      indexAlreadyThere: false,
      notes: [],
    }
  }

  const plan = planReviewsReach(sqlite)
  const alreadyDone = plan.moves.length === 0 && plan.indexAlreadyThere

  const run = sqlite.transaction((): Report => {
    const setReach = sqlite.prepare('UPDATE reviews SET reach = ? WHERE id = ?')
    for (const move of plan.moves) setReach.run(move.to, move.id)

    // CHECK 1 — every row this wrote reads back as the reach it meant to write. Re-read from the
    // row: a write that went to the wrong row passes every other check here.
    const readBack = sqlite.prepare('SELECT reach FROM reviews WHERE id = ?').pluck()
    for (const move of plan.moves) {
      const now = readBack.get(move.id) as string | undefined
      if (now !== move.to) {
        throw new Error(
          `Review ${move.id} was written as "${move.to}" and reads back as "${String(now)}". Nothing has been kept.`,
        )
      }
    }

    // CHECK 2 — nothing is left that this step should have widened, asked of the database in the
    // plan's own statement rather than inferred from the loop above.
    const left = sqlite
      .prepare(
        // `json_valid` FIRST, AND NOT AS A TIDINESS. A review whose entry is a paragraph of prose is
        // a row this step deliberately leaves alone, and `json_extract` on one throws "malformed
        // JSON" from inside the transaction — so without this guard the check that proves the step
        // finished would roll back the step, on exactly the corpus the step was written to tolerate.
        "SELECT id FROM reviews WHERE reach = 'local' AND json_valid(entry) " +
          "AND json_extract(entry, '$.target.kind') IN ('page', 'uiSurface')",
      )
      .pluck()
      .all() as string[]
    if (left.length > 0) {
      throw new Error(
        `${left.length} review(s) still say they are about one place while their entry names a page or a part of ` +
          `the screen: ${left.join(', ')}. Nothing has been kept.`,
      )
    }

    // ACT TWO — the index, AFTER the backfill, so a corpus already holding two project-wide reviews
    // collecting in one project fails here rather than being silently narrowed.
    let indexCreated = false
    if (!plan.indexAlreadyThere) {
      try {
        sqlite.prepare(INDEX_SQL).run()
        indexCreated = true
      } catch (err) {
        const clash = sqlite
          .prepare(
            "SELECT workspace_id AS ws, group_concat(id) AS ids, count(*) AS n FROM reviews " +
              "WHERE reach = 'global' AND state = 'collecting' GROUP BY 1 HAVING n > 1",
          )
          .all() as { ws: string; ids: string; n: number }[]
        if (clash.length === 0) throw err
        throw new Error(
          `This corpus already holds more than one project-wide review collecting at once, which is the state ` +
            `${INDEX_NAME} exists to make impossible: ` +
            clash.map((one) => `"${one.ws}" holds ${one.n} — ${one.ids}`).join('; ') +
            `. Finish or abandon all but one of them and run this again. Nothing has been kept, including the ` +
            `reach each review was about to be given.`,
        )
      }
    }

    // CHECK 3 — the index is there and its predicate is the declared one. An index of the right
    // name with the wrong predicate permits exactly what it was bought to forbid, and looks
    // identical from the outside until the day it matters.
    const sql = indexSqlIn(sqlite)
    if (sql === null) {
      throw new Error(`${INDEX_NAME} is not there after the step that creates it. Nothing has been kept.`)
    }
    if (sql !== INDEX_SQL) {
      throw new Error(
        `${INDEX_NAME} exists with a different definition. It reads:\n  ${sql}\nand it has to read:\n  ${INDEX_SQL}\n` +
          `Nothing has been kept.`,
      )
    }

    return {
      tableMissing: false,
      alreadyDone,
      reviews: plan.reviews,
      setGlobal: plan.moves.length,
      affirmedLocal: plan.affirmedLocal,
      alreadyGlobal: plan.alreadyGlobal,
      rowsWritten: plan.moves.length,
      indexCreated,
      indexAlreadyThere: plan.indexAlreadyThere,
      notes: plan.notes,
    }
  })

  return run()
}

/** The report, in sentences, for the person running it. */
export function describeReviewsReach(report: Report): string {
  if (report.tableMissing) {
    return (
      `review reach: this database has no \`reviews\` table, so NOTHING was written and nothing was skipped over ` +
      `— there was nowhere to write, and ${INDEX_NAME} was not created either. Window A creates that table; ` +
      `point the command at the whole drizzle/ folder.`
    )
  }
  if (report.alreadyDone) {
    return (
      `review reach: Nothing to do. All ${report.reviews} review(s) already say how wide they are, and ${INDEX_NAME} is already ` +
      `there. Nothing was written.`
    )
  }
  const lines = [
    `review reach: ${report.reviews} review(s) read.`,
    `${report.setGlobal} widened to project-wide; ${report.affirmedLocal} read as being about one place already ` +
      `and were not written to; ${report.alreadyGlobal} already said project-wide and were left alone.`,
    `${report.rowsWritten} row(s) changed.`,
    report.indexCreated
      ? `${INDEX_NAME} created, after the backfill.`
      : `${INDEX_NAME} was already there; it was checked and not recreated.`,
  ]
  for (const note of report.notes) lines.push(`  LEFT AS IT IS — ${note.id}: ${note.detail}`)
  return lines.join('\n')
}
