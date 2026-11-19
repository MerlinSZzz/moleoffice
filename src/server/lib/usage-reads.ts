// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE MEASUREMENTS ADD UP TO: STRETCHES, THE PRUNE, AND THE AGGREGATES DRAWN ON A PAGE.
 *
 * `src/server/lib/usage.ts` writes the rows. This file reads them. They are separate files because
 * the writer is installed once at startup and the readers run per request, and because a reader
 * importing the writer would make every read depend on the hook being on.
 *
 * ---------------------------------------------------------------------------------------
 * A STRETCH IS MOLE OFFICE'S RULE, NOT AN AGENT'S DISCIPLINE
 * ---------------------------------------------------------------------------------------
 *
 * A trace is whatever a caller sent in one header. An agent that mints one trace id, recovers in six
 * minutes and then keeps the same header for four hours would be drawn as a 242-minute recovery, and
 * the whole point of the longitudinal measurement — is recovery getting better — would say recovery
 * got forty times worse. Nothing rotates a trace id except an agent choosing to.
 *
 * So the segmentation is stated here as a rule: a stretch is a maximal run of consecutive rows in
 * one trace that share a purpose and have no gap longer than `IDLE_GAP` between neighbours. The
 * number is right whether or not the agent rotates anything.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE RULE THAT KEEPS THE SUMMARY FROM BEING A SECOND COPY
 * ---------------------------------------------------------------------------------------
 *
 * A stretch summary is written by the prune, in the same transaction that deletes the rows it
 * summarises, and by nothing else. So a trace is in exactly one of two states: its rows exist and no
 * summary does, or a summary exists and no rows do. The fact moves; it is never in two places.
 */
import { and, eq, gte, lte, lt, sql } from 'drizzle-orm'
import { anOfficeId } from './ids.ts'
import {
  FOLLOWED_BY,
  IDLE_GAP,
  THEN_WROTE_WINDOW,
  WANTED,
  wantedNamed,
  type Verdict,
} from '@shared/ops.ts'
import { localStamp, parseLocalStamp } from '@shared/time.ts'
import { medianOf, medianOfCounts } from '@shared/median.ts'
import { WHAT_IS_KEPT_DEFAULTS } from '@shared/what-is-kept.ts'
import { inEnglish, saying, type DevSaying } from '@shared/dev-sayings.ts'
import { db, sqlite } from '../db/client.ts'
import { apiCalls, changes, hourlyCalls, outsideReads, usageStretches } from '../db/schema.ts'
import { KeptSettingCannotBeRead, theRequestWindows, type KeptNumberInForce } from './what-is-kept.ts'

/**
 * HOW LONG AN UNTRACED ROW IS KEPT WHEN NOBODY HAS CHOSEN. Criterion U6.
 *
 * It is the DEFAULT and nothing more. The window in force is read from the installation row by
 * `theRequestWindows`; this constant is what applies when the column is NULL. A browser's polling is
 * noise a week later, which is why seven days is the default the owner named.
 */
export const UNTRACED_WINDOW_DAYS = WHAT_IS_KEPT_DEFAULTS.untracedRequestDays

/**
 * HOW LONG A TRACE IS KEPT WHOLE WHEN NOBODY HAS CHOSEN. Criterion U6.
 *
 * It is the DEFAULT and nothing more: six months of recoveries is what the series is made of, so the
 * default does not change and the person may set it on the Settings page.
 */
export const TRACED_WINDOW_DAYS = WHAT_IS_KEPT_DEFAULTS.tracedRequestDays

const DAY = 24 * 60 * 60 * 1000

/**
 * THE LOCAL WALL-CLOCK HOUR A FOLDED CALL BELONGS TO, `YYYY-MM-DD HH`.
 *
 * One function because two readers need it and a second copy would drift: `foldedCallsSince` asks
 * which hourly counts fall inside a window, and the prune asks which have fallen past one. The hour
 * is the person's own hour, so a count folds the way they lived it rather than by UTC.
 */
function theHourOf(ms: number): string {
  return localStamp(new Date(ms)).slice(0, 13)
}

/** One row of either measured table, reduced to what the segmentation and the sums read. */
export interface CallRow {
  id: string
  atMs: number
  operation: string | null
  effect: string | null
  status: number
  ms: number
  bytes: number | null
  listLen: number | null
  waits: number
  purpose: string | null
  traceId: string | null
  actorType: string | null
  actorId: string | null
  sessionId: string | null
  workspaceId: string | null
  targetId: string | null
  targetKind: string | null
  clientOrigin: string | null
}

/** One stretch, worked out rather than stored, with the rows it was worked out from. */
export interface Stretch<Row = CallRow> {
  traceId: string
  seq: number
  purpose: string | null
  startedMs: number
  endedMs: number
  endedBecause: 'purpose-changed' | 'went-quiet' | 'still-open'
  rows: Row[]
}

/**
 * CUT ONE TRACE'S ROWS INTO STRETCHES.
 *
 * `now` decides only one thing: whether the last stretch is still being written. A stretch whose
 * last row is within `IDLE_GAP` of now is `still-open` and is left out of every average, because
 * averaging a number that is still growing is the same defect as averaging a hand-measured baseline
 * with an instrumented one.
 *
 * A row with no purpose joins the stretch before it. A run of rows that all lack one has purpose
 * null. That is not a guess: it is the honest reading of a caller that said nothing.
 */
export function stretchesOf<Row extends Pick<CallRow, 'traceId' | 'atMs' | 'purpose'>>(
  rows: readonly Row[],
  now: number,
): Stretch<Row>[] {
  // GROUPED BY TRACE FIRST, AND THEN CUT. "Consecutive" means consecutive INSIDE ONE TRACE, not
  // consecutive in the table. Two agents working at the same moment interleave their rows, and a
  // walk in plain time order would cut each of their stretches into single-row pieces every time the
  // other one made a call — which would report two ordinary recoveries as forty tiny ones.
  //
  // GROUPED BY PUSHING, NOT BY REBUILDING. This used to be `set(id, [...get(id), row])`, which
  // copies the whole group for every row in it, so a trace of n rows cost n squared copies. On the
  // owner's corpus of 703,341 call rows that was part of why GET /api/usage/patterns answered after
  // 146 seconds and blocked every other request behind it (problem seMxXokrlWrI). The grouping is
  // the same grouping; only the copying is gone.
  const byTrace = new Map<string, Row[]>()
  for (const row of rows) {
    if (row.traceId === null) continue
    const group = byTrace.get(row.traceId)
    if (group === undefined) byTrace.set(row.traceId, [row])
    else group.push(row)
  }
  const out: Stretch<Row>[] = []
  for (const [traceId, unsorted] of byTrace) {
    const sorted = [...unsorted].sort((a, b) => a.atMs - b.atMs)
    let current: Stretch<Row> | null = null
    // How many stretches this trace already has. It used to be counted by scanning everything
    // written so far, which is the same quadratic cost as the grouping above.
    let seqHere = 0
    for (const row of sorted) {
      if (current !== null) {
        const quiet = row.atMs - current.endedMs > IDLE_GAP
        // A ROW WITH NO PURPOSE JOINS THE STRETCH BEFORE IT. Only a stated purpose that differs from
        // the stretch's own ends it, because absence is not a third purpose.
        const changed = row.purpose !== null && current.purpose !== null && row.purpose !== current.purpose
        const startsOne = row.purpose !== null && current.purpose === null
        if (!quiet && !changed && !startsOne) {
          current.endedMs = row.atMs
          current.rows.push(row)
          continue
        }
        current.endedBecause = quiet ? 'went-quiet' : 'purpose-changed'
      }
      current = {
        traceId,
        seq: seqHere,
        purpose: row.purpose,
        startedMs: row.atMs,
        endedMs: row.atMs,
        endedBecause: 'went-quiet',
        rows: [row],
      }
      seqHere += 1
      out.push(current)
    }
    // ONLY THE LAST STRETCH OF A TRACE CAN STILL BE OPEN. Every earlier one was ended by the row
    // that follows it, and that reason is already on it.
    if (current !== null && now - current.endedMs <= IDLE_GAP) current.endedBecause = 'still-open'
  }
  return out.sort((a, b) => a.startedMs - b.startedMs)
}

