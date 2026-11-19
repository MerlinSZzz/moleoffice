// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT ONE SESSION'S START REALLY COST, READ FROM THE OFFICE'S OWN CALL LOG AND USAGE. F15 point 6.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT "THE START" MEANS, AND WHY THAT DEFINITION IS NOT MINTED HERE
 * ---------------------------------------------------------------------------------------
 *
 * From the session record's own `startedAt` to the run's first write that is not its own session
 * record. That boundary already exists: `tools/how-long-to-the-first-write.mjs` measures a cold
 * agent's reads up to "its first useful write", and for a synthetic walk with no session record yet
 * that write IS the session record's own creation. Once the entry, the onboarding read, the
 * self-registration door and the restore read exist for a real run, that run's session record is
 * usually filed before it does anything else — a hook files it, or the self-registration door does
 * — so the equivalent finish line for a REAL run is the first write that is not that bookkeeping:
 * the first row in `changes` carrying this session whose `record_id` is not the session's own id.
 * `src/server/lib/usage-agents.ts` already reads "the first row in `changes` carrying this session"
 * as a run's first useful write for a different criterion (I4); this file adds the one exclusion a
 * real run's own self-updates need and reuses the same table and the same ordering.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE EACH NUMBER COMES FROM, AND WHY NOTHING HERE READS A TRANSCRIPT
 * ---------------------------------------------------------------------------------------
 *
 * TOKENS. The run's own usage receipt (`data.usageReceipt`), through `receiptsFromRuns` in
 * usage-receipts.ts — THE ONLY PLACE ANY TOKEN IS EVER ADDED UP, called here with a set holding this
 * one run so a second summation is never written. The figure is the receipt's whole INPUT side (raw
 * input tokens plus cache reads and cache creation, combined exactly the way that file already
 * combines them). `src/shared/pick-up-cost.ts` reads the same "whole input side" figure off a
 * receipt for its own warning, and this reuses that combining rule rather than writing a second copy.
 *
 * MINUTES. The session record's own `startedAt` to the first write's own timestamp in `changes`,
 * both read through `src/shared/time.ts`'s one local-stamp reader, rounded UP to the next whole
 * minute. Rounding down would let a start that ran 2 minutes 59 seconds report "2 minutes" and pass
 * a 2-minute ceiling it did not really keep to; a start that spills one second into a third minute
 * has cost three minutes of the ceiling's own unit.
 *
 * TOOL ROUNDS ARE GONE. A decision retired them: the reading was too fine, it existed
 * for one runtime only, the transcript it read is rotated, and keeping it wasted a worker's tokens.
 * Nothing in this file opens a transcript. What replaced it is the STEP TABLE below.
 *
 * ---------------------------------------------------------------------------------------
 * THE STEPS, FROM THE OFFICE'S OWN `api_calls` ROWS
 * ---------------------------------------------------------------------------------------
 *
 * The office already writes one `api_calls` row per request, carrying `session_id`, `at_ms` and
 * `operation`. `START_STEPS` in src/shared/start-cost.ts declares the steps once, each named by the
 * operations from `src/shared/ops.ts` that belong to it. For each step this file reads that step's
 * rows for this session and says when the step first and last happened and how long the start spent
 * in it. A step with no rows says so in words; it is never drawn as a zero. The last step — the
 * first write outside the session record — is a moment read from `changes`, not a request, and its
 * time is that moment.
 *
 * TOKENS ARE PER STEP ONLY WHEN A RUNTIME REALLY REPORTED THEM THAT WAY. Read `usage-receipts.ts`
 * and every adapter under `src/worker/runtimes/`: each stores ONE summed figure for the run (Codex
 * sums its `turn.completed` events, OpenCode sums its `step_finish` parts, Claude's reader gives one
 * total, Kimi reports none). None keeps a per-request figure by the time the receipt is stored, so
 * a step gets no token number rather than a share invented for it, and the receipt says so in
 * `TOKENS_ARE_WHOLE_START`. If a later runtime stores a per-request receipt, this is the one place
 * that reads it.
 *
 * ---------------------------------------------------------------------------------------
 * STORED ONCE, SO PRUNING THE CALL LOG DOES NOT LOSE IT
 * ---------------------------------------------------------------------------------------
 *
 * The first time the office measures an ended start it writes the step table onto the session
 * record's own `data.startSteps`. Every later read uses the stored table, so the receipt survives
 * the fourteen-day pruning of `api_calls`. A start whose table was never stored and whose rows are
 * already gone reads the same as one whose steps nobody measured: the step times are absent and are
 * said to be absent, never drawn as zeros.
 *
 * ---------------------------------------------------------------------------------------
 * ABSENCE IS NOT ZERO
 * ---------------------------------------------------------------------------------------
 *
 * A start whose tokens are known but whose first write has not happened is not "partly measured":
 * it has not finished starting. So `startCostOfSession` returns `{ measured: false, why }` the
 * moment any one of the three things it needs — a readable `startedAt`, a qualifying first write, a
 * usage receipt with a token count — is not there, and says in one sentence which one.
 */
