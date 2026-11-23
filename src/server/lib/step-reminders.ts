// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN'S REMINDER OF ITS ROLE, ITS DUTIES AND ITS CURRENT STEP (wave 14d). The minute pass of
 * src/server/lib/reminders.ts calls `sendTheStepRemindersThatAreDue` as its own step, "the step reminder", beside "the
 * expected time".
 *
 * WHAT A RUN'S CURRENT STEP IS. The newest step on its flow runs: its own flow run, and every flow it entered that has
 * not ended. The newest is the one with the latest `startedAt`. The step's clock starts at that `startedAt`.
 *
 * WHEN A REMINDER IS DUE. Once at each change of step, and again once N tokens or M minutes have passed since the later
 * of the step's start and the last step reminder about the run. N is the setting MOLE_OFFICE_STEP_REMINDER_TOKENS and M
 * is MOLE_OFFICE_STEP_REMINDER_MINUTES (src/config/gates.mjs). Both reached in one pass give one reminder. So a long
 * step is reminded again every N tokens or M minutes, whichever comes first.
 *
 * A CHANGE OF STEP is a step recorded on one of the run's flow runs while the run is running, by any writer: the
 * hand-step door POST /api/sessions/<run>/flow-run/steps, or the office's own writers. Each step gives one reminder, so
 * two steps recorded between two passes give two. A change is the new start of N and M, so a run reminded of a change
 * is not also reminded by tokens or time in the same pass. These are not changes:
 *   - the first step of the run's own flow run, which says the run was filed;
 *   - a step recorded after the run stopped, because only a running run is read;
 *   - a step recorded before this server started watching (`watchingSince`). The office cannot tell which of those it
 *     already reminded, so it reminds none of them rather than all of them at once. The steps a flow run held then are
 *     read from its newest revision written before that moment.
 *
 * WHICH TOKENS ARE COUNTED is said once, in src/config/tokens-so-far.mjs, and every reminder names it.
 *   - A sandboxed Claude Code run's count is read here from its conversation file (theConversationOf in
 *     ./agent-steps.ts), each answer once since the run began.
 *   - Any other run's count is the `tokensSoFar` the worker that started it writes on its record
 *     (recordTheTokensSoFar in src/worker/index.ts). The worker writes it in steps, so a reminder by tokens can come up
 *     to 10,000 tokens or five minutes of tokens before the setting is truly reached, and no later than the worker's
 *     next reading after it is.
 *   - A run with neither has no count: a terminal on the host that no worker started, a Kimi run, or a run whose
 *     worker has not read a count yet. Such a run is reminded by time only, and its reminder says so.
 *   - The tokens of a step are the count now less the count at the step's last reminder. A step that has had no
 *     reminder since it began, other than the run's first step, has no count at its start, so it is reminded by time
 *     until its first reminder gives it one. A reminder sent while the run had no count gives none either, so after it
 *     the step is again reminded by time until a reminder carries a count.
 *
 * WHO IS REMINDED. The agent the run serves, as an office line about the run (`aStepReminder`, a quiet line that asks
 * no reply and starts no run). A run is reminded only when all three of these hold:
 *   - it is running, and its agent is not retired;
 *   - the newest step of its own flow run does not close it. `STEPS_THAT_CLOSE_A_RUN` below names the steps that do,
 *     and says why "The run ended." is not one of them. A step on a flow the run entered never closes the run;
 *   - it showed a sign of life within the orphan time, MOLE_OFFICE_ORPHAN_AFTER, counted back from the pass's clock.
 *     The signs are: its record changed; a step was recorded on one of its flow runs; its log grew; and, for a
 *     sandboxed Claude Code run, its conversation file changed. The office's reminders about the run are not a sign,
 *     so a run that went quiet is reminded for the orphan time at most, and then no more.
 * The pass changes no record. A run it no longer reminds keeps its state, and it is reminded again on the first pass
 * after a sign of life. Each line keeps, in `extra.stepReminder`, the flow run and step it was about, why it was sent,
 * the pass's clock and the count then. The next pass reads those marks back, so nothing is stored anywhere that could
 * disagree with the lines themselves.
 */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db, sqlite } from '../db/client.ts'