/**
 * THE MEDIANS ARE WORKED OUT IN src/shared/median.ts, so a tool outside the server reads the same rule.
 * Every median in this file still comes through `medianOfCounts`.
 */
export { medianOf, medianOfCounts }

/**
 * A HELD LISTEN IS A WAIT, NOT A COST, so it is out of every latency figure.
 *
 * A poll that waits four minutes for a message is not a slow endpoint. 144 rows an hour per listener
 * at 25,000 ms each would otherwise read as the slowest operation in the product and every median
 * would be a lie. The column is on the row rather than worked out here, so this rule is one filter.
 */
export function latencies(rows: readonly Pick<CallRow, 'waits' | 'ms'>[]): number[] {
  return rows.filter((r) => r.waits !== 1).map((r) => r.ms)
}

// ============================================================================ the prune

/** What one prune did, so the caller can say it rather than assume it. */
export interface PruneResult {
  untracedDeleted: number
  tracesPruned: number
  stretchesWritten: number
  /**
   * HOW MANY COUNTED HOURLY ROWS WENT. Criterion U6. They are pruned on the UNTRACED window,
   * because a counted row stands where untraced request rows stood: it carries no trace, so there is
   * no whole piece of work to keep it with. Without this the counts would grow for ever, one row per
   * hour per listener per operation.
   */
  foldedDeleted: number
}

/**
 * DELETE WHAT IS PAST ITS WINDOW, AND KEEP THE SERIES.
 *
 * WHOLE TRACES ONLY. A trace is prunable when its LAST row is older than the traced window, and then
 * every row of it goes and every stretch of it is summarised. A trace that half-survived would make
 * every count over it wrong in a way nothing could detect.
 *
 * THE SUMMARY IS WRITTEN IN THE SAME TRANSACTION THAT DELETES THE ROWS IT SUMMARISES, AND BY NOTHING
 * ELSE. That is what stops it being a second copy of a fact: a trace's rows exist and no summary
 * does, or a summary exists and no rows do. `tests/usage-prune.test.ts` asserts the intersection is
 * empty, and the mutation that proves it is writing the summary without deleting the rows.
 *
 * THE TWO WINDOWS COME FROM THE PERSON'S SETTING. Criterion U6. `theRequestWindows` reads the
 * installation row and throws `KeptSettingCannotBeRead` when a value is present and cannot be read,
 * so the prune stops rather than deleting rows under a made-up window. A NULL column is nobody
 * having chosen and the constant above applies.
 */
export function pruneUsage(now: number = Date.now()): PruneResult {
  const windows = theRequestWindows()
  const untracedBefore = now - windows.untraced.value * DAY
  const tracedBefore = now - windows.traced.value * DAY
  const result: PruneResult = { untracedDeleted: 0, tracesPruned: 0, stretchesWritten: 0, foldedDeleted: 0 }

  db.transaction((tx) => {
    // UNTRACED ROWS FIRST, and they leave no summary at all. A stretch is a run of rows sharing a
    // trace; a row with no trace is in no stretch, so there is nothing to summarise and a summary
    // invented for one would be a row about nothing.
    // DELETED BY THE CONDITION, NEVER BY A LIST OF IDS. Until 13 September 2026 this selected the
    // ids and deleted them with `IN (?, ?, ...)`, one bound variable per row; on the owner's live office the
    // list grew past SQLite's limit on bound variables and the server died at start with "too many
    // SQL variables" (seven restarts in a row at 02:20, the office down until this line). The
    // condition is the same one the select used, inside the same transaction, so the rows deleted
    // are exactly the rows that select would have named, and the count comes from the delete.
    const untracedGone = tx
      .delete(apiCalls)
      .where(and(sql`${apiCalls.traceId} is null`, lte(apiCalls.atMs, untracedBefore)))
      .run()
    result.untracedDeleted = untracedGone.changes

    // AND THE COUNTED HOURLY ROWS ON THE SAME WINDOW. Criterion U6. They are deleted by their own
    // hour key, strictly before the boundary hour, so a row whose hour straddles the window is kept
    // rather than deleted with some of its calls still inside. `theHourOf` is the same reader the
    // count is drawn with, so the two cannot disagree about which hour a moment is in.
    const foldedGone = tx.delete(hourlyCalls).where(lt(hourlyCalls.hour, theHourOf(untracedBefore))).run()
    result.foldedDeleted = foldedGone.changes

    // WHICH TRACES ARE WHOLLY PAST THE WINDOW. The MAX of a trace's rows, not the min: a trace whose
    // last row is recent is live work whatever its first row says.
    const lastPerTrace = tx
      .select({ traceId: apiCalls.traceId, lastMs: sql<number>`max(${apiCalls.atMs})` })
      .from(apiCalls)
      .where(sql`${apiCalls.traceId} is not null`)
      .groupBy(apiCalls.traceId)
      .all()
    const doomed = lastPerTrace.filter((t) => t.lastMs <= tracedBefore).map((t) => t.traceId as string)
    for (const traceId of doomed) {
      const rows = tx.select().from(apiCalls).where(eq(apiCalls.traceId, traceId)).all() as unknown as CallRow[]
      const outside = tx.select().from(outsideReads).where(eq(outsideReads.traceId, traceId)).all()
      for (const stretch of stretchesOf(rows, now)) {
        tx.insert(usageStretches).values(summariseStretch(stretch, outside, tx)).run()
        result.stretchesWritten += 1
      }
      tx.delete(apiCalls).where(eq(apiCalls.traceId, traceId)).run()
      tx.delete(outsideReads).where(eq(outsideReads.traceId, traceId)).run()
      result.tracesPruned += 1
    }
  })
  lastPrune = { at: localStamp(new Date(now)), ...result }
  return result
}

/**
 * WHAT THE LAST PRUNE IN THIS PROCESS DID, OR NULL BECAUSE NONE HAS RUN.
 *
 * NULL IS NOT ZERO. A server that has not pruned and a prune that deleted nothing are different
 * facts, and the fourteen- and hundred-and-eighty-day windows this summary publishes are only true
 * of a database something has actually pruned. So the reading is null until a prune runs, and the
 * summary draws that as "nobody has pruned in this process" rather than as a row of zeroes.
 */
let lastPrune: (PruneResult & { at: string }) | null = null

/** The last prune's own report, for the summary to publish. */
export function lastPruneReport(): (PruneResult & { at: string }) | null {
  return lastPrune
}

/**
 * THE PRUNE AS THE SERVER'S START RUNS IT: one call, and one line saying what it did.
 *
 * WHY A FUNCTION AND NOT SIX LINES IN `start()`. `src/server/index.ts` may not import this module at
 * the top — importing it opens the database, which that file's own header forbids — so the call
 * there is a dynamic import of one name. Keeping the sentence here means a test can read the
 * sentence, and `tests/usage-prune.test.ts` does.
 *
 * A DELETION NOBODY IS TOLD ABOUT is what this repository refuses everywhere else, so the line names
 * both windows as well as the counts: an operator who sees `0 rows` needs to know which windows
 * produced that zero. Since criterion U6 it also says where each window came from — the person's setting or
 * the default — because a window that moved is the fact the operator most needs to see.
 *
 * A SETTING THAT CANNOT BE READ IS A REFUSAL AND NOT A GUESS. When a stored value is present and
 * unreadable the prune deletes nothing and says so in the line; the alternative would be enforcing
 * a window nobody chose, over rows nobody can get back.
 */