import { sqlite } from '../db/client.ts'
import { parseLocalStamp, localStamp } from '../../shared/time.ts'
import { receiptsFromRuns } from './usage-receipts.ts'
import {
  START_COST_CEILING,
  START_STEPS,
  TOKENS_ARE_WHOLE_START,
  startCostOverage,
  type StartCost,
  type StartCostPanel,
  type StartCostRow,
  type StartStepReading,
} from '../../shared/start-cost.ts'
import type { PanelRecord } from '../../shared/types.ts'
import { getRecord, patchRecord, type Actor } from './records.ts'
import { moleOffice } from '../../shared/participants.ts'

/** The office writes its own step table in its own name, and never in an agent's. */
function theOffice(): Actor { return { type: 'system', id: moleOffice().id } }
/** The first write under this session that is not a write to the session's own record. */
interface FirstWriteOutsideTheSession {
  atMs: number
  recordId: string
}

/**
 * THE FIRST ROW IN `changes` FOR THIS SESSION WHOSE RECORD IS NOT THE SESSION ITSELF.
 *
 * Ordered by `rowid`, not by `at`: `changes.id` is a random nanoid (`logChange` in records.ts), so
 * it carries no order, and `at` alone can tie within the same second on a burst of writes. `rowid`
 * only ever grows — nothing deletes from `changes` — and `src/server/lib/records.ts` already orders
 * an unread-since cursor on it for the same reason. Null means either that nothing has been written
 * under this session at all, or that everything written under it so far is the session's own
 * record: a start that has not made a real write yet has not finished starting, which this file
 * reads as unmeasured rather than as zero.
 */
function firstWriteOutsideTheSession(sessionId: string): FirstWriteOutsideTheSession | null {
  const row = sqlite
    .prepare(
      'select record_id as recordId, at from changes where session_id = ? and record_id != ? order by rowid asc limit 1',
    )
    .get(sessionId, sessionId) as { recordId: string; at: string } | undefined
  if (row === undefined) return null
  const atMs = parseLocalStamp(row.at)
  if (atMs === null) return null
  return { atMs, recordId: row.recordId }
}

/**
 * WHEN THE SESSION RECORD ITSELF WAS FIRST WRITTEN.
 *
 * The session record's own creation is the first thing a start does, and it is not an `api_calls`
 * row carrying this session's id: the hook files it before the record id exists. So the registering
 * step reads it here, from the session record's own `create` row, and folds it into the step's
 * window. Only `create` is read: the table this file writes back onto the session must never become
 * the thing the step is timed from.
 */
function sessionRecordFirstWriteMs(sessionId: string): number | null {
  const row = sqlite
    .prepare("select at from changes where record_id = ? and op = 'create' order by rowid asc limit 1")
    .get(sessionId) as { at: string } | undefined
  if (row === undefined) return null
  return parseLocalStamp(row.at)
}

/** One `api_calls` row of this session, as the step arithmetic needs it. */
interface CallRow {
  atMs: number
  operation: string | null
  ms: number
}

/** The step table a session already carries, or null when nobody has stored one. */
function storedStepsOf(record: PanelRecord): StartStepReading[] | null {
  const held = record.data['startSteps']
  return Array.isArray(held) ? (held as StartStepReading[]) : null
}

/**
 * THE STEPS OF ONE START, worked out from this session's own `api_calls` rows and its first write.
 *
 * A step with no row of its kind leaves `firstAt`, `lastAt` and `spentMs` off entirely. The last
 * step has no operations: it is the first write itself, and its time is that moment from `changes`.
 * Tokens are left off every step, because no stored receipt reports them per request; the receipt
 * carries `TOKENS_ARE_WHOLE_START` beside the table so a reader is told why.
 */
export function startStepsOfSession(record: PanelRecord, firstWriteAtMs: number): StartStepReading[] {
  const rows = sqlite
    .prepare('select at_ms as atMs, operation, ms from api_calls where session_id = ? order by at_ms asc')
    .all(record.id) as CallRow[]
  const sessionWriteMs = sessionRecordFirstWriteMs(record.id)

  return START_STEPS.map((definition): StartStepReading => {
    if (definition.endsTheStart === true) {
      return {
        name: definition.name,
        says: definition.says,
        operations: [],
        requests: 0,
        firstAt: localStamp(new Date(firstWriteAtMs)),
        lastAt: localStamp(new Date(firstWriteAtMs)),
        spentMs: 0,
        tokensSays: TOKENS_ARE_WHOLE_START,
        endsTheStart: true,
      }
    }

    const mine = rows.filter((row) => row.operation !== null && definition.operations.includes(row.operation))
    const times: number[] = mine.map((row) => row.atMs)
    // THE SESSION RECORD'S OWN FIRST WRITE BELONGS TO REGISTERING. Its `api_calls` row does not
    // carry this session's id, so folding the record's own create time in here is the only way the
    // step can be timed from the office's own trace. It never fires for any other step.
    if (definition.name === 'registering' && sessionWriteMs !== null) times.push(sessionWriteMs)

    if (times.length === 0) {
      return { name: definition.name, says: definition.says, operations: definition.operations, requests: 0 }
    }
    const first = Math.min(...times)
    const last = Math.max(...times)
    const spentMs = times.length === 1 ? (mine.length === 1 ? Math.round(mine[0]!.ms) : 0) : last - first
    return {
      name: definition.name,
      says: definition.says,
      operations: definition.operations,
      requests: mine.length,
      firstAt: localStamp(new Date(first)),
      lastAt: localStamp(new Date(last)),
      spentMs,
      tokensSays: TOKENS_ARE_WHOLE_START,
    }
  })
}