import { ONE_KIND_WRITTEN_OUT, STORED_FIELDS, records } from '../db/schema.ts'
import { moleOffice } from '@shared/participants.ts'
import { localStamp, parseAnyStamp } from '@shared/time.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { ENTERED_FLOW_FIELD, OFFICE_STEP_DOES, OFFICE_STEP_SENTENCES_ONCE_WRITTEN } from '@shared/flow-run.ts'
import { claudeCodeTokensSoFarReadOn, THE_TOKENS_COUNTED, type AConversationRead } from '../../config/tokens-so-far.mjs'
import { stepReminderMinutes, stepReminderTokens } from './env.ts'
import { writeASystemLineToOne } from './groups.ts'
import { theFlowRunsOf, type FlowRunStep } from './flow-runs.ts'
import { theConversationOf } from './agent-steps.ts'
import { theAgentARunServes } from './the-agent-a-run-serves.ts'
import { readParticipant } from '../db/read-participant.ts'
import { theRoleAndDutiesOf } from './cardmessage.ts'
import { gateMet } from './gate-counts.ts'
import { PanelError } from './panel-error.ts'
import type { Actor } from './records.ts'
import { ORPHAN_AFTER_SECONDS } from './adapters/index.ts'
import { theLastOutputOf } from './reminders.ts'

/** Why a step reminder was sent. */
export type StepReminderWhy = 'a new step' | 'tokens' | 'minutes' | 'tokens and minutes'

/** What a step reminder keeps beside its line, in `extra.stepReminder`. `step` counts from 1. */
export interface StepReminderMark {
  flowRun: string
  step: number
  why: StepReminderWhy
  at: string
  tokens: number | null
}

/** A run's tokens so far, or no count with the reason. */
type TheTokens = { tokens: number; read: string } | { tokens: null; why: string }

/** A running run as the pass reads it. */
interface ARunningRun {
  id: string
  data: Record<string, unknown>
  updatedAt: string
}

/**
 * THE STEPS THAT CLOSE A RUN. A running run whose own flow run's newest step is one of these is reminded of nothing:
 * not of a new step, not by time, not by tokens. Each is written when a mark that closes the run's work is put on its
 * record: its report was confirmed (in the sentence the office writes now, and in the one it once wrote), it was
 * closed unchecked, or it was closed as superseded by a later run. Those marks stay on the record, and a write that
 * sets the run's state back to running does not take them off, so the step still says what the record says.
 * "The run ended." is not one of them. The office writes it when the run's state is set to an ended state, and a
 * running run whose newest step it is had its state set to running after that. The later state is the later fact, so
 * that run is reminded while it shows a sign of life.
 */
const STEPS_THAT_CLOSE_A_RUN: ReadonlySet<string> = new Set([
  OFFICE_STEP_DOES.confirmed,
  OFFICE_STEP_SENTENCES_ONCE_WRITTEN.confirmed,
  OFFICE_STEP_DOES.closedUnchecked,
  OFFICE_STEP_DOES.superseded,
])

interface AFlowRun {
  id: string
  own: boolean
  ended: boolean
  steps: FlowRunStep[]
}

/** The office writes its reminders in its own name. */
function theOffice(): Actor {
  return { type: 'system', id: moleOffice().id }
}

/** A stamp as milliseconds, or null when it is not one. */
function inMs(stamp: unknown): number | null {
  if (typeof stamp !== 'string' || stamp.trim() === '') return null
  const at = parseAnyStamp(stamp)
  return at === null ? null : at.getTime()
}

/**
 * THE RUNNING RUNS IN THE PROJECT THAT NAME THE AGENT THEY SERVE, found through the index of running runs, as the
 * expected time finds them.
 */
function theRunningRuns(workspaceId: string): ARunningRun[] {
  return db
    .select({ id: records.id, data: records.data, updatedAt: records.updatedAt })
    .from(records)
    .where(
      and(
        eq(records.kind, 'session'),
        eq(records.workspaceId, workspaceId),
        isNull(records.deletedAt),
        sql`${STORED_FIELDS.sessionIsRunning(records.data)} = 1`,
        sql`json_extract(${records.data}, '$.servingAgent') IS NOT NULL`,
      ),
    )
    .all()
}