export function pruneAtStart(now: number = Date.now()): { result: PruneResult; line: string } {
  let windows: { untraced: KeptNumberInForce; traced: KeptNumberInForce }
  try {
    windows = theRequestWindows()
  } catch (err) {
    if (!(err instanceof KeptSettingCannotBeRead)) throw err
    return {
      result: { untracedDeleted: 0, tracesPruned: 0, stretchesWritten: 0, foldedDeleted: 0 },
      line: `usage prune: refused and nothing was deleted — ${err.message}`,
    }
  }
  const result = pruneUsage(now)
  const line =
    `usage prune: ${String(result.untracedDeleted)} untraced request row${result.untracedDeleted === 1 ? '' : 's'} deleted, ` +
    `${String(result.tracesPruned)} whole trace${result.tracesPruned === 1 ? '' : 's'} deleted and summarised into ` +
    `${String(result.stretchesWritten)} stretch summar${result.stretchesWritten === 1 ? 'y' : 'ies'} kept, ` +
    `${String(result.foldedDeleted)} counted hourly row${result.foldedDeleted === 1 ? '' : 's'} deleted — ` +
    `untraced rows are kept ${String(windows.untraced.value)} days ${whereTheWindowCameFrom(windows.untraced)}, ` +
    `traced ones ${String(windows.traced.value)} days ${whereTheWindowCameFrom(windows.traced)}`
  return { result, line }
}

/** "(the person's setting)" or "(the default)", the words the log line uses for where a window came from. */
function whereTheWindowCameFrom(window: KeptNumberInForce): string {
  return window.from === "the person's setting" ? "(the person's setting)" : '(the default)'
}

/** One outside-read row, as much of it as the summary counts. */
interface OutsideRow {
  atMs: number
  wanted: string
  verdict: string
}

/** The row the prune writes for one stretch. Everything on it is counted from the rows going away. */
function summariseStretch(
  stretch: Stretch,
  outside: readonly OutsideRow[],
  tx: { select: typeof db.select },
): typeof usageStretches.$inferInsert {
  const inWindow = outside.filter((o) => o.atMs >= stretch.startedMs && o.atMs <= stretch.endedMs)
  const perOperation: Record<string, { calls: number; refused: number; bytes_total: number; bytes_median: number | null; ms_median: number | null }> = {}
  for (const row of stretch.rows) {
    const key = row.operation ?? 'unrouted'
    const entry = (perOperation[key] ??= { calls: 0, refused: 0, bytes_total: 0, bytes_median: null, ms_median: null })
    entry.calls += 1
    if (row.status >= 400 && row.status < 500) entry.refused += 1
    entry.bytes_total += row.bytes ?? 0
  }
  for (const [key, entry] of Object.entries(perOperation)) {
    const rows = stretch.rows.filter((r) => (r.operation ?? 'unrouted') === key)
    entry.bytes_median = medianOf(rows.map((r) => r.bytes ?? 0))
    entry.ms_median = medianOf(latencies(rows))
  }
  const perQuestion: Record<string, { gap: number; boundary: number; unsure: number }> = {}
  for (const row of inWindow) {
    const entry = (perQuestion[row.wanted] ??= { gap: 0, boundary: 0, unsure: 0 })
    if (row.verdict === 'gap') entry.gap += 1
    else if (row.verdict === 'boundary') entry.boundary += 1
    else entry.unsure += 1
  }
  const first = stretch.rows[0]!
  return {
    id: anOfficeId(),
    traceId: stretch.traceId,
    stretchSeq: stretch.seq,
    purpose: stretch.purpose,
    startedMs: stretch.startedMs,
    endedMs: stretch.endedMs,
    endedBecause: stretch.endedBecause,
    actorType: first.actorType,
    actorId: first.actorId,
    sessionId: first.sessionId,
    workspaceId: first.workspaceId,
    // THREE COUNTS AND NOT ONE WORD. A stretch of 39 local calls and 2 remote and a stretch of 20
    // and 21 are different evidence about whether working from the other machine costs anything; one
    // `mixed` bucket makes them the same value and drops both out of the split for ever.
    localCalls: stretch.rows.filter((r) => r.clientOrigin === 'local').length,
    remoteCalls: stretch.rows.filter((r) => r.clientOrigin === 'remote').length,
    unknownCalls: stretch.rows.filter((r) => r.clientOrigin === null).length,
    calls: stretch.rows.length,
    reads: stretch.rows.filter((r) => r.effect === 'read').length,
    writes: stretch.rows.filter((r) => r.effect === 'write').length,
    refused: stretch.rows.filter((r) => r.status >= 400 && r.status < 500).length,
    failed: stretch.rows.filter((r) => r.status >= 500).length,
    bytes: stretch.rows.reduce((sum, r) => sum + (r.bytes ?? 0), 0),
    msTotal: stretch.rows.reduce((sum, r) => sum + r.ms, 0),
    distinctOperations: new Set(stretch.rows.map((r) => r.operation).filter((o) => o !== null)).size,
    outsideReads: inWindow.length,
    gapVerdicts: inWindow.filter((o) => o.verdict === 'gap').length,
    thenWrote: thenWroteFor(stretch, tx),
    perOperation: JSON.stringify(perOperation),
    perQuestion: JSON.stringify(perQuestion),
  }
}

/**
 * DID THE SESSION THAT RAN THIS STRETCH GO ON TO WRITE ANYTHING?
 *
 * IT READS THE `changes` LOG AND NOT THE TELEMETRY. A change row is a durable write that actually
 * happened; a write-effect call is a request that may have been refused.
 *
 * THREE VALUES, BECAUSE TWO WOULD LIE. Without `cannot-tell`, an agent that recovered, worked and
 * wrote three records without sending a session header would be drawn as an agent that recovered and
 * did nothing — an absent header drawn as absent work, on the page whose whole subject is honesty.
 *
 * THE TWO TIME REPRESENTATIONS ARE BRIDGED BY `parseLocalStamp` AND BY NOTHING ELSE. `api_calls.at_ms`
 * is epoch milliseconds and `changes.at` is a local wall-clock string. Writing the conversion by hand
 * is what made a fifty-minute silence read as "just now": `${stamp.replace(' ','T')}Z` failed no test
 * and no typecheck and was found by accident two months later. On a machine an hour ahead of UTC it
 * would count every change in the hour before a stretch as inside it.
 */
export function thenWroteFor(stretch: Stretch, tx: { select: typeof db.select }): string {
  const sessionId = stretch.rows.map((r) => r.sessionId).find((s) => s !== null && s !== '')
  if (sessionId === undefined || sessionId === null) return 'cannot-tell'
  const rows = tx.select({ at: changes.at }).from(changes).where(eq(changes.sessionId, sessionId)).all()
  const wrote = rows.some((row) => {
    const ms = parseLocalStamp(row.at)
    if (ms === null) return false
    return ms >= stretch.startedMs && ms <= stretch.endedMs + THEN_WROTE_WINDOW
  })
  return wrote ? 'wrote' : 'did-not-write'
}

// ============================================================================ the aggregates

/**
 * WHICH DATABASE COLUMN EACH FIELD OF A CALL ROW COMES FROM. One declaration, because the reader
 * below builds its SELECT from it and nothing else names these columns.
 */