/**
 * WRITE THE STEP TABLE ONCE, so the receipt outlives the call log it was read from.
 *
 * A failure here is caught and said in the log: a start that cannot be recorded must not stop the
 * panel from answering with the numbers it does have. The next read tries again.
 */
function rememberStartSteps(recordId: string, steps: StartStepReading[]): void {
  try {
    patchRecord(recordId, { dataPatch: { startSteps: steps } }, theOffice())
  } catch (err) {
    // INVARIANT 4 READ CAREFULLY: catch only what can honestly be handled. A step table that could
    // not be stored is handleable; a Runtime page that cannot be read is not.
    console.error(`mole-office: a start's step table was not stored on session ${recordId}`, err)
  }
}

/**
 * WHOLE MINUTES, ROUNDED UP. See the file header: a start that spills into a third minute has cost
 * three, not two. Clamped at zero for a `firstWrite` that somehow precedes `startedAt` — a clock
 * question this file cannot resolve — rather than printing a negative number of minutes.
 */
function wholeMinutesRoundedUp(fromMs: number, toMs: number): number {
  return Math.max(0, Math.ceil((toMs - fromMs) / 60_000))
}

/**
 * ONE SESSION'S START, OR WHY THERE IS NONE. Never typed by an agent: every field this reads is
 * either the trace (`changes`, `api_calls`) or the usage the run's own receipt reported.
 */
export function startCostOfSession(record: PanelRecord): StartCost {
  const startedAtRaw = record.data['startedAt']
  const startedAtMs = typeof startedAtRaw === 'string' ? parseLocalStamp(startedAtRaw) : null
  if (startedAtMs === null) {
    return { measured: false, why: "This session's record carries no startedAt, so its start cannot be timed." }
  }

  const firstWrite = firstWriteOutsideTheSession(record.id)
  if (firstWrite === null) {
    return {
      measured: false,
      why:
        "Nobody has written anything under this session yet that is not its own session record, so its start " +
        'has not finished — that is not a start that cost nothing.',
    }
  }

  const receipts = receiptsFromRuns([{ id: record.id, data: record.data }])
  if (receipts.missingReceipts > 0) {
    return { measured: false, why: 'This session has no usage receipt, so nobody measured its tokens.' }
  }
  const tokens = receipts.overall.values.inputTokens
  if (tokens === undefined || receipts.overall.supplied.inputTokens === 0) {
    return { measured: false, why: "This session's usage receipt did not report input tokens, so nobody measured them." }
  }

  const stored = storedStepsOf(record)
  const steps = stored ?? startStepsOfSession(record, firstWrite.atMs)
  if (stored === null) rememberStartSteps(record.id, steps)

  const minutes = wholeMinutesRoundedUp(startedAtMs, firstWrite.atMs)
  return {
    measured: true,
    tokens,
    minutes,
    over: startCostOverage(tokens, minutes),
    steps,
    tokensSays: TOKENS_ARE_WHOLE_START,
  }
}

/** How many of the most recent sessions the Runtime page's panel looks at. */
export const RECENT_STARTS_LIMIT = 20

/**
 * THE MOST RECENT SESSIONS, EACH WITH WHAT ITS START COST. The ceiling is read from the one
 * declaration; each row is measured from the office's own trace and usage and, once measured, its
 * step table is stored on the session record so it survives the call log being pruned.
 */
export function recentStartCosts(limit: number = RECENT_STARTS_LIMIT): StartCostPanel {
  const ids = sqlite
    .prepare("select id from records where kind = 'session' and deleted_at is null order by created_at desc limit ?")
    .all(limit) as { id: string }[]

  const recent: StartCostRow[] = []
  for (const { id } of ids) {
    const record = getRecord(id)
    if (record === null) continue
    recent.push({ sessionId: record.id, title: record.title, cost: startCostOfSession(record) })
  }

  return {
    ceiling: START_COST_CEILING,
    recent,
    overCeilingCount: recent.filter((row) => row.cost.measured && row.cost.over.length > 0).length,
    unmeasuredCount: recent.filter((row) => !row.cost.measured).length,
  }
}
