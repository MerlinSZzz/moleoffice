// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RUNS A SENT REVIEW WROTE AND NO WORKER TOOK ARE WITHDRAWN, AND THEIR KEYS ARE REVOKED. The data half of
 * migration 0253 (`a_sent_reviews_waiting_runs_are_withdrawn`), in wave 13u round 19. It stands on a decision
 * and on the answers yMYX20nfBuep and 69_KJoAwXeKg. One transaction with every other
 * data step.
 *
 * ---------------------------------------------------------------------------------------
 * WHY
 * ---------------------------------------------------------------------------------------
 *
 * A sent review writes no run now. It gives each recipient one message from the person, with a delivery row, holding
 * every comment, and the delivery row is what carries the comments to the agent. The runs the old send wrote and no
 * worker took would hand the same comments over a second time if tools/agent-worker.mjs ever picked one up. The
 * request was that they be closed with a reason that names this change.
 *
 * `withdrawn` IS A RUN STATE OF ITS OWN, and not `failed`: nothing was tried, and `failed` would say something was.
 * RUN_STATES in src/server/lib/agents.ts declares it, and `saysOf` there shows the reason written below.
 *
 * ---------------------------------------------------------------------------------------
 * DECISION 13: IT REWRITES STORED VALUES, AND SAYS SO HERE
 * ---------------------------------------------------------------------------------------
 *
 * There is no additive way to do this. A run's state is the one thing a worker reads to decide whether to take it, so
 * the run has to stop reading `queued`. It writes three columns of `agent_runs` and two of `held_keys`:
 *
 *   - ON EACH RUN in a sent review's conversation (`reviews.sent_thread_id`), never claimed (`claimed_by` IS NULL),
 *     and queued or declined: `state` becomes `withdrawn`, `ended_at` the moment of this step, and `error` the
 *     reason. A declined run was claimed before it was declined and keeps `claimed_by`, so in practice this matches
 *     queued runs; the condition is kept in the words that were approved. A run a worker took, and every run of any other
 *     conversation, is left as it is. It names no run by its id.
 *   - ON THE KEY EACH SUCH RUN NAMES in `request.agentKeyId`, when it is not revoked already: `revoked_at` and
 *     `revoked_because`, the statement `revokeTheKeyNamed` in src/server/lib/keys.ts runs. Every other way a run ends
 *     revokes its key, and a key left live would prove its agent for a run that will never run. The key's private
 *     file under agent-run-keys/ stays on disk: this step writes only the database, and a file whose key is revoked
 *     proves nothing.
 *
 * It deletes nothing, writes no record, no change row and no revision: neither table is a record.
 *
 * ---------------------------------------------------------------------------------------
 * IT RUNS ONLY IN THE RUN THAT APPLIES 0253
 * ---------------------------------------------------------------------------------------
 *
 * Every data step runs on every `migrateInPlace`. This one must not: a run the person starts later in a sent
 * review's conversation is a real request, and a later start of the server would withdraw it. So `migrateInPlace`
 * hands this step the tags it applied, and it does its work only when 0253 is one of them. 0253's `.sql` carries one
 * statement that reads and writes nothing, so the journal row drizzle writes for it is what says the work was done.
 * A data step writes the rows rather than the `.sql` file because tests/migration.test.ts allows no UPDATE in a
 * migration file that is not on its REBUILDS list.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT STOPS IT, WITH NOTHING WRITTEN
 * ---------------------------------------------------------------------------------------
 *
 * A run whose `request` is not a JSON object, or whose `agentKeyId` is there and is not a string, stops the step with
 * an error naming the run: this step cannot tell whether such a run holds a live key, and leaving one live would be
 * the silent half of the work.
 */
import type Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { nowStamp } from '../../shared/time.ts'
import { agentRuns } from './schema.ts'

/** The migration whose data half this is. The merge queue renames it here if it renumbers the migration. */
export const THE_MIGRATION = '0253_a_sent_reviews_waiting_runs_are_withdrawn'

/** What a withdrawn run's `error` says, and what its row on the Agents page shows. */
export const WHY_THE_RUN_WAS_WITHDRAWN =
  'Withdrawn before any worker took it, so nothing was tried. A sent review now gives each agent one message from the ' +
  'person and starts no run, and this run was written by the send before that. The comments it carried were not ' +
  'handed over by it.'

/** What a withdrawn run's key row says in `revoked_because`. */
export const WHY_ITS_KEY_WAS_REVOKED =
  'Its run was withdrawn before any worker took it: a sent review gives each agent one message now, and starts no run.'