const COLUMN_OF: Readonly<Record<keyof CallRow, string>> = {
  id: 'id',
  atMs: 'at_ms',
  operation: 'operation',
  effect: 'effect',
  status: 'status',
  ms: 'ms',
  bytes: 'bytes',
  listLen: 'list_len',
  waits: 'waits',
  purpose: 'purpose',
  traceId: 'trace_id',
  actorType: 'actor_type',
  actorId: 'actor_id',
  sessionId: 'session_id',
  workspaceId: 'workspace_id',
  targetId: 'target_id',
  targetKind: 'target_kind',
  clientOrigin: 'client_origin',
}

/** Every field of a call row, for a reader that wants the lot. */
export const EVERY_COLUMN = Object.keys(COLUMN_OF) as (keyof CallRow)[]

/**
 * The call rows in a window that carry a trace, in time order, with the columns the caller asked for.
 *
 * EVERY READING BUILT ON STRETCHES WANTS THIS ONE. `stretchesOf` drops a row with no trace, so a
 * reading that segments work has always been about traced rows only; fetching the rest was fetching
 * rows to throw away. On the owner's corpus that is 5,383 rows instead of 602,962, and 60 ms
 * instead of 952.
 *
 * `columns` is how a reading says what it reads. Each reader takes `Pick<CallRow, …>` naming the
 * fields it reads, so a reader that starts reading another column stops compiling until somebody
 * adds that column to the list its caller asks for.
 */
export function tracedCallsSince<K extends keyof CallRow>(
  fromMs: number,
  workspaceId: string | null,
  columns: readonly K[],
): Pick<CallRow, K>[] {
  const names = [...new Set(columns)]
  const select = names.map((name) => `${COLUMN_OF[name]} as "${name}"`).join(', ')
  const where = ['at_ms >= ?', ...(workspaceId === null ? [] : ['workspace_id = ?']), 'trace_id is not null'].join(' and ')
  const statement = sqlite.prepare(`select ${select} from api_calls where ${where} order by at_ms`)
  return statement.all(...windowArgs(fromMs, workspaceId)) as Pick<CallRow, K>[]
}

/**
 * THE WINDOW EVERY GROUPED READ BELOW COUNTS OVER: rows from `fromMs` on, in one project or in all.
 *
 * One function, because five queries in this file state the same window and a query that forgot the
 * project would count every project's calls as this one's. `alias` names the table when a query
 * reads `api_calls` twice.
 */
function theWindow(workspaceId: string | null, alias = ''): string {
  const at = alias === '' ? '' : `${alias}.`
  return workspaceId === null ? `${at}at_ms >= ?` : `${at}at_ms >= ? and ${at}workspace_id = ?`
}

/** The values `theWindow` asks for, in its order. */
function windowArgs(fromMs: number, workspaceId: string | null): (number | string)[] {
  return workspaceId === null ? [fromMs] : [fromMs, workspaceId]
}

/**
 * ---------------------------------------------------------------------------------------
 * THE PER-OPERATION READINGS ARE COUNTED BY SQLITE, NOT BY FETCHING EVERY ROW
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/usage/operations` and `GET /api/usage/patterns` used to fetch every call row in the
 * window into JavaScript and group them there. On 703,341 rows the fetch alone took 430 to 680 ms,
 * because it builds one JavaScript object per row, and the doors took 0.6 to 0.8 s even when warm
 * (problem `Hy13YXeH7xHL`). Now each count is a `group by` in the query, and what comes back is one
 * row per group rather than one per call. The only rows still fetched one by one are the traced
 * rows `patternReadings` cuts into stretches.
 *
 * WHY THE TWO GROUPED QUERIES SAY `indexed by api_calls_workspace_operation_idx`. That index is led
 * by the project and the operation and holds every column the two queries read (migration 0184). So
 * SQLite reads one project's rows already in operation order, groups them as they come, and never
 * opens the table. The window's time is checked inside the index. The index holds only the rows
 * with an operation, so both queries say `operation is not null`; without those words SQLite may not
 * use it, and the query fails with an error naming the index. It fails the same way if the index is
 * ever renamed, rather than quietly going back to a slow plan.
 *
 * WHAT IT CHANGED, measured on the timing test's 703,341 rows on 27 September 2026, ten processes
 * per door, load average 5 to 12, median milliseconds: operations 509 on its first request and 364
 * after, now 334 and 178; patterns 460 and 304, now 252 and 90. Before migration 0184 these queries
 * walked `api_calls_at_idx` and sorted every row by operation in memory. `api_calls_operation_idx`
 * is in operation order too, but it makes SQLite look up every table row one at a time, which took
 * 820 to 910 ms.
 *
 * THE MIDDLE VALUE IS STILL WORKED OUT BY `medianOfCounts`. SQLite has no median, so the grouped
 * query hands each group's values to `usage_median`, the SQL aggregate registered below, which
 * counts them and asks `medianOfCounts`. The values reach JavaScript as plain numbers and no row
 * object is built.
 */
const MEDIAN_IN_SQL = 'usage_median'

/** The index both grouped queries walk. Declared in src/server/db/schema.ts, made by migration 0184. */
const BY_PROJECT_AND_OPERATION = 'api_calls_workspace_operation_idx'

sqlite.aggregate(MEDIAN_IN_SQL, {
  start: () => new Map<number, number>(),
  step: (counts: Map<number, number>, value: unknown) => {
    // A NULL IS A ROW THE QUERY LEFT OUT OF THIS FIGURE, such as a held listen (`NOT_A_WAIT`).
    if (value === null) return
    if (typeof value !== 'number') throw new Error(`${MEDIAN_IN_SQL} was given ${typeof value}; it takes numbers only`)
    counts.set(value, (counts.get(value) ?? 0) + 1)
  },
  result: (counts: Map<number, number>) => medianOfCounts(counts),
})

/**
 * THE SAME RULE AS `latencies` ABOVE, SAID IN SQL: a held listen is a wait, not a cost. The prune
 * reads rows and uses `latencies`; the grouped reads use this. Change both or neither.
 */
const NOT_A_WAIT = 'waits != 1'

/**
 * THE ORDER IN WHICH EACH GROUP WAS FIRST CALLED, as the rows come out of `order by at_ms`.
 *
 * The readings below sort with ties kept in the order the groups were first called, because that is
 * the order they had when the rows were fetched and grouped in JavaScript, and the answers are the
 * same answers. The time of each group's first call comes from the grouped query. When two groups
 * were first called in the same millisecond, `order by at_ms` walks `api_calls_at_idx`, which lists
 * those rows by rowid, so the rowid of the group's first row decides it. `rowidOfFirst` asks for that
 * rowid with the group's own condition.
 */
function inFirstCalledOrder<G extends { firstAtMs: number }>(groups: G[], rowidOfFirst: (group: G) => number): G[] {
  const keyed = groups.map((group) => ({ group, rowid: rowidOfFirst(group) }))
  keyed.sort((a, b) => a.group.firstAtMs - b.group.firstAtMs || a.rowid - b.rowid)
  return keyed.map((k) => k.group)
}

/**
 * THE FOLDED COUNTS IN A WINDOW, BY OPERATION. Criterion U6.
 *
 * A folded operation wrote no `api_calls` row, so a reading built only on the call rows would draw
 * the office as having been asked 62 per cent less than it was. This is the other half of the
 * count, read from the one small row per hour per listener per operation that stands where the
 * request rows used to.
 *
 * A WHOLE HOUR AT THE EDGE. A counted row has no per-call time, so a window that starts mid-hour
 * takes the whole of that hour. That is the one thing a fold costs a reader, and it is said rather
 * than hidden: the number is a count of calls that happened in an hour overlapping the window.
 *
 * The window's own hour is computed by the same `theHourOf` the prune uses, and the comparison is
 * on the text key, which sorts as time because the stamp is `YYYY-MM-DD HH`.
 */