/**
 * THE FLOWS THESE RUNS ENTERED, ended or not, by run, oldest first. An ended one still counts for changes of step,
 * because the step that ended it was recorded while its run ran, but it holds no current step.
 */
function theEnteredFlowRunsOf(runIds: readonly string[]): Map<string, AFlowRun[]> {
  const out = new Map<string, AFlowRun[]>()
  if (runIds.length === 0) return out
  const rows = db
    .select({ id: records.id, data: records.data })
    .from(records)
    .where(
      and(
        ONE_KIND_WRITTEN_OUT.flowRun,
        isNull(records.deletedAt),
        inArray(STORED_FIELDS.flowRunRun(records.data), [...runIds]),
        sql`json_extract(${records.data}, ${'$.' + ENTERED_FLOW_FIELD}) IS NOT NULL`,
      ),
    )
    .orderBy(records.createdAt, records.id)
    .all()
  for (const row of rows) {
    const data = (row.data ?? {}) as Record<string, unknown>
    const run = data['run']
    if (typeof run !== 'string') continue
    const steps = Array.isArray(data['stepsTaken']) ? (data['stepsTaken'] as FlowRunStep[]) : []
    const list = out.get(run) ?? []
    list.push({ id: row.id, own: false, ended: data['ended'] !== undefined && data['ended'] !== null, steps })
    out.set(run, list)
  }
  return out
}

/**
 * THE STEP REMINDERS ALREADY SENT ABOUT THESE RUNS, by run, oldest first. Found through the index of messages by the run
 * they are about (migration 0339), which is named so that a missing index is an error and not a slow read.
 */
function theMarksSentAbout(runIds: readonly string[]): Map<string, StepReminderMark[]> {
  const out = new Map<string, StepReminderMark[]>()
  if (runIds.length === 0) return out
  const line = SYSTEM_LINES.aStepReminder('').line
  for (const one of db.all<{ run: unknown; mark: unknown }>(sql`SELECT json_extract(${records.data}, '$.aboutRun') AS run,
    json_extract(${records.data}, '$.extra.stepReminder') AS mark
    FROM ${records} INDEXED BY records_message_about_run_idx
    WHERE ${and(
      ONE_KIND_WRITTEN_OUT.message,
      isNull(records.deletedAt),
      sql`${STORED_FIELDS.messageAboutRun(records.data)} IS NOT NULL`,
      inArray(STORED_FIELDS.messageAboutRun(records.data), [...runIds]),
      sql`json_extract(${records.data}, '$.body') = ${line}`,
      sql`json_extract(${records.data}, '$.sentBy.kind') = 'agent' AND json_extract(${records.data}, '$.sentBy.id') = ${moleOffice().id}`,
    )}`)) {
    if (typeof one.run !== 'string' || typeof one.mark !== 'string') continue
    const mark = aMark(JSON.parse(one.mark))
    if (mark === null) continue
    const list = out.get(one.run) ?? []
    list.push(mark)
    out.set(one.run, list)
  }
  for (const list of out.values()) list.sort((a, b) => (inMs(a.at) ?? 0) - (inMs(b.at) ?? 0))
  return out
}

/** A mark as stored, or null when it is not one. Only the office writes these lines, so null is not expected. */
function aMark(value: unknown): StepReminderMark | null {
  if (typeof value !== 'object' || value === null) return null
  const m = value as Record<string, unknown>
  if (typeof m['flowRun'] !== 'string' || typeof m['step'] !== 'number' || typeof m['at'] !== 'string') return null
  const why = m['why']
  if (why !== 'a new step' && why !== 'tokens' && why !== 'minutes' && why !== 'tokens and minutes') return null
  return { flowRun: m['flowRun'], step: m['step'], why, at: m['at'], tokens: typeof m['tokens'] === 'number' ? m['tokens'] : null }
}

/**
 * HOW MANY STEPS EACH FLOW RUN HELD WHEN THIS SERVER STARTED WATCHING, read once for each flow run from its newest
 * revision written before then. A flow run with no revision before then held none.
 */
