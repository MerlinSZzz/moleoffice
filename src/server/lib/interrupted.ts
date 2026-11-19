// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE INTERRUPTED RUNS, AND RESUMING ONE WITH ONE PRESS.
 *
 * Criterion W7 of design/window/ACCEPTANCE.md (piece H7 of plan hp7Z-IW9JWSX): a run stopped half way
 * is stopped for something urgent, so the interrupted runs get a page, and
 * one press resumes each.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH RUNS ARE INTERRUPTED
 * ---------------------------------------------------------------------------------------
 *
 * An agent run the office started for a message, which stopped before it answered, and which
 * nothing has carried on since:
 *
 *   - `paused`: a shutdown of Mole Office stopped it on purpose (lib/pausing.ts);
 *   - `crashed`: it ended without answering — killed mid-turn, stopped by a person, or failed.
 *
 * A run a later run already took up again — the carry-on of criterion M24 after a restart, or an
 * earlier resume — is not interrupted any more, and is not listed. Two runs are of the same agent when
 * their registry ids have the same canonical id, so a run stored under an agent's old id is taken up by
 * a newer run under its canonical id. Neither is one this page already resumed. A crash is still
 * carried on by itself at the next start; nothing here changes that. A paused run never is: only the
 * press below resumes it.
 *
 * ---------------------------------------------------------------------------------------
 * THE PRESS, AND WHO STARTS THE RUN
 * ---------------------------------------------------------------------------------------
 *
 * The person presses resume (person-only, as the shutdown door is). The server only writes the ask
 * on the run's record, because the message worker is the one process that starts runs. On its next
 * pass the worker reads `resumesThePersonAsked`, starts the runtime's own resume by the recorded
 * conversation with the same message (`startOne` with `resume`), and says which run took it up, or
 * why it could not.
 *
 * ---------------------------------------------------------------------------------------
 * WHO MAY SEE A RUN, AND WHEN IT STOPPED
 * ---------------------------------------------------------------------------------------
 *
 * A run is listed only to a caller who may read the message it was answering, asked through
 * `theMessagesThisReaderMayRead` in lib/messages.ts and nowhere else. A
 * run whose message the caller may not read is left out, with nothing said about it, as GET
 * /api/worker/runs leaves out such a run. Every list here takes the reader, so no caller can forget it.
 *
 * When a run stopped is the time the stop was first written: `paused.at` for a pause, and otherwise
 * the revision that set the state it still holds. A later write to the record, such as a press to
 * resume or a resume that failed, does not move it. A run whose history holds no such revision says
 * nobody recorded when it stopped.
 */