export function foldedCallsSince(fromMs: number, workspaceId: string | null): Map<string, number> {
  const fromHour = theHourOf(fromMs)
  const where =
    workspaceId === null
      ? gte(hourlyCalls.hour, fromHour)
      : and(gte(hourlyCalls.hour, fromHour), eq(hourlyCalls.workspaceId, workspaceId))
  const rows = db
    .select({ operation: hourlyCalls.operation, calls: sql<number>`sum(${hourlyCalls.calls})` })
    .from(hourlyCalls)
    .where(where)
    .groupBy(hourlyCalls.operation)
    .all()
  const out = new Map<string, number>()
  for (const row of rows) out.set(row.operation, Number(row.calls))
  return out
}

/**
 * WHO REACHED THIS API FROM OFF THIS MACHINE: one row per address, with when and how many.
 *
 * Criterion R3 of `design/ground/ACCEPTANCE.md` section 7: *the runtime record and the listeners
 * tool name the clients that reached the API from off the machine (address, when, how many
 * requests) without storing anything a person did not do.*
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING NEW IS STORED, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------------------
 *
 * This is a read over `api_calls`, which the API has written one row into per request since 25
 * August 2026. `client_origin` says whether a call arrived through a door for another machine and
 * `client_addr` says which address it came from. No table, no column and no new write: a machine
 * that has never called does not appear, and it stops appearing when its rows age out of the call
 * log along with everything else.
 *
 * ---------------------------------------------------------------------------------------
 * AN ADDRESS NOBODY COULD READ IS A ROW, NOT A HOLE IN THE COUNT
 * ---------------------------------------------------------------------------------------
 *
 * `client_addr` is null when a call came through the loopback door a network daemon passes requests
 * through and that daemon wrote no forwarded header. That is a real reading — calls arrived from
 * somewhere else and nothing here can say where — so it gets a row with a null address rather than
 * being dropped. Dropping it would make the total quietly smaller than the number of remote calls,
 * which is the kind of number that is wrong without looking wrong.
 */
export interface ClientFromAnotherMachine {
  /** The address it called from, or null because nothing on the way here said. */
  address: string | null
  /** How many of its requests are still in the call log. */
  requests: number
  /** When the oldest of those was, local wall-clock. */
  firstAt: string
  /** When the newest was, local wall-clock. */
  lastAt: string
}

/** Every machine that has called this API from somewhere else, the most recent caller first. */
export function clientsFromOtherMachines(): ClientFromAnotherMachine[] {
  const rows = db
    .select({
      address: apiCalls.clientAddr,
      requests: sql<number>`count(*)`,
      firstMs: sql<number>`min(${apiCalls.atMs})`,
      lastMs: sql<number>`max(${apiCalls.atMs})`,
    })
    .from(apiCalls)
    .where(eq(apiCalls.clientOrigin, 'remote'))
    .groupBy(apiCalls.clientAddr)
    .all()
  return rows
    .map((row) => ({
      address: row.address,
      requests: Number(row.requests),
      firstAt: localStamp(new Date(Number(row.firstMs))),
      lastAt: localStamp(new Date(Number(row.lastMs))),
    }))
    .sort((a, b) => (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0))
}

/**
 * ONE KIND OF REFUSAL A CALLER FROM ANOTHER MACHINE MET, WITH ITS COUNT AND WHEN IT STARTED.
 *
 * The same read over `api_calls` that `clientsFromOtherMachines` is, narrowed to the calls that were
 * refused. Nothing new is stored and no new table exists: `status` is what the caller got and
 * `client_origin` says the call came through a door for another machine.
 *
 * WHAT COUNTS AS A REFUSAL. A status from 400 to 499 — the caller asked for something it was not
 * given. A 500 is this server failing, which is a different question, so it is not counted here.
 */
export interface RefusalFromAnotherMachine {
  /** Why it was refused, in a reader's words. */
  reason: string
  /** How many of those are still in the call log. */
  count: number
  /** When the oldest of them was, local wall-clock. */
  since: string
}

/**
 * WHY A REQUEST WAS REFUSED, IN A READER'S WORDS, FOR THE STATUSES THIS API ACTUALLY SENDS.
 *
 * A number is not a reason. Anything not in this list is drawn as the number with the word
 * "refused" in front of it, which is the honest answer when nothing here knows what it means —
 * never a guess at which of these it resembles.
 */
const WHY_A_CALL_WAS_REFUSED: Readonly<Record<number, string>> = {
  400: 'asked in a way Mole Office could not read',
  401: 'did not say who was asking',
  403: 'not allowed from another computer',
  404: 'asked for something that is not here',
  409: 'asked to change something that had already changed',
}

/** Every kind of refusal a caller from another machine met, the commonest first. */
export function refusalsFromOtherMachines(): RefusalFromAnotherMachine[] {
  const rows = db
    .select({
      status: apiCalls.status,
      count: sql<number>`count(*)`,
      firstMs: sql<number>`min(${apiCalls.atMs})`,
    })
    .from(apiCalls)
    .where(and(eq(apiCalls.clientOrigin, 'remote'), gte(apiCalls.status, 400), lte(apiCalls.status, 499)))
    .groupBy(apiCalls.status)
    .all()
  return rows
    .map((row) => ({
      reason: WHY_A_CALL_WAS_REFUSED[row.status] ?? `refused with ${String(row.status)}`,
      count: Number(row.count),
      since: localStamp(new Date(Number(row.firstMs))),
    }))
    .sort((a, b) => b.count - a.count)
}

/** Every outside-read claim in a window. */
export function outsideSince(fromMs: number, workspaceId: string | null) {
  const where =
    workspaceId === null
      ? gte(outsideReads.atMs, fromMs)
      : and(gte(outsideReads.atMs, fromMs), eq(outsideReads.workspaceId, workspaceId))
  return db.select().from(outsideReads).where(where).orderBy(outsideReads.atMs).all()
}

/** What one operation cost, over a window. */
export interface OperationReading {
  operation: string
  calls: number
  /**
   * HOW MANY OF THOSE CALLS WERE COUNTED BY THE HOUR rather than stored one row each. Criterion U6.
   * A reader has to be able to say which part of the count is a folded summary, because a number
   * whose meaning changed silently is the third invariant. Zero for every operation stored the
   * ordinary way.
   */
  foldedCalls: number
  refused: number
  bytes: number
  msMedian: number | null
  /** The share of this write's calls followed within ten seconds by a read naming the same thing. */
  readBackShare: number | null
  readBackOf: number
}

/**
 * PER OPERATION: WHAT IT COST, AND — FOR A WRITE — HOW OFTEN A READ CAME STRAIGHT BACK FOR IT.
 *
 * The second half is the measurement 0A.9 asked for and no wave built. It is NOT a feature: nothing
 * changes what any reply carries. It is the number that would justify one, and the threshold that
 * would justify it is stated beside it rather than left to whoever reads the table.
 *
 * `of` is how many call rows the window holds, with or without an operation, which is what the door
 * publishes beside the readings.
 */