const stepsWhenWatchingBegan = { since: '', held: new Map<string, number>() }
function theStepsHeldWhenWatchingBegan(flowRun: string, watchingSince: Date): number {
  const since = localStamp(watchingSince)
  if (stepsWhenWatchingBegan.since !== since) {
    stepsWhenWatchingBegan.since = since
    stepsWhenWatchingBegan.held.clear()
  }
  const held = stepsWhenWatchingBegan.held.get(flowRun)
  if (held !== undefined) return held
  const row = sqlite
    .prepare("SELECT json_array_length(data, '$.stepsTaken') AS n FROM revisions WHERE record_id = ? AND at < ? ORDER BY at DESC, seq DESC LIMIT 1")
    .get(flowRun, since) as { n: number | null } | undefined
  const n = row?.n ?? 0
  stepsWhenWatchingBegan.held.set(flowRun, n)
  return n
}

/**
 * A SANDBOXED CLAUDE CODE RUN'S CONVERSATION FILE, read again only when its size or its time changed, and then only from
 * where the last read of it ended (claudeCodeTokensSoFarReadOn). Entries for files no running run names any longer are
 * dropped at the end of each pass.
 */
const readConversations = new Map<string, AConversationRead>()

/**
 * A run's tokens so far, from its conversation file or its record, or no count with the reason. Beside the count, when
 * its conversation file last changed, from the same reading of the file, or null when no file was read.
 */
function theTokensOf(run: string, data: Record<string, unknown>, filesRead: Set<string>): { count: TheTokens; conversationChangedMs: number | null } {
  const noFile = (count: TheTokens) => ({ count, conversationChangedMs: null })
  if (typeof data['sandbox'] === 'object' && data['sandbox'] !== null && data['runtime'] === 'claude-code') {
    const sinceMs = inMs((data['startedTime'] as { instant?: unknown } | undefined)?.instant) ?? inMs(data['startedAt'])
    if (sinceMs === null) return noFile({ tokens: null, why: 'Its record gives no start, so the answers of this run in its conversation file cannot be told from earlier ones.' })
    let conversation: ReturnType<typeof theConversationOf>
    try {
      conversation = theConversationOf(run, data)
    } catch (err) {
      // A RECORD THAT LEADS OUTSIDE THE RUN'S OWN SANDBOX HOME is refused there, and nothing is read. Only that refusal
      // is caught: the run then has no count, and its reminder says why.
      if (err instanceof PanelError) return noFile({ tokens: null, why: err.message })
      throw err
    }
    if (conversation.file === null) return noFile({ tokens: null, why: conversation.says })
    const file = conversation.file
    filesRead.add(file)
    try {
      // Only the bytes added since the last read of this file are read, because a working run's file grows at every
      // pass, and reading the whole of it each time held the server for as long as the whole file took to read.
      const read = claudeCodeTokensSoFarReadOn(file, sinceMs, readConversations.get(file))
      readConversations.set(file, read)
      return { count: read.tokens, conversationChangedMs: read.mtimeMs }
    } catch (err) {
      return noFile({ tokens: null, why: `Read ${conversation.says}: ${(err as Error).message}` })
    }
  }
  const count = data['tokensSoFar']
  if (typeof count === 'number' && Number.isFinite(count)) {
    const read = data['howTheTokensWereReadAndCounted']
    return noFile({ tokens: count, read: typeof read === 'string' && read !== '' ? read : `Read from its record. Counted: ${THE_TOKENS_COUNTED}.` })
  }
  return noFile({
    tokens: null,
    why:
      'Its record carries no count of its tokens: its runtime gives none while it runs, no worker of the office ' +
      'started it, or no count has been read yet',
  })
}

/**
 * WHEN A RUN LAST SHOWED A SIGN OF LIFE, as milliseconds, or null when it shows none: the latest of its record's
 * change, the start and end of every step on its flow runs, its last output, and its conversation file's change. The
 * office's reminders about the run are messages and change none of these.
 */
