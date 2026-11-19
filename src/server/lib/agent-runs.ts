// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RUNS ONE AGENT WORKED AS, AND WHAT EACH RUN DECLARED. Criterion P91, amended 12 September 2026.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS READS `ranAs` AND NOT A GLOBAL LIST
 * ---------------------------------------------------------------------------------------
 *
 * An agent is the registered identity and a run is one start of it. A run says which identity it
 * worked as in `data.ranAs`, one entry per project, and that is the binding the criterion names, so
 * this reader asks each session record the same question `ranAsIn` answers everywhere else. It does
 * NOT list every session and filter by a title or a handle, which would put a run under the wrong
 * agent the first time two agents shared a word.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS HONESTLY KNOWABLE, AND WHAT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * The model and the effort are read off the run's own record, and absent is "the run did not say",
 * never a default. The tokens are the runtime's own receipt, summed by the product's one arithmetic
 * (`receiptsFromRuns`) so this page and `GET /api/usage/agents` cannot come to different totals.
 * A run with no receipt is counted as a run with no receipt, not as zero tokens.
 *
 * A COMPACTION IS WHAT THE SESSION HOOK REPORTED. Since wave 13k round 46 tools/session-hook.mjs
 * records one in the run's `data.compactions` when Claude Code starts the session again with
 * SessionStart source `compact`. So the sentence for a run with none follows its runtime: a Claude
 * Code run says none is recorded, another runtime says "not reported by this runtime", and a run that
 * did not say its runtime says that is not known. The sum on the agent counts the Claude Code runs
 * alone and says which runs it cannot see (wave 13k round 52). A compaction is never inferred from a
 * gap, a token count or a restart; that would be the second invariant broken.
 *
 * ---------------------------------------------------------------------------------------
 * THE INSPECTOR'S USAGE IS COUNTED ON THE INSPECTOR
 * ---------------------------------------------------------------------------------------
 *
 * A run the office asked for is its own session record bound to its own identity, so the receipt
 * from a check lands on the inspector's page and never on the run it checked. This reader touches
 * no other run's receipt to make that true; the per-run reading is the whole mechanism.
 */

import { sqlite } from '../db/client.ts'
import { ranAsIn } from '@shared/ran-as.ts'
import { theNextTryOfALongWait } from '../../config/a-long-wait.mjs'
import { receiptsFromRuns, type ReceiptRun } from './usage-receipts.ts'
import {
  AGENT_RUNS_WORDS,
  type ADeclaredPair,
  type AReportedCompaction,
  type OneOfItsRuns,
  type TheAgentsCompactions,
  type TheAgentsDeclarations,
  type TheAgentsRuns,
} from '../../shared/profile.ts'
import type { UsageReceipt } from '../../shared/usage-receipts.ts'
import type { AgentRuntime } from '../../shared/participants.ts'
import { allInEnglish, saying, type DevSaying } from '../../shared/dev-sayings.ts'

/** The one runtime whose compactions anything records: the session hook's, on SessionStart source `compact`. */
const THE_RUNTIME_THAT_REPORTS_COMPACTIONS: AgentRuntime = 'claude-code'

/** A session record as this reader needs it. */
interface SessionRow {
  id: string
  title: string
  createdAt: string
  data: string
}