export function operationReadings(
  fromMs: number,
  workspaceId: string | null,
  foldedByOperation: ReadonlyMap<string, number> = new Map(),
): { readings: OperationReading[]; of: number } {
  // ONE GROUPED QUERY, AND THE READ-BACK RULE IN A SECOND ONE.
  //
  // This used to walk every row once per operation name and, for every write operation, walk every
  // row again once per write. On the owner's corpus — 703,341 call rows and about 150 operations —
  // that was tens of billions of comparisons, and GET /api/usage/operations answered after 162
  // seconds with every other request queued behind it (problem seMxXokrlWrI). Then it fetched every
  // row and grouped in JavaScript, which still took 0.6 to 0.8 s (problem Hy13YXeH7xHL).
  //
  // THE ROWS WITH NO OPERATION ARE COUNTED ON THEIR OWN. They are requests no route matched. They
  // count in `of` and are not drawn. The grouped query cannot count them, because the index it walks
  // holds only rows with an operation (migration 0184), so a second query counts them through
  // `api_calls_operation_idx`, which finds them without walking the rest.
  //
  // THE FOLDED COUNTS ARRIVE AS AN ARGUMENT. The caller (`GET /api/usage/operations`) hands in what
  // `foldedCallsSince` read, so a test can hand in a count without writing hourly rows.
  const groups = sqlite
    .prepare(
      `select operation, count(*) as calls, sum(status >= 400 and status < 500) as refused, ` +
        `sum(coalesce(bytes, 0)) as bytes, max(effect = 'write') as isWrite, sum(${aNamedWrite()}) as namedWrites, ` +
        `min(at_ms) as firstAtMs, ` +
        `${MEDIAN_IN_SQL}(case when ${NOT_A_WAIT} then ms end) as msMedian ` +
        `from api_calls indexed by ${BY_PROJECT_AND_OPERATION} where ${theWindow(workspaceId)} and operation is not null ` +
        `group by operation`,
    )
    .all(...windowArgs(fromMs, workspaceId)) as {
    operation: string
    calls: number
    refused: number
    bytes: number
    isWrite: number | null
    namedWrites: number
    firstAtMs: number
    msMedian: number | null
  }[]
  const withNoOperation = sqlite
    .prepare(`select count(*) from api_calls indexed by api_calls_operation_idx where operation is null and ${theWindow(workspaceId)}`)
    .pluck()
    .get(...windowArgs(fromMs, workspaceId)) as number
  const of = groups.reduce((sum, group) => sum + group.calls, withNoOperation)
  const firstRowid = sqlite
    .prepare(`select min(rowid) from api_calls indexed by api_calls_at_idx where ${theWindow(workspaceId)} and at_ms = ? and operation = ?`)
    .pluck()
  const inOrder = inFirstCalledOrder(groups, (group) =>
    Number(firstRowid.get(...windowArgs(fromMs, workspaceId), group.firstAtMs, group.operation)),
  )
  const followed = followedWritesSince(fromMs, workspaceId, null)
  const out: OperationReading[] = []
  for (const group of inOrder) {
    const isWrite = group.isWrite === 1
    const readBack = readBackOf(group.namedWrites, followed.get(group.operation))
    const foldedCalls = foldedByOperation.get(group.operation) ?? 0
    out.push({
      operation: group.operation,
      // THE COUNT DRAWN WHERE THE ROWS WERE, criterion U6. The folded calls are real calls the
      // office answered; they were simply not stored one row each. `foldedCalls` says how much of
      // this number is that summary so the page can say it too.
      calls: group.calls + foldedCalls,
      foldedCalls,
      refused: group.refused,
      bytes: group.bytes,
      msMedian: group.msMedian,
      readBackShare: isWrite ? readBack.share : null,
      readBackOf: isWrite ? readBack.of : 0,
    })
  }
  // AN OPERATION WITH ONLY FOLDED CALLS HAS NO ROWS AT ALL and must still be drawn, or the count
  // would be missing from the page in exactly the case the fold exists for. It comes after every
  // operation that has rows, in the order the folded counts arrived.
  const withRows = new Set(groups.map((group) => group.operation))
  for (const [operation, foldedCalls] of foldedByOperation) {
    if (withRows.has(operation)) continue
    out.push({
      operation,
      calls: foldedCalls,
      foldedCalls,
      refused: 0,
      bytes: 0,
      msMedian: null,
      readBackShare: null,
      readBackOf: 0,
    })
  }
  return { readings: out.sort((a, b) => b.bytes - a.bytes || b.calls - a.calls), of }
}

/**
 * A WRITE THAT NAMES THE THING IT WROTE, which is every write the read-back rule asks about. Said
 * once, because the count of them and the count of those followed must mean the same writes.
 */
function aNamedWrite(alias = ''): string {
  const at = alias === '' ? '' : `${alias}.`
  return `${at}effect = 'write' and ${at}target_id is not null`
}

/**
 * THE READ-BACK RULE, PER WRITE OPERATION, ASKED OF SQLITE.
 *
 * For each write that names a thing and carries a trace, it asks whether a read naming the same
 * thing followed inside `FOLLOWED_BY` and inside the same trace. It walks the traced rows only,
 * through `api_calls_trace_idx`: a write with no trace is never followed, because no read can be in
 * the same trace as it. The read has to be in the same project when a project is named; it is always
 * inside the window, because it comes after a write that is. It answers, per operation, how many
 * writes were followed and in how many traces. `operation` narrows it to one operation; null asks for
 * all of them.
 */
function followedWritesSince(
  fromMs: number,
  workspaceId: string | null,
  operation: string | null,
): Map<string, { followed: number; traces: number }> {
  const sameProject = workspaceId === null ? '' : ' and r.workspace_id = w.workspace_id'
  const rows = sqlite
    .prepare(
      `select w.operation as operation, count(*) as followed, count(distinct w.trace_id) as traces ` +
        `from api_calls w indexed by api_calls_trace_idx where w.trace_id is not null and ${theWindow(workspaceId, 'w')} ` +
        `and ${aNamedWrite('w')} and w.operation is not null` +
        `${operation === null ? '' : ' and w.operation = ?'} and exists (` +
        `select 1 from api_calls r indexed by api_calls_trace_idx where r.trace_id = w.trace_id ` +
        `and r.at_ms > w.at_ms and r.at_ms <= w.at_ms + ? and r.effect = 'read' and r.target_id = w.target_id${sameProject}` +
        `) group by w.operation`,
    )
    .all(...windowArgs(fromMs, workspaceId), ...(operation === null ? [] : [operation]), FOLLOWED_BY) as {
    operation: string
    followed: number
    traces: number
  }[]
  return new Map(rows.map((row) => [row.operation, { followed: row.followed, traces: row.traces }]))
}

/**
 * THE SHARE OF AN OPERATION'S NAMED WRITES THAT A READ FOLLOWED. Zero of zero for an operation that
 * wrote nothing it named, rather than a division by nothing.
 */
function readBackOf(
  namedWrites: number,
  followed: { followed: number; traces: number } | undefined,
): { share: number; of: number; traces: number } {
  if (namedWrites === 0) return { share: 0, of: 0, traces: 0 }
  return { share: (followed?.followed ?? 0) / namedWrites, of: namedWrites, traces: followed?.traces ?? 0 }
}

/**
 * HOW OFTEN A WRITE IS FOLLOWED, INSIDE TEN SECONDS AND INSIDE THE SAME TRACE, BY A READ NAMING THE
 * SAME THING.
 *
 * The same trace, because two agents writing and reading at the same moment are not one sequence.
 * The same `target_id`, because a read of something else is a different request that happened to be
 * next. Ten seconds is `FOLLOWED_BY`, which is one constant serving both of this product's
 * "immediately afterwards" measurements. `of` counts every write of the operation that names a thing,
 * with a trace or without one.
 */
export function followedByAReadOfTheSameThing(
  operation: string,
  fromMs: number,
  workspaceId: string | null,
): { share: number; of: number; traces: number } {
  const namedWrites = sqlite
    .prepare(`select count(*) from api_calls where ${theWindow(workspaceId)} and operation = ? and ${aNamedWrite()}`)
    .pluck()
    .get(...windowArgs(fromMs, workspaceId), operation) as number
  return readBackOf(namedWrites, followedWritesSince(fromMs, workspaceId, operation).get(operation))
}

/** The threshold that would justify building a continuation hint, stated once and read by the page. */
export const HINT_THRESHOLD = { share: 0.3, occurrences: 20, traces: 3 }