function theLastSignOfLife(run: ARunningRun, flowRuns: readonly AFlowRun[], conversationChangedMs: number | null): number | null {
  let last: number | null = null
  const times = [inMs(run.updatedAt), theLastOutputOf(run), conversationChangedMs]
  for (const flowRun of flowRuns) for (const step of flowRun.steps) times.push(inMs(step.startedAt), inMs(step.endedAt))
  for (const ms of times) if (ms !== null && (last === null || ms > last)) last = ms
  return last
}

/** A step as a reader is told it: its place, its flow run and what it does. */
function aStepSaid(flowRun: AFlowRun, position: number): string {
  const step = flowRun.steps[position - 1]
  return `step ${position} of ${flowRun.own ? 'its own flow run' : 'the flow it entered'} ${flowRun.id}, "${step?.does ?? ''}"`
}

/**
 * SEND THE STEP REMINDERS THAT ARE DUE IN ONE PROJECT. Returns the run of each reminder sent, once for each, so a run
 * reminded of two steps is named twice.
 */
export function sendTheStepRemindersThatAreDue(workspaceId: string, now: Date, watchingSince: Date): string[] {
  const sent: string[] = []
  const runs = theRunningRuns(workspaceId)
  const filesRead = new Set<string>()
  if (runs.length > 0) {
    const ids = runs.map((run) => run.id)
    const own = theFlowRunsOf(ids)
    const entered = theEnteredFlowRunsOf(ids)
    const marks = theMarksSentAbout(ids)
    const at = now.getTime()
    const stamp = localStamp(now)
    let settings: { tokens: number; minutes: number } | null = null
    for (const run of runs) {
      const agentId = theAgentARunServes(run.data)?.id ?? null
      if (agentId === null) continue
      const agent = readParticipant({ kind: 'agent', id: agentId })
      if (agent === null || !('retired' in agent) || agent.retired) continue
      const ownFlowRun = own.get(run.id)
      const newestOwnStep = ownFlowRun?.steps[ownFlowRun.steps.length - 1]
      if (newestOwnStep !== undefined && STEPS_THAT_CLOSE_A_RUN.has(newestOwnStep.does)) continue
      const flowRuns: AFlowRun[] = [
        ...(ownFlowRun === undefined ? [] : [{ id: ownFlowRun.id, own: true, ended: false, steps: ownFlowRun.steps }]),
        ...(entered.get(run.id) ?? []),
      ]
      // THE CURRENT STEP: the latest start among the last steps of the flow runs that have not ended.
      let current: { flowRun: AFlowRun; position: number; startMs: number } | null = null
      for (const flowRun of flowRuns) {
        if (flowRun.ended || flowRun.steps.length === 0) continue
        const startMs = inMs(flowRun.steps[flowRun.steps.length - 1]!.startedAt)
        if (startMs !== null && (current === null || startMs >= current.startMs)) current = { flowRun, position: flowRun.steps.length, startMs }
      }
      if (current === null) continue
      // A SIGN OF LIFE within the orphan time, counted back from the pass's clock, or no reminder.
      const { count, conversationChangedMs } = theTokensOf(run.id, run.data, filesRead)
      const lastSign = theLastSignOfLife(run, flowRuns, conversationChangedMs)
      if (lastSign === null || lastSign < at - ORPHAN_AFTER_SECONDS * 1_000) continue
      settings ??= { tokens: stepReminderTokens(), minutes: stepReminderMinutes() }
      const sentAbout = marks.get(run.id) ?? []
      const to = { kind: 'agent', id: agent.id } as const
      const { tokens: everyTokens, minutes: everyMinutes } = settings
      const remind = (mark: StepReminderMark, said: string): void => {
        const theRest =
          `The office reminds a run of its step at each change of step, and again every ${everyTokens} tokens or ` +
          `${everyMinutes} minutes, whichever comes first. ${theRoleAndDutiesOf(agent.role)} No reply is needed.`
        writeASystemLineToOne(to, workspaceId, SYSTEM_LINES.aStepReminder(`${said} ${theRest}`), theOffice(), { run: run.id }, { stepReminder: mark })
        sent.push(run.id)
      }

      // THE CHANGES OF STEP, oldest first: the steps no reminder names, recorded since this server started watching.
      const changes: { flowRun: AFlowRun; position: number; startMs: number }[] = []
      for (const flowRun of flowRuns) {
        const from = Math.max(theStepsHeldWhenWatchingBegan(flowRun.id, watchingSince), flowRun.own ? 1 : 0)
        for (let position = from + 1; position <= flowRun.steps.length; position += 1) {
          if (sentAbout.some((mark) => mark.flowRun === flowRun.id && mark.step === position)) continue
          changes.push({ flowRun, position, startMs: inMs(flowRun.steps[position - 1]!.startedAt) ?? 0 })
        }
      }
      if (changes.length > 0) {
        changes.sort((a, b) => a.startMs - b.startMs)
        const tokens = count.tokens
        for (const change of changes) {
          const isCurrent = change.flowRun === current.flowRun && change.position === current.position
          remind(
            { flowRun: change.flowRun.id, step: change.position, why: 'a new step', at: stamp, tokens },
            `Run ${run.id} has recorded a new step: ${aStepSaid(change.flowRun, change.position)}.` +
              (isCurrent ? ' It is now your current step.' : ` Your current step is ${aStepSaid(current.flowRun, current.position)}.`),
          )
        }
        continue
      }

      // BY TIME AND BY TOKENS, since the later of the step's start and the last step reminder about the run.
      const last = sentAbout[sentAbout.length - 1]
      const lastMs = last === undefined ? null : inMs(last.at)
      const sinceAReminder = lastMs !== null && lastMs >= current.startMs
      const clockMs = sinceAReminder ? lastMs : current.startMs
      const minutes = Math.floor((at - clockMs) / 60_000)
      const byMinutes = at - clockMs >= settings.minutes * 60_000
      const theRunsFirstStep = current.flowRun.own && current.position === 1
      const base = sinceAReminder ? last!.tokens : theRunsFirstStep ? 0 : null
      const spent = count.tokens === null || base === null ? null : count.tokens - base
      const byTokens = spent !== null && spent >= settings.tokens
      if (!byMinutes && !byTokens) continue
      if (byTokens) gateMet('step-reminder-tokens', String(settings.tokens))
      if (byMinutes) gateMet('step-reminder-minutes', String(settings.minutes))
      const since = sinceAReminder ? 'the last reminder of its step' : 'the step began'
      // A REASON FOR NO COUNT may end with a full stop or not, as its reader wrote it, so its stop is taken off before
      // the sentence adds its own.
      const howMuch =
        count.tokens === null
          ? `${minutes} minutes have passed since ${since}. Its tokens are not known, so it is reminded by time only: ${count.why.replace(/\.$/, '')}.`
          : spent === null
            ? `${minutes} minutes have passed since ${since}. Its tokens so far are ${count.tokens}, but its count ${sinceAReminder ? 'at the last reminder of its step' : 'when the step began'} is not known, so this step is reminded by time until a reminder carries a count. ${count.read}`
            : // A COUNT THAT WENT DOWN is not of the same tokens as the count it is compared with, for example when a
              // newer conversation file was read. Its difference would be a negative number of tokens, so none is said.
              spent < 0
              ? `${minutes} minutes have passed since ${since}. Its tokens so far are ${count.tokens}, fewer than the ${String(base)} counted ${sinceAReminder ? 'at the last reminder of its step' : 'when the step began'}. A count of tokens spent cannot go down, so the two counts are not of the same tokens, and the tokens this step has spent are not known. The tokens after this reminder are counted from ${count.tokens}. ${count.read}`
              : `${minutes} minutes and ${spent} tokens have passed since ${since}. ${count.read}`
      remind(
        { flowRun: current.flowRun.id, step: current.position, why: byTokens && byMinutes ? 'tokens and minutes' : byTokens ? 'tokens' : 'minutes', at: stamp, tokens: count.tokens },
        `Run ${run.id} is still on its current step, ${aStepSaid(current.flowRun, current.position)}. ${howMuch}`,
      )
    }
  }
  for (const file of readConversations.keys()) if (!filesRead.has(file)) readConversations.delete(file)
  return sent
}