export interface Report {
  /** False when this run of the migrations did not apply 0253, so nothing was read or written. */
  ran: boolean
  /** The runs set to `withdrawn`, in the order they were written. */
  withdrawn: string[]
  /** The keys revoked, one for each withdrawn run that named a key still live. */
  keysRevoked: string[]
  /** The rows the two UPDATEs changed, run rows and key rows together, as SQLite counted them. */
  rowsWritten: number
}

interface RunRow {
  id: string
  request: string
}

/** The agent key a run's request names, or null when it names none. Throws on a request this step cannot read. */
function theKeyItNames(run: RunRow): string | null {
  let request: unknown
  try {
    request = JSON.parse(run.request)
  } catch {
    request = undefined
  }
  if (typeof request !== 'object' || request === null || Array.isArray(request)) {
    throw new Error(
      `The run ${run.id} is waiting in a sent review's conversation and its request is not a JSON object, so this ` +
        'step cannot tell whether it holds a live key. Nothing was written.',
    )
  }
  const key = (request as { agentKeyId?: unknown }).agentKeyId
  if (key === undefined) return null
  if (typeof key !== 'string') {
    throw new Error(
      `The run ${run.id} is waiting in a sent review's conversation and its request names a key that is not a ` +
        'string, so this step cannot revoke it. Nothing was written.',
    )
  }
  return key
}

/** Withdraw the runs a sent review left waiting, and revoke their keys, when `applied` holds 0253. */
export function withdrawTheRunsASentReviewLeftWaiting(sqlite: Database.Database, applied: readonly string[]): Report {
  const report: Report = { ran: false, withdrawn: [], keysRevoked: [], rowsWritten: 0 }
  if (!applied.includes(THE_MIGRATION)) return report
  report.ran = true
  const runs = sqlite
    .prepare(
      "SELECT id, request FROM agent_runs WHERE state IN ('queued', 'declined') AND claimed_by IS NULL " +
        'AND thread_id IN (SELECT sent_thread_id FROM reviews WHERE sent_thread_id IS NOT NULL) ORDER BY created_at, id',
    )
    .all() as RunRow[]
  const keys = runs.map((run) => theKeyItNames(run))
  const at = nowStamp()
  const revoke = sqlite.prepare('UPDATE held_keys SET revoked_at = ?, revoked_because = ? WHERE id = ? AND revoked_at IS NULL')
  // THROUGH THE DRIZZLE TABLE OBJECT, as every write of a run's state is: tests/one-run-door.test.ts refuses raw SQL
  // that writes `agent_runs.state`.
  const db = drizzle(sqlite)
  const withdraw = (id: string): number =>
    db.update(agentRuns).set({ state: 'withdrawn', endedAt: at, error: WHY_THE_RUN_WAS_WITHDRAWN }).where(eq(agentRuns.id, id)).run().changes
  runs.forEach((run, i) => {
    const key = keys[i] ?? null
    const revoked = key === null ? 0 : revoke.run(at, WHY_ITS_KEY_WAS_REVOKED, key).changes
    if (key !== null && revoked > 0) report.keysRevoked.push(key)
    report.rowsWritten += revoked + withdraw(run.id)
    report.withdrawn.push(run.id)
  })
  return report
}

/** The rows this step wrote: one per withdrawn run and one per revoked key, as SQLite counted them. */
export function rowsTheWithdrawalWrote(report: Report): number {
  return report.rowsWritten
}

/** What it did, in one sentence without the step's name: the line the preview puts after that name. */
export function whatTheWithdrawalDid(report: Report): string {
  if (report.rowsWritten === 0) {
    return report.ran
      ? 'no run was waiting in a sent review\'s conversation, so nothing was withdrawn'
      : 'this run did not apply migration 0253, so nothing was read or written'
  }
  return (
    `changed ${String(report.rowsWritten)} row(s): set ${String(report.withdrawn.length)} run(s) that were waiting in ` +
    `a sent review's conversation to withdrawn, with the moment and a reason (${report.withdrawn.join(', ')}), and ` +
    `revoked ${String(report.keysRevoked.length)} key(s) they named (${report.keysRevoked.join(', ') || 'none'})`
  )
}

/** The report as a person reads it. */
export function describeTheWithdrawal(report: Report): string {
  return `withdrawn review runs: ${whatTheWithdrawalDid(report)}`
}