/** One question an agent went outside for, in the five outcomes §8.3 separates. */
export interface GapReading {
  wanted: string
  question: string
  answeredBy: string | null
  boundary: number
  boundaryDisputed: number
  capabilityGap: number
  notFound: number
  machineNotRecorded: number
  unsure: number
  traces: number
}

/**
 * WHAT AGENTS WENT OUTSIDE MOLE OFFICE FOR, GROUPED BY THE QUESTION AND NEVER BY THE FILE.
 *
 * FIVE OUTCOMES, NOT FOUR, AND NONE OF THEM OVERRULES THE AGENT. Each is a comparison of two things
 * Mole Office already holds: what the agent judged, and whether Mole Office has an operation for that question.
 * An agent's habit of calling everything a boundary therefore shows up as a number rather than as
 * silence.
 *
 * THE FIFTH IS `processes-and-ports` FROM ANOTHER MACHINE. That question is answered by
 * `runtime.resources`, which reports what is running on the machine Mole Office runs on — so a report from
 * another machine may be about that machine or about Mole Office's host, and Mole Office cannot tell which.
 * Folding it into `boundary` would decide for the agent which machine it meant, on the one table
 * built to keep an agent's own verdict honest.
 */
export function gapReadings(
  claims: readonly { wanted: string; verdict: string; traceId: string | null; remote: boolean }[],
): GapReading[] {
  return WANTED.map((entry) => {
    const mine = claims.filter((c) => c.wanted === entry.name)
    const answered = entry.answeredBy !== null
    const machineNotRecorded = mine.filter((c) => c.wanted === 'processes-and-ports' && c.remote).length
    const rest = mine.filter((c) => !(c.wanted === 'processes-and-ports' && c.remote))
    return {
      wanted: entry.name,
      question: entry.question,
      answeredBy: entry.answeredBy,
      boundary: rest.filter((c) => c.verdict === 'boundary' && !answered).length,
      boundaryDisputed: rest.filter((c) => c.verdict === 'boundary' && answered).length,
      capabilityGap: rest.filter((c) => c.verdict === 'gap' && !answered).length,
      notFound: rest.filter((c) => c.verdict === 'gap' && answered).length,
      machineNotRecorded,
      unsure: rest.filter((c) => c.verdict === 'unsure').length,
      traces: new Set(mine.map((c) => c.traceId).filter((t): t is string => t !== null)).size,
    }
  }).filter((r) => r.boundary + r.boundaryDisputed + r.capabilityGap + r.notFound + r.machineNotRecorded + r.unsure > 0)
}

/** One crossing, or one approaching, with the numbers that decided it. */
/** What a pattern means, in English and as a code. The English is the word list's own. */
function patternSays(code: 'usagePatternChain' | 'usagePatternBloat' | 'usagePatternRefused' | 'usagePatternGapLacks' | 'usagePatternGapUnfound' | 'usagePatternPolling'): { says: string; said: DevSaying } {
  const said = saying(code, {})
  return { says: inEnglish(said), said }
}

export interface PatternReading {
  key: string
  crossed: boolean
  /** What the threshold counts, and what it counts to. */
  saw: number
  needs: number
  traces: number
  needsTraces: number
  survivesPrune: boolean
  says: string
  /** `says` as a code the usage page draws in its own language (src/shared/dev-sayings.ts). */
  said: DevSaying
}

/**
 * FROM A COUNT TO SOMETHING WORTH FILING — AND NOTHING IS FILED AUTOMATICALLY.
 *
 * The server computes crossings and publishes them; a person or an agent decides whether one is
 * worth a record. Automatic filing would produce the large numbers of noisy problems from every slow
 * request that have been ruled out explicitly, and it would put an agent's judgement into the corpus
 * with nobody's name on it.
 *
 * EVERY PATTERN COMES BACK WHETHER IT CROSSED OR NOT, with the numbers, so a reader can see one
 * approaching rather than only after it arrives.
 */
