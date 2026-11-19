// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH AGENTS ONE AGENT STARTED STILL HAVE A RUN IN STATE running, AND THE CHILD RUNS UNDER ONE SESSION.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * At every end of a supervisor's turn the Stop hook asks which of the agents that supervisor started
 * still have a run in state running. It asked by listing the whole registry, reading one profile for
 * every worker and one record for every open child. On the live office one profile takes about 2.1
 * seconds and 1,750 statements, the office answers nobody meanwhile, and one supervisor had 74
 * workers (problem xiv1cwqWTmhb). This reading answers the same question
 * in a few statements whatever the number of workers:
 *
 *   1. the registry rows of the agents it started, one statement;
 *   2. each agent's own record in this project, one statement (`recordsForAgentsIn`);
 *   3. this project's running session rows, one statement, read through the partial index
 *      `records_session_running_idx` and never by reading every session record;
 *   4. the registry rows behind the child runs' records, one statement, and only when a session was
 *      asked about;
 *   5. the session asked about is checked with the children door's own refusal, by primary key.
 *
 * The door `GET /api/handles/:handle/running-workers` only resolves the handle, parses the query and
 * answers with what this returns, so all of the reading is here.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT COUNTS AS RUNNING
 * ---------------------------------------------------------------------------------------
 *
 * A worker is running when a running session row is bound to its record in this project by `ranAs`,
 * which is the binding the profile's own runs reading uses (`ranAsIn`). `closedAt` is not read here,
 * for the reason the profile does not read it: a closing timestamp says a period of participation
 * ended, and the session record's own state is what says whether the run is still going.
 *
 * A child is running when a running session row names the session asked about in `parentAttachment`
 * and `theAttachmentIsOpen` reads the attachment as open. That function is the one rule for whether
 * a session record is open: the attachment's own view and presence ask it too. Both are needed:
 * closing an attachment leaves the record's state unchanged (criterion in
 * tests/the-dsh-hooks-carry-messages-to-a-dsh-agent.test.ts), and a run that ended need not write a
 * closing timestamp.
 *
 * A CHILD'S HANDLE AND NAME come from the registry agent whose record the run worked as. When no
 * registry row answers, the handle is the run's `servingAgent` when that is a usable string and
 * otherwise the run's own id, and the name is the handle: the order the Stop hook has always used.
 *
 * Each handle appears once, and the list is sorted by handle. `runs` holds the running session ids
 * that put a handle there, in the order the rows were read, which is newest first.
 */

import { agentsStartedBy, type RegisteredAgent, type StartedAgentRow } from './participants.ts'
import { agentsForRecords } from '../db/agents-for-records.ts'
import { recordsForAgentsIn } from '../db/records-for-agents-in.ts'
import { refuseWhateverIsNotAnAttachment, theAttachmentIsOpen } from './attachments.ts'
import { ranAsIn } from '@shared/ran-as.ts'
import { runningRunRowsIn } from './worker.ts'

/** One handle that has a run still running, with the running session ids that put it here. */
export interface OneRunningWorker {
  handle: string
  name: string
  /** The running session ids, newest first. */
  runs: string[]
}

/** What one reading of the running workers answers. The door adds the note and the project. */
export interface TheRunningWorkers {
  /** How many unretired agents this handle started in this installation. */
  workers: number
  /** How many of those workers have a run in state running here. */
  runningWorkers: number
  /** Every handle with a running run, each once, sorted by handle. */
  running: OneRunningWorker[]
  /** The session whose child runs were looked at, or null because none was asked about. */
  session: string | null
}

/** A row's stored data as an object, or an empty one: a row that will not parse names nothing. */
function theDataOf(row: { data: unknown }): Record<string, unknown> {
  return typeof row.data === 'object' && row.data !== null && !Array.isArray(row.data)
    ? (row.data as Record<string, unknown>)
    : {}
}

/** A stored string that is not empty, or null. */
function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * THE RUNNING WORKERS OF ONE AGENT IN ONE PROJECT.
 *
 * `agent` is the registry row the handle door resolved, and `session` is the run whose child runs are
 * asked about, or null because none is. An id that is not a session of this project is refused with
 * the children door's own words before any session row is read.
 */
export function theRunningWorkersOf(
  agent: RegisteredAgent,
  workspaceId: string,
  session: string | null,
): TheRunningWorkers {
  const workers = agentsStartedBy(agent.id)
  if (session !== null) refuseWhateverIsNotAnAttachment(session, workspaceId)
  const recordForAgent = recordsForAgentsIn(workspaceId)
  const rows = runningRunRowsIn(workspaceId)

  /** The record id each started worker is bound by, so a row's `ranAs` can be joined to its registry row. */
  const workerByRecord = new Map<string, StartedAgentRow>()
  for (const worker of workers) {
    const record = recordForAgent.get(worker.id)
    if (record !== undefined) workerByRecord.set(record, worker)
  }

  /** A running row of this reading: its id, its data, and the record it worked as. */
  const rowReadings = rows.map((row) => {
    const data = theDataOf(row)
    return { id: row.id, data, record: ranAsIn({ data }, workspaceId) }
  })

  /**
   * THE CHILD RUNS UNDER THE SESSION ASKED ABOUT, and the registry rows behind the records of the
   * ones no started worker already answers for. The registry read happens once for all of them, and
   * only when a session was asked about.
   */
  const childRows =
    session === null
      ? []
      : rowReadings.filter(
          (one) => one.data['parentAttachment'] === session && theAttachmentIsOpen(one.data),
        )
  const childRowIds = new Set(childRows.map((one) => one.id))
  const childRecords = [
    ...new Set(
      childRows
        .map((one) => one.record)
        .filter((record): record is string => record !== null && !workerByRecord.has(record)),
    ),
  ]
  const agentsForChildRecords = childRecords.length === 0 ? new Map<string, RegisteredAgent>() : agentsForRecords(childRecords)

  const byHandle = new Map<string, OneRunningWorker>()
  const entryFor = (handle: string, name: string): OneRunningWorker => {
    const held = byHandle.get(handle)
    if (held !== undefined) return held
    const made: OneRunningWorker = { handle, name, runs: [] }
    byHandle.set(handle, made)
    return made
  }
  const workersWithARun = new Set<string>()

  // ONE PASS, NEWEST ROW FIRST, so each handle appears once and its runs are newest first.
  for (const one of rowReadings) {
    const worker = one.record === null ? undefined : workerByRecord.get(one.record)
    if (worker !== undefined) {
      workersWithARun.add(worker.id)
      entryFor(worker.handle, worker.name).runs.push(one.id)
      continue
    }
    if (session === null || !childRowIds.has(one.id)) continue
    const found = one.record === null ? undefined : agentsForChildRecords.get(one.record)
    const handle = found?.handle ?? text(one.data['servingAgent']) ?? one.id
    const name = found?.name ?? handle
    entryFor(handle, name).runs.push(one.id)
  }

  const running = [...byHandle.values()].sort((one, other) => (one.handle < other.handle ? -1 : one.handle > other.handle ? 1 : 0))
  return { workers: workers.length, runningWorkers: workersWithARun.size, running, session }
}