import { clockStamp } from '@shared/time.ts'
import { en } from '@shared/words/en.ts'
import type { AnInterruptedRun, WhatWasMeasured, WhyItCannotResume } from '@shared/interrupted.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { desc, eq, sql } from 'drizzle-orm'
import { bootstrapEnvironment, workerCheckoutFrom } from '../../config/settings.mjs'
import { db, sqlite } from '../db/client.ts'
import { revisions } from '../db/schema.ts'
import { theMessageReader, theMessagesThisReaderMayRead, type AMessageReader } from './messages.ts'
import { asParticipant } from './pausing.ts'
import { getRecord, patchRecord, recordInWorkspace, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { theFiledAliasesReadOnce } from './registry-aliases/runs.ts'
import { everyRunRow, whatARunWasDelivering, type WhatARunWasDelivering } from './worker.ts'
import { theAgentARunServes } from './the-agent-a-run-serves.ts'
import { THE_WORKER } from '@shared/the-worker-actor.ts'

/**
 * WHAT WAS MEASURED ABOUT EACH TOOL'S OWN RESUME AFTER A KILL MID-TURN, in the sandbox, on 3 October
 * 2026 (report O08R9pH6LVJE, block b-3). OpenCode was killed while writing and its resume carried the
 * conversation on. Codex's resume took the id and reopened the conversation, and then could not log
 * in, so whether it carries on was not measured. Claude Code had no login, so it was not measured. A
 * tool not named here was not measured either. This changes no button: it is said beside the run.
 */
export const WHAT_WAS_MEASURED: Readonly<Record<string, WhatWasMeasured>> = {
  opencode: 'resumes',
  codex: 'takes-the-id',
  'claude-code': 'not-measured',
  kimi: 'not-measured',
}

function dataOf(row: { data: unknown }): Record<string, unknown> {
  return typeof row.data === 'object' && row.data !== null && !Array.isArray(row.data) ? (row.data as Record<string, unknown>) : {}
}

function said(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/**
 * WHEN A RECORD'S STATE BECAME THE ONE IT HOLDS NOW: the time of the earliest revision in the newest
 * unbroken stretch of revisions holding it. Null when no revision holds it.
 */
function whenTheStateBegan(recordId: string, state: string): string | null {
  const rows = db
    .select({ at: revisions.at, state: sql<string | null>`json_extract(${revisions.data}, '$.state')` })
    .from(revisions)
    .where(eq(revisions.recordId, recordId))
    .orderBy(desc(revisions.seq))
    .all()
  let began: string | null = null
  for (const row of rows) {
    if (row.state !== state) break
    began = row.at
  }
  return began
}

/**
 * EVERY INTERRUPTED RUN IN ONE PROJECT THAT THIS READER MAY SEE, newest first. See WHICH RUNS ARE
 * INTERRUPTED and WHO MAY SEE A RUN above.
 */
export function theInterruptedRuns(workspaceId: string, reader: AMessageReader): AnInterruptedRun[] {
  const rows = everyRunRow(workspaceId)
  const mayRead = theMessagesThisReaderMayRead(
    reader,
    rows.map((row) => said(dataOf(row)['deliveringMessage'])).filter((id): id is string => id !== null),
  )
  // The newest run for each message and agent. A run older than another run for the same message and
  // agent was taken up again, so it is not interrupted any more. An agent's id is compared by its canonical id.
  const aliases = theFiledAliasesReadOnce(sqlite)
  const theAgentWord = (data: Record<string, unknown>): string | null => {
    const id = said(data['servingAgentId'])
    return id === null ? said(data['servingAgent']) : aliases.canonicalOf(id)
  }
  const newest = new Map<string, string>()
  for (const row of rows) {
    const data = dataOf(row)
    const messageId = said(data['deliveringMessage'])
    const agent = theAgentWord(data)
    if (messageId === null || agent === null) continue
    const key = `${messageId}\u0000${agent}`
    if (!newest.has(key)) newest.set(key, row.id) // rows come newest first
  }
  // THE FOLDER EVERY RUN OF THIS OFFICE WORKS IN, worked out by the one function the message worker reads
  // it with, from the environment this server hands its worker: the install's root unless
  // MOLE_OFFICE_WORKER_CHECKOUT names another (round 15; Withaiw7X4tQ).
  const theRunsFolder = workerCheckoutFrom(bootstrapEnvironment())
  const out: AnInterruptedRun[] = []
  for (const row of rows) {
    const data = dataOf(row)
    const state = said(data['state'])
    if (state !== 'paused' && state !== 'crashed') continue
    if (data['startedByMoleOffice'] !== true) continue
    const messageId = said(data['deliveringMessage'])
    const agentWord = theAgentWord(data)
    if (messageId === null || agentWord === null) continue
    if (!mayRead.has(messageId)) continue
    if (newest.get(`${messageId}\u0000${agentWord}`) !== row.id) continue
    const resume = asObject(data['resume'])
    if (said(resume?.['startedAs']) !== null) continue
    const agent = theAgentARunServes(data)
    const delivering = agent === null ? null : whatARunWasDelivering(messageId, agent.id, workspaceId)
    const paused = asObject(data['paused'])
    const conversation = said(data['providerSession'])
    const folder = said(data['workingDirectory'])
    const because: WhyItCannotResume | null =
      conversation === null
        ? 'no-conversation'
        : folder !== null && folder.replace(/\/$/, '') !== theRunsFolder
          ? 'another-folder'
          : agent === null
            ? 'agent-gone'
            : delivering === null
              ? 'message-gone'
              : null
    const runtime = said(data['runtime'])
    let title = ''
    if (delivering !== null) {
      const record = getRecord(messageId)
      title = record?.title ?? ''
    }
    const askedBy = asObject(resume?.['askedBy'])
    out.push({
      session: row.id,
      how: state,
      agent: agent === null ? null : { id: agent.id, handle: agent.handle },
      message: delivering === null ? null : { id: messageId, title },
      stoppedAt: said(paused?.['at']) ?? whenTheStateBegan(row.id, state),
      why: said(paused?.['because']) ?? said(data['doing']),
      runtime,
      conversation,
      resume: because === null ? { can: true } : { can: false, because },
      measured: (runtime === null ? undefined : WHAT_WAS_MEASURED[runtime]) ?? 'not-measured',
      asked:
        said(resume?.['askedAt']) === null
          ? null
          : { by: askedBy === null ? null : (askedBy as unknown as ParticipantRef), at: String(resume?.['askedAt']) },
      failed: said(resume?.['failed']),
    })
  }
  return out
}

/**
 * THE PERSON ASKS FOR ONE INTERRUPTED RUN TO BE RESUMED. The door has already asked the person-only
 * check. Refused, saying why, when the run is not interrupted or cannot be resumed; otherwise the ask
 * is written on the run's record and the worker starts the resume on its next pass.
 */
export function askToResume(session: string, who: Actor, workspaceId: string): { run: AnInterruptedRun; wrote: boolean } {
  // A run in another project is refused by name, as every door that takes a record id refuses one.
  recordInWorkspace(session, workspaceId)
  const run = theInterruptedRuns(workspaceId, theMessageReader(who)).find((one) => one.session === session)
  if (run === undefined) {
    throw new PanelError(
      `Run ${session} is not an interrupted run in this project: it answered, it was already taken up again, or it ` +
        'is not a run Mole Office started for a message. Nothing was asked.',
      409,
    )
  }
  if (!run.resume.can) {
    // THE REASON IN WORDS, the English the Interrupted runs page draws for it, rather than its code.
    throw new PanelError(
      `Run ${session} cannot be resumed, so nothing was asked. ${en[`w13t.interrupted.because.${run.resume.because}`]}`,
      409,
    )
  }
  const at = clockStamp()
  const result = patchRecord(session, { dataPatch: { resume: { askedBy: asParticipant(who), askedAt: at.stamp } } }, THE_WORKER)
  return { run: { ...run, asked: { by: asParticipant(who), at: at.stamp }, failed: null }, wrote: result.newSeq !== null }
}

/** One resume the worker is asked to start: the run, its conversation and what it was delivering. */
export interface AResumeToStart extends WhatARunWasDelivering {
  session: string
  messageId: string
  agentId: string
  handle: string
  runtime: string
  providerSession: string
}

/**
 * EVERY RESUME THE PERSON ASKED FOR IN ONE PROJECT THAT THE WORKER HAS NOT STARTED YET, among the runs
 * this reader may see. The message worker reads every message, so it is given every one.
 */
export function resumesThePersonAsked(workspaceId: string, reader: AMessageReader): AResumeToStart[] {
  const out: AResumeToStart[] = []
  for (const run of theInterruptedRuns(workspaceId, reader)) {
    if (run.asked === null || !run.resume.can || run.agent === null || run.message === null) continue
    if (run.conversation === null || run.runtime === null) continue
    const delivering = whatARunWasDelivering(run.message.id, run.agent.id, workspaceId)
    if (delivering === null) continue
    out.push({
      ...delivering,
      session: run.session,
      messageId: run.message.id,
      agentId: run.agent.id,
      handle: run.agent.handle,
      runtime: run.runtime,
      providerSession: run.conversation,
    })
  }
  return out
}

/**
 * THE WORKER SAYS WHAT BECAME OF AN ASKED RESUME: the run that took it up, or why it could not start.
 * The interrupted run's own state stays as it was; its record says which run carried it on.
 */
export function sayWhatBecameOfAResume(
  session: string,
  outcome: { startedAs: string } | { failed: string },
  workspaceId: string,
): void {
  // A run in another project is refused by name, and so is a run nobody asked to resume.
  const record = recordInWorkspace(session, workspaceId)
  const resume = asObject(record.data['resume']) ?? {}
  if (said(resume['askedAt']) === null || said(resume['startedAs']) !== null) {
    throw new PanelError(`Nobody is waiting for run ${session} to be resumed, so nothing was written.`, 409)
  }
  const at = clockStamp()
  patchRecord(
    session,
    {
      dataPatch: {
        resume:
          'startedAs' in outcome
            ? { ...resume, startedAs: outcome.startedAs, startedAt: at.stamp, failed: null }
            : { askedBy: null, askedAt: null, failed: outcome.failed },
      },
    },
    THE_WORKER,
  )
}