export function patternReadings(
  fromMs: number,
  workspaceId: string | null,
  claims: readonly GapReading[],
  now: number,
): PatternReading[] {
  const out: PatternReading[] = []
  // ONLY THE TRACED ROWS COME BACK AS ROWS, because a stretch is a run of calls inside one trace and
  // `stretchesOf` drops every other row. Every other count below comes from one grouped query.
  //
  // THEY COME BY TRACE AND NOT BY TIME, through `api_calls_trace_idx`, which lets SQLite skip the
  // rows with no trace. On the test's 703,341 rows that is 1 to 2 ms instead of 55, because the
  // time index would walk every row to find the 5,383 traced ones. The readings do not depend on the
  // order across traces: `stretchesOf` cuts each trace on its own, and inside one trace this order is
  // time and then rowid, which is the order `order by at_ms` gives.
  const traced = sqlite
    .prepare(
      `select trace_id as traceId, at_ms as atMs, purpose, operation from api_calls indexed by api_calls_trace_idx ` +
        `where trace_id is not null and ${theWindow(workspaceId)} order by trace_id, at_ms`,
    )
    .all(...windowArgs(fromMs, workspaceId)) as Pick<CallRow, 'traceId' | 'atMs' | 'purpose' | 'operation'>[]
  const stretches = stretchesOf(traced, now)

  // chain: an operation called five or more times inside one stretch, in three or more traces.
  const chainTraces = new Map<string, Set<string>>()
  const chainMost = new Map<string, number>()
  for (const stretch of stretches) {
    const counts = new Map<string, number>()
    for (const row of stretch.rows) {
      if (row.operation === null) continue
      counts.set(row.operation, (counts.get(row.operation) ?? 0) + 1)
    }
    for (const [operation, n] of counts) {
      chainMost.set(operation, Math.max(chainMost.get(operation) ?? 0, n))
      if (n >= 5) {
        const set = chainTraces.get(operation) ?? new Set<string>()
        set.add(stretch.traceId)
        chainTraces.set(operation, set)
      }
    }
  }
  for (const [operation, most] of chainMost) {
    const traces = chainTraces.get(operation)?.size ?? 0
    out.push({
      key: `chain:${operation}`,
      crossed: most >= 5 && traces >= 3,
      saw: most,
      needs: 5,
      traces,
      needsTraces: 3,
      survivesPrune: true,
      ...patternSays('usagePatternChain'),
    })
  }

  // HOW MANY TRACES CALLED EACH OPERATION, over every call in the window. Only a traced row has a
  // trace, so the traced rows above are all this needs.
  const tracesOf = new Map<string, Set<string>>()
  for (const row of traced) {
    if (row.operation === null || row.traceId === null) continue
    const set = tracesOf.get(row.operation)
    if (set === undefined) tracesOf.set(row.operation, new Set([row.traceId]))
    else set.add(row.traceId)
  }
  // ONE GROUPED QUERY FOR THE COST, THE REFUSALS AND THE POLLING: one row per operation, actor and
  // reply size, saying how many calls it holds in the window, how many in the last 24 hours, how many
  // of the last seven days' calls were refused, and when the first of the last 24 hours' calls was.
  // The actor and the size stay as stored, null included, and are read below: the polling reading
  // counts a call with no actor under the empty actor, the cost reading counts a missing size as 0,
  // and the polling reading counts it under the size -1. Grouping by the stored values is about 40 ms
  // faster on the test's rows than grouping by the rewritten ones.
  const sevenDaysAgo = now - 7 * DAY
  const dayAgo = now - DAY
  const cells = sqlite
    .prepare(
      `select operation, actor_id as actorId, bytes, count(*) as calls, sum(at_ms >= ?) as lastDay, ` +
        `sum(at_ms >= ? and status >= 400 and status < 500) as refused, ` +
        `min(case when at_ms >= ? then at_ms end) as firstInLastDay ` +
        `from api_calls indexed by ${BY_PROJECT_AND_OPERATION} where ${theWindow(workspaceId)} and operation is not null ` +
        `group by operation, actor_id, bytes`,
    )
    .all(dayAgo, sevenDaysAgo, dayAgo, ...windowArgs(fromMs, workspaceId)) as {
    operation: string
    actorId: string | null
    bytes: number | null
    calls: number
    lastDay: number
    refused: number
    firstInLastDay: number | null
  }[]
  const perOperation = new Map<string, { sizes: Map<number, number>; refused: number }>()
  for (const cell of cells) {
    let mine = perOperation.get(cell.operation)
    if (mine === undefined) {
      mine = { sizes: new Map<number, number>(), refused: 0 }
      perOperation.set(cell.operation, mine)
    }
    const size = cell.bytes ?? 0
    mine.sizes.set(size, (mine.sizes.get(size) ?? 0) + cell.calls)
    mine.refused += cell.refused
  }

  // cost: a read whose median reply is 100 KB or more, over three or more traces.
  for (const [operation, { sizes }] of perOperation) {
    const bytesMedian = medianOfCounts(sizes) ?? 0
    const traces = tracesOf.get(operation)?.size ?? 0
    if (bytesMedian === 0) continue
    out.push({
      key: `cost:${operation}`,
      crossed: bytesMedian >= 100_000 && traces >= 3,
      saw: Math.round(bytesMedian),
      needs: 100_000,
      traces,
      needsTraces: 3,
      survivesPrune: true,
      ...patternSays('usagePatternBloat'),
    })
  }

  // refused: ten or more refusals in seven days. `traces` counts every trace that called the
  // operation in the window, refused or not.
  for (const [operation, { refused }] of perOperation) {
    if (refused === 0) continue
    out.push({
      key: `refused:${operation}`,
      crossed: refused >= 10,
      saw: refused,
      needs: 10,
      traces: tracesOf.get(operation)?.size ?? 0,
      needsTraces: 0,
      survivesPrune: true,
      ...patternSays('usagePatternRefused'),
    })
  }

  // gap: the same question met in three or more distinct traces, with the verdict `gap`.
  for (const claim of claims) {
    const met = claim.capabilityGap + claim.notFound
    if (met === 0) continue
    out.push({
      key: `gap:${claim.wanted}`,
      crossed: claim.traces >= 3,
      saw: met,
      needs: 1,
      traces: claim.traces,
      needsTraces: 3,
      survivesPrune: true,
      ...patternSays(claim.answeredBy === null ? 'usagePatternGapLacks' : 'usagePatternGapUnfound'),
    })
  }

  // poll: 100 or more calls in 24 hours from one actor, with 95% of replies the same size.
  //
  // Each operation and actor that made twenty calls or more in the last 24 hours gives one reading,
  // with how many of its replies had the commonest size. Two actors of one operation give two readings with the same key, so they come out in the
  // order each actor first called it in those 24 hours.
  const pollers = new Map<string, Map<string, { calls: number; sizes: Map<number, number>; firstAtMs: number }>>()
  for (const cell of cells) {
    if (cell.lastDay === 0 || cell.firstInLastDay === null) continue
    let perActor = pollers.get(cell.operation)
    if (perActor === undefined) {
      perActor = new Map()
      pollers.set(cell.operation, perActor)
    }
    const actor = cell.actorId ?? ''
    let mine = perActor.get(actor)
    if (mine === undefined) {
      mine = { calls: 0, sizes: new Map<number, number>(), firstAtMs: cell.firstInLastDay }
      perActor.set(actor, mine)
    }
    const size = cell.bytes ?? -1
    mine.calls += cell.lastDay
    mine.sizes.set(size, (mine.sizes.get(size) ?? 0) + cell.lastDay)
    mine.firstAtMs = Math.min(mine.firstAtMs, cell.firstInLastDay)
  }
  const polling = [...pollers].flatMap(([operation, perActor]) =>
    [...perActor]
      .filter(([, mine]) => mine.calls >= 20)
      .map(([actor, mine]) => ({ operation, actor, calls: mine.calls, commonest: Math.max(...mine.sizes.values()), firstAtMs: mine.firstAtMs })),
  )
  const firstRowid = sqlite
    .prepare(
      `select min(rowid) from api_calls indexed by api_calls_at_idx ` +
        `where ${theWindow(workspaceId)} and at_ms = ? and operation = ? and coalesce(actor_id, '') = ?`,
    )
    .pluck()
  const inOrder = inFirstCalledOrder(polling, (p) =>
    Number(firstRowid.get(...windowArgs(fromMs, workspaceId), p.firstAtMs, p.operation, p.actor)),
  )
  for (const { operation, calls, commonest } of inOrder) {
    out.push({
      key: `poll:${operation}`,
      crossed: calls >= 100 && commonest / calls >= 0.95,
      saw: calls,
      needs: 100,
      traces: 0,
      needsTraces: 0,
      // IT DOES NOT SURVIVE THE PRUNE, and that is deliberate rather than an omission. It is a
      // 24-hour count over untraced rows, which go at fourteen days with no summary at all — and a
      // fix for something polling now is checked against the next 24 hours, not against last spring.
      survivesPrune: false,
      ...patternSays('usagePatternPolling'),
    })
  }
  return out.sort((a, b) => Number(b.crossed) - Number(a.crossed) || a.key.localeCompare(b.key))
}

/** An ordered pair of operations that followed each other inside one stretch. */
export interface SequenceReading {
  from: string
  to: string
  occurrences: number
  stretches: number
  traces: number
}

/**
 * WHICH OPERATION FOLLOWS WHICH, AS PAIRS.
 *
 * PAIRS AND NOT LONGER RUNS. Nothing has measured a need for three-step sequences, and the pair
 * table is exactly what would show whether one exists: if `A → B` and `B → C` are both top rows,
 * that is the evidence for going further.
 */
export function sequenceReadings(
  rows: readonly Pick<CallRow, 'traceId' | 'atMs' | 'purpose' | 'operation'>[],
  now: number,
): SequenceReading[] {
  // TWO LEVELS AND NOT ONE JOINED KEY. A joined key needs a separator, and the separator this file
  // reached for twice was a literal NUL byte, which a test deleted on 13 November 2026 failed on: a NUL in a source
  // file makes grep match nothing in that file. A nested map has nothing to join.
  const pairs = new Map<string, Map<string, { occurrences: number; stretches: Set<number>; traces: Set<string> }>>()
  for (const [index, stretch] of stretchesOf(rows, now).entries()) {
    for (let i = 1; i < stretch.rows.length; i += 1) {
      const from = stretch.rows[i - 1]!.operation
      const to = stretch.rows[i]!.operation
      if (from === null || to === null) continue
      const seconds = pairs.get(from) ?? new Map<string, { occurrences: number; stretches: Set<number>; traces: Set<string> }>()
      const entry = seconds.get(to) ?? { occurrences: 0, stretches: new Set<number>(), traces: new Set<string>() }
      entry.occurrences += 1
      entry.stretches.add(index)
      entry.traces.add(stretch.traceId)
      seconds.set(to, entry)
      pairs.set(from, seconds)
    }
  }
  const out: SequenceReading[] = []
  for (const [from, seconds] of pairs) {
    for (const [to, entry] of seconds) {
      out.push({ from, to, occurrences: entry.occurrences, stretches: entry.stretches.size, traces: entry.traces.size })
    }
  }
  return out.sort((a, b) => b.occurrences - a.occurrences)
}

/** What one agent's verdict was, as the outside-read table stores it. */
export type StoredVerdict = Verdict

/** The question behind a stored `wanted` value, or null when the list does not hold it. */
export function questionFor(wanted: string): string | null {
  return wantedNamed(wanted)?.question ?? null
}