/** A stored string that is not empty, or null. `/` absent` is not read as a value. */
function word(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/** A stored `served` object, handed on as it is; what it says is worked out by `theModelThatAnsweredSentence`. */
function isServed(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * WHAT THE RUN'S OWN RUNTIME REPORTED ABOUT COMPACTIONS.
 *
 * THE SESSION HOOK REPORTS THEM, since wave 13k round 46. When Claude Code starts a session again with
 * SessionStart source `compact`, tools/session-hook.mjs appends one `{at, what}` to the run's
 * `data.compactions`, with `at` from the office's clock (GET /api/after-a-compaction's `answeredAt`).
 * That is the runtime's own event, so it is a real observation. No other runtime reports one, and a
 * run with none answers the empty list. This function invents nothing: it is deliberately not a
 * reader of `usageReceipt`, of the gap between two runs, or of a restart, because none of those is a
 * compaction and reading one out of them is the substitution this criterion warns against.
 *
 * Exported so GET /api/after-a-compaction reads a run's compactions the same way (invariant 9).
 */
export function compactionsThisRunReported(data: Record<string, unknown>): AReportedCompaction[] {
  const held = data['compactions']
  if (!Array.isArray(held)) return []
  const out: AReportedCompaction[] = []
  for (const entry of held) {
    if (typeof entry !== 'object' || entry === null) continue
    const at = word((entry as Record<string, unknown>)['at'])
    if (at === null) continue
    out.push({ at, what: word((entry as Record<string, unknown>)['what']) })
  }
  return out
}

/** THE SENTENCE BESIDE ONE RUN'S COMPACTIONS, by what is recorded and the runtime the run said. */
function compactionsSayFor(compactions: readonly AReportedCompaction[], runtime: string | null): string {
  if (compactions.length > 0) return AGENT_RUNS_WORDS.reportedByTheSessionHook
  if (runtime === null) return AGENT_RUNS_WORDS.runtimeNotSaid
  return runtime === THE_RUNTIME_THAT_REPORTS_COMPACTIONS ? AGENT_RUNS_WORDS.noneRecordedOnClaudeCode : AGENT_RUNS_WORDS.notReportedByThisRuntime
}

/**
 * THE COMPACTIONS SUMMED OVER THE RUNS, counted on the Claude Code runs alone because nothing records another
 * runtime's. It says how many runs the count covers and how many it cannot see. With no Claude Code run there is
 * nothing to count, so it gives no number.
 */
function compactionsCountedOver(runs: readonly OneOfItsRuns[]): TheAgentsCompactions {
  const claudeCode = runs.filter((run) => run.runtime === THE_RUNTIME_THAT_REPORTS_COMPACTIONS)
  const noRuntimeRuns = runs.filter((run) => run.runtime === null).length
  const otherRuntimeRuns = runs.length - claudeCode.length - noRuntimeRuns
  const recorded = claudeCode.length === 0 ? null : claudeCode.reduce((sum, run) => sum + run.compactions.length, 0)
  const said: DevSaying[] = []
  if (runs.length > 0) {
    if (recorded === null) said.push(saying('agentCompactionsNoClaudeCodeRun', {}))
    else {
      said.push(recorded === 0 ? saying('agentCompactionsNoneRecorded', {}) : saying('agentCompactionsRecorded', { n: recorded }))
      said.push(saying('agentCompactionsCover', { n: claudeCode.length }))
    }
    said.push(saying('agentCompactionsOnlyClaudeCode', {}))
    if (otherRuntimeRuns > 0) said.push(saying('agentCompactionsOtherRuntime', { n: otherRuntimeRuns }))
    if (noRuntimeRuns > 0) said.push(saying('agentCompactionsNoRuntime', { n: noRuntimeRuns }))
  }
  return { recorded, claudeCodeRuns: claudeCode.length, otherRuntimeRuns, noRuntimeRuns, said, says: allInEnglish(said) }
}

/** THE MODELS AND EFFORTS THE RUNS DECLARED, each pair with how many runs declared it, most runs first. */
function declaredOver(runs: readonly OneOfItsRuns[]): TheAgentsDeclarations {
  const pairs: ADeclaredPair[] = []
  let neither = 0
  for (const run of runs) {
    if (run.model === null && run.effort === null) {
      neither += 1
      continue
    }
    const held = pairs.find((pair) => pair.model === run.model && pair.effort === run.effort)
    if (held === undefined) pairs.push({ model: run.model, effort: run.effort, runs: 1 })
    else held.runs += 1
  }
  // A STABLE SORT, so pairs with as many runs keep the order of the newest run that declared them.
  return { pairs: pairs.sort((one, other) => other.runs - one.runs), neither }
}

/**
 * EVERY RUN BOUND TO ONE AGENT IN ONE PROJECT, newest first.
 *
 * `agentRecordId` is the id of the `agent` RECORD this project holds for the agent, or null because
 * it holds none. Null is a real answer and is reported as itself rather than as an empty run list.
 */
export function theAgentsRuns(agentRecordId: string | null, workspaceId: string): TheAgentsRuns {
  const base: TheAgentsRuns = {
    runs: [],
    totals: receiptsFromRuns([]),
    compactionsCounted: compactionsCountedOver([]),
    declared: declaredOver([]),
    runsSay: AGENT_RUNS_WORDS.noRecordHere,
    timelineSays: AGENT_RUNS_WORDS.timeline,
    looked: agentRecordId !== null,
  }
  if (agentRecordId === null) return base

  // ONLY THE SESSIONS WHOSE `ranAs` TEXT HOLDS THE RECORD'S ID ARE READ. MEASURED, 18 October 2026 (problem
  // xiv1cwqWTmhb): on an office of the live shape, parsing every session of the project here was 126 to 140 ms of
  // one profile, and most sessions are other agents' runs. The test in
  // tests/an-agents-runs-are-read-from-the-sessions-that-name-it.test.ts holds it.
  //
  // THIS NARROWS AND DOES NOT DECIDE. `ranAsIn` below is still the one reading of the binding, and every run it keeps
  // is among these rows: a run bound to this record has the id in its `ranAs` text. A row the search keeps that is not
  // bound here, such as one naming the record for another project, is dropped by `ranAsIn` as before. A row whose data
  // is not valid JSON is kept, so it fails at JSON.parse as it did. The needle is the id as JSON writes it inside a
  // string, and it is the id itself because no id holds a character JSON escapes
  // (tests/an-agents-id-is-written-into-json-as-itself.test.ts).
  const rows = sqlite
    .prepare(
      "select id, title, created_at as createdAt, data from records " +
        "where kind = 'session' and workspace_id = ? and deleted_at is null " +
        "and (case when json_valid(data) then instr(json_extract(data, '$.ranAs'), ?) > 0 else 1 end) " +
        'order by created_at desc, rowid desc',
    )
    .all(workspaceId, JSON.stringify(agentRecordId).slice(1, -1)) as SessionRow[]

  const runs: OneOfItsRuns[] = []
  const forTotals: ReceiptRun[] = []
  for (const row of rows) {
    const data = JSON.parse(row.data) as Record<string, unknown>
    // THE BINDING THE CRITERION NAMES. At most one entry per project, and it has to be THIS record.
    if (ranAsIn({ data }, workspaceId) !== agentRecordId) continue
    const receipt = (data['usageReceipt'] as UsageReceipt | undefined) ?? null
    const runtime = word(data['runtime']) ?? word(receipt?.runtime)
    const compactions = compactionsThisRunReported(data)
    const waitsLongUntil = theNextTryOfALongWait(data)
    runs.push({
      id: row.id,
      title: row.title,
      when: row.createdAt,
      state: word(data['state']) ?? 'unknown',
      ...(waitsLongUntil === null ? {} : { waitsLongUntil }),
      model: word(data['model']),
      served: isServed(data['served']) ? data['served'] : null,
      effort: word(data['effort']),
      runtime,
      usageReceipt: receipt,
      compactions,
      receiptSays: receipt === null ? AGENT_RUNS_WORDS.noReceipt : '',
      compactionsSay: compactionsSayFor(compactions, runtime),
    })
    forTotals.push({ id: row.id, data })
  }

  return {
    runs,
    totals: receiptsFromRuns(forTotals),
    compactionsCounted: compactionsCountedOver(runs),
    declared: declaredOver(runs),
    runsSay: runs.length === 0 ? AGENT_RUNS_WORDS.noRunsBound : AGENT_RUNS_WORDS.runsSay,
    timelineSays: AGENT_RUNS_WORDS.timeline,
    looked: true,
  }
}
