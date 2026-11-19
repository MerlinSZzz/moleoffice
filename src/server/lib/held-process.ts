// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SESSION RECORDS ITS OWN PROCESS ON THE RECORD IT HOLDS A HANDLE FOR, THROUGH A DOOR THAT CHECKS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, TWICE
 * ---------------------------------------------------------------------------------------
 *
 * A durable agent's letters were sent to the owner instead of to the agent on 23 and 24 September
 * 2026 (two different agents). Both times the agent was sitting in a terminal and could have answered.
 * The reading that decides is `whoIsAnsweringAs` in lib/worker.ts: a held handle answers "a live
 * session" when the record behind the hold names a transcript AND a process that is still running.
 * The transcript was there. The process was not, because the only writer of a session's process is
 * the start hook, and the hook writes the record it filed, which is not always the record the waiter
 * holds for.
 *
 * The waiter knows which record it holds for. What it could not do is prove which process is that
 * session: `setsid` detaches the kit's waiter from the session that started it, so walking up its
 * own parent chain reaches `systemd --user` and never claude.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A DOOR WITH CHECKS AND NOT A FIELD ON THE HOLD
 * ---------------------------------------------------------------------------------------
 *
 * A process number written by whoever asks is not evidence of anything: PATCH /api/records would
 * let a session declare its own liveness, which was refused in message `jH1hhbF2kjg6`.
 * The office reads the process itself, through src/config/session-process.mjs, and then asks the
 * one question that matters — IS THIS PROCESS THIS SESSION? A waiter that outlived the session that
 * started it carries the old session's numbers, and one was measured 47 minutes older than the
 * session it holds for.
 *
 * So the door writes nothing until nine checks have passed, in this order: the caller is the agent
 * itself; a live hold on that handle names this session; the hold is on this machine; the record is
 * a claude-code session with a conversation on it; it did not run as another agent; the process is
 * running, is the claude program by its own name or executable (never by its command line, which a
 * shell running a command about claude also carries), and began when the caller says; something Mole Office can read ties that
 * process to this record's conversation; no other record already has that process; and the record
 * does not already name a different live one. Every refusal ends "Nothing was written", and that
 * sentence is true because nothing here writes before the last check has passed.
 *
 * WHAT IT CANNOT STOP, said plainly: an agent that deliberately exports a conversation and a process
 * that match each other. Chapter 8's own limit — this product does attribution, not authentication.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT WRITES, AND WHAT IT NEVER WRITES
 * ---------------------------------------------------------------------------------------
 *
 * The four process fields inside the stamp that is already on the record, through
 * `theProcessPatchFor`, which is the same rule the start hook writes by. It never writes `tool`,
 * `externalId` or `logPath`: those three name the conversation, one record is one run, and a door
 * that could write them could move a record onto a run it is not.
 */

import { nothingWrittenSentence } from './records/patching.ts'
import { stampOf } from './stamp-of.ts'
import { DISCOVERY_KEY } from '@shared/discovery-stamp.ts'
import { theRecordedProcessOf } from '../../config/own-rows.mjs'
import { theLiveHoldOn, theLiveHoldOnSession } from './handles.ts'
import { participantForActor } from './participant-for-actor.ts'
import { agentForRecord } from '../db/agent-for-record.ts'
import { theAgentAHandleDoorNames, theAgentKeyAnActorHolds } from './handles.ts'
import { ranAsIn } from '@shared/ran-as.ts'
import {
  everyAgentAStoredStampCouldName,
  patchRecord,
  recordInWorkspace,
  type Actor,
} from './records.ts'
import { PanelError } from './panel-error.ts'
import { thisMachine } from './machines.ts'
import { sqlite } from '../db/client.ts'
import type { PanelRecord } from '@shared/types.ts'
import { kindWord } from '@shared/words.ts'
// THE PROCESS TABLE IS READ IN ONE PLACE IN THIS PRODUCT AND IT IS NOT A TypeScript FILE. Every
// reading below goes through this module, which the start hook reads too, so the office and the hook
// cannot come to disagree about what a running claude session looks like.
import {
  claudeConversationIn,
  commandLineOf,
  isTheClaudeProgram,
  startTimeOf,
  theCommandLineStored,
  theProcessPatchFor,
  theRecordedProcess,
} from '../../config/session-process.mjs'
import { localStampOf } from '../../config/stopped-run-cause.mjs'

/** Everything a waiter has to say to record its session's process. */
export interface RecordingAProcess {
  handle: string
  session: string
  pid: number
  pidStartedAt: string
  /**
   * THE CONVERSATION THE WAITER'S OWN ENVIRONMENT NAMES, or null because it named none.
   *
   * It is the third and weakest tie, and it is a CLAIM: the waiter is saying that the shell it runs
   * in was given this conversation beside this process. The first two ties are things the office
   * reads for itself. The reply always says which of the three held, so nobody has to assume.
   */
  conversation: string | null
  workspaceId: string
  actor: Actor
}

/** The three ways a process may be tied to a record's conversation, in the words the reply uses. */
export type HowItIsTied = 'its command line' | 'a record the start hook stamped' | "the waiter's environment"

/** What the door did, for the reply and for the line the waiter prints. */
export interface ProcessRecorded {
  nothingWritten?: string
  record: string
  pid: number
  pidStartedAt: string
  /** The command line THE OFFICE READ, never one the caller sent, as `theCommandLineStored` stores it: cut and screened. */
  pidCommand: string
  tiedBy: HowItIsTied
  /** False when the record already named exactly this process, so nothing was written. */
  changed: boolean
  says: string
}

/** One session record as the conflict query hands it back. */
interface AnotherRecord {
  id: string
  workspaceId: string
  data: Record<string, unknown>
}

/**
 * THE ONE AGENT A STORED REFERENCE ON A RUN NAMES, or null because it names none this office can
 * settle on.
 *
 * A `servingAgent` is a STORED reference and is never resolved by the arriving resolver (criterion
 * I2, design/agents/IDENTITY-ACCEPTANCE.md): an exact id first, then the one agent bearing the
 * string as a handle, and no agent where more than one answers. Null means *nobody can say which
 * agent this is*, which is not the same as *no agent*, and the caller below fails closed on it.
 */
function theAgentAStoredReferenceNames(stored: string): { id: string; handle: string } | null {
  const could = everyAgentAStoredStampCouldName(stored)
  const one = could.length === 1 ? could[0] : undefined
  return one === undefined ? null : { id: one.id, handle: one.handle }
}

/** The discovery stamp on a record exactly as it is stored, for a patch to be merged into. */
function theStoredStamp(record: Pick<PanelRecord, 'data'>): Record<string, unknown> | null {
  const extra = record.data['extra']
  if (typeof extra !== 'object' || extra === null || Array.isArray(extra)) return null
  const stamp = (extra as Record<string, unknown>)[DISCOVERY_KEY]
  if (typeof stamp !== 'object' || stamp === null || Array.isArray(stamp)) return null
  return stamp as Record<string, unknown>
}

/** The `extra` bag exactly as it is stored, so a patch adds to it rather than replacing it. */
function theStoredExtra(record: Pick<PanelRecord, 'data'>): Record<string, unknown> {
  const extra = record.data['extra']
  if (typeof extra !== 'object' || extra === null || Array.isArray(extra)) return {}
  return extra as Record<string, unknown>
}

/**
 * EVERY OTHER SESSION RECORD THAT ALREADY NAMES THIS PROCESS, in every project.
 *
 * A pid is a fact about one machine and not about one project, so a record in another project
 * naming the same process is the same collision and is read here. Deleted rows are left out: a
 * record somebody deleted is not a session anybody is routing messages to.
 */
function everyRecordNaming(pid: number, pidStartedAt: string, exceptId: string): AnotherRecord[] {
  const rows = sqlite
    .prepare(
      'SELECT id, workspace_id AS workspaceId, data FROM records ' +
        "WHERE kind = 'session' AND deleted_at IS NULL AND id <> ? " +
        "AND json_extract(data, '$.extra.discovered.pid') = ? " +
        "AND json_extract(data, '$.extra.discovered.pidStartedAt') = ?",
    )
    .all(exceptId, pid, pidStartedAt) as { id: string; workspaceId: string; data: string | null }[]
  const out: AnotherRecord[] = []
  for (const row of rows) {
    let data: Record<string, unknown>
    try {
      data = JSON.parse(row.data ?? '{}') as Record<string, unknown>
    } catch {
      // A ROW WHOSE DATA WILL NOT PARSE IS STILL A ROW NAMING THIS PROCESS. It is carried with an
      // empty bag, so the collision is seen and only the reasons drop out; dropping the row itself
      // would turn a record nobody can read into a record that is not there.
      data = {}
    }
    out.push({ id: row.id, workspaceId: row.workspaceId, data })
  }
  return out
}

/** The conversation a session record's stamp names, or null because it carries no whole stamp. */
function theConversationOf(record: Pick<PanelRecord, 'data'>): string | null {
  return stampOf(record)?.externalId ?? null
}

/**
 * WHICH AGENT A RUN SAYS IT IS, read from the two fields that say it, or null because neither does.
 *
 * `ranAs` is the per-project binding to an agent RECORD; `servingAgent` is the name whoever filed
 * the run used. Both are stored references and both are read as stored references. `handle` is what
 * a person reads, and it falls back to the stored string when nothing can be settled on — because
 * "this record says it ran as a name nobody here can resolve" is still a record that did not say it
 * ran as this agent.
 */
function theAgentARunNames(record: AnotherRecord | PanelRecord, workspaceId: string): { id: string | null; handle: string } | null {
  const ranAs = ranAsIn(record, workspaceId)
  if (ranAs !== null) {
    const named = agentForRecord(ranAs)
    return named === null ? { id: null, handle: ranAs } : { id: named.id, handle: named.handle }
  }
  const serving = record.data['servingAgent']
  if (typeof serving === 'string' && serving.trim() !== '') {
    const named = theAgentAStoredReferenceNames(serving)
    return named === null ? { id: null, handle: serving } : named
  }
  return null
}

/**
 * RECORD THIS SESSION'S OWN PROCESS ON THE RECORD ITS HANDLE IS HELD FOR.
 *
 * Every refusal is a `PanelError` whose sentence ends "Nothing was written", and nothing is written
 * until the last check has passed, so that sentence is true on every one of them.
 */
export function recordTheSessionsProcess(asked: RecordingAProcess): ProcessRecorded {
  // ---------------------------------------------------------------- 1. the caller
  // THE PATH'S HANDLE, WITH THE CALLER'S KEY IN STEP 1 of the resolver. `theAgentAHandleDoorNames` in
  // lib/handles.ts says why: a freed legacy handle is settled by the agent's own key.
  const agent = theAgentAHandleDoorNames(asked.handle, theAgentKeyAnActorHolds(asked.actor))
  if (agent === null) {
    throw new PanelError(
      `No durable agent in this installation has the handle "${asked.handle}". Nothing was written.`,
      404,
    )
  }
  // ONLY THE AGENT ITSELF, WHICH NO OTHER HANDLE DOOR ASKS. The other doors are `remote` and are
  // guarded by the credential alone; this one writes onto a session record, so the actor is compared
  // with the handle as well. `participantForActor` is the one arriving resolver, so a handle and a
  // registry id both answer and an ambiguous name is refused by it naming both agents.
  const caller = asked.actor.type === 'agent' ? participantForActor(asked.actor) : null
  if (caller === null || caller.kind !== 'agent' || caller.id !== agent.id) {
    throw new PanelError(
      `This request names the handle "${asked.handle}" and writes as ${asked.actor.type} "${asked.actor.id}". ` +
        "Only the agent itself records its session's process. Nothing was written.",
      403,
    )
  }

  // ---------------------------------------------------------------- 2. the holder
  // READ ONLY, so that "Nothing was written" is true even when the hold read here has lapsed:
  // the ordinary read releases a lapsed hold as it goes, and that is a write.
  const held = theLiveHoldOn(agent.id, true)
  if (held === null) {
    throw new PanelError(
      `Nothing is holding the handle "${asked.handle}" now, so no process can be recorded for it. Nothing was written.`,
      409,
    )
  }
  if (held.session !== asked.session) {
    throw new PanelError(
      `The handle "${asked.handle}" is held by the session filed as record ${held.session}, not by ` +
        `${asked.session}. Only the session that holds a handle may record its process. Nothing was written.`,
      409,
    )
  }

  // ---------------------------------------------------------------- 3. the machine
  const here = thisMachine()
  if (here === null) {
    throw new PanelError(
      `The hold on "${asked.handle}" is on ${held.machine}, and this office could not say what machine it runs ` +
        'on. A process number means something only on its own machine. Nothing was written.',
      409,
    )
  }
  if (held.machine !== here) {
    throw new PanelError(
      `The hold on "${asked.handle}" is on ${held.machine}, and this office runs on ${here}. A process number ` +
        'means something only on its own machine. Nothing was written.',
      409,
    )
  }

  // ---------------------------------------------------------------- 4. the record
  const record = recordInWorkspace(asked.session, asked.workspaceId)
  const runtime = record.data['runtime']
  const conversation = theConversationOf(record)
  const wrongAboutTheRecord =
    record.kind !== 'session'
      ? // THE WORD A PERSON READS, never the stored one. `merge_entry` is a kind and "merge entry" is
        // what it is called; the machine-word gate is the rule, and lib/counters.ts says it the same way.
        `it is a ${kindWord(record.kind).text}`
      : record.deletedAt !== null
        ? 'it has been deleted'
        : typeof runtime !== 'string' || runtime === ''
          ? 'its runtime is not recorded'
          : runtime !== 'claude-code'
            ? `its runtime is ${runtime}`
            : conversation === null
              ? 'it names no conversation yet'
              : null
  if (wrongAboutTheRecord !== null || conversation === null) {
    throw new PanelError(
      `Record ${asked.session} is not a claude-code session with a conversation on it: ` +
        `${wrongAboutTheRecord ?? 'it names no conversation yet'}. Nothing was written.`,
      409,
    )
  }

  // ---------------------------------------------------------------- 5. whose run it is
  const ranAs = theAgentARunNames(record, asked.workspaceId)
  if (ranAs !== null && ranAs.id !== agent.id) {
    throw new PanelError(
      `Record ${asked.session} ran as the agent "${ranAs.handle}", not as "${asked.handle}". Nothing was written.`,
      409,
    )
  }

  // ---------------------------------------------------------------- 6. the process itself
  const commandLine = commandLineOf(asked.pid)
  const started = commandLine === null ? null : startTimeOf(asked.pid)
  const reallyStartedAt = started === null ? null : localStampOf(started)
  const wrongAboutTheProcess =
    commandLine === null
      ? 'not running'
      : !isTheClaudeProgram(asked.pid)
        ? 'not the claude program'
        : reallyStartedAt === null
          ? 'a process whose start time could not be read'
          : reallyStartedAt !== asked.pidStartedAt
            ? `a process that started at ${reallyStartedAt}, not at ${asked.pidStartedAt}`
            : null
  if (wrongAboutTheProcess !== null || commandLine === null || reallyStartedAt === null) {
    throw new PanelError(
      `Process ${String(asked.pid)} is ${wrongAboutTheProcess ?? 'not running'}. Nothing was written.`,
      409,
    )
  }

  // ---------------------------------------------------------------- 7. the tie to this conversation
  const tiedBy = howThisProcessIsTied({
    commandLine,
    conversation,
    pid: asked.pid,
    pidStartedAt: asked.pidStartedAt,
    said: asked.conversation,
  })
  if (tiedBy === null) {
    throw new PanelError(
      `Nothing Mole Office can read ties process ${String(asked.pid)} to the conversation record ` +
        `${asked.session} names (${conversation}). Nothing was written.`,
      409,
    )
  }

  // ---------------------------------------------------------------- 8. not somebody else's already
  for (const other of everyRecordNaming(asked.pid, asked.pidStartedAt, asked.session)) {
    const its = theConversationOf(other)
    if (its !== null && its !== conversation) {
      throw new PanelError(
        `Process ${String(asked.pid)} is already recorded on record ${other.id}, which names another ` +
          `conversation, ${its}. One process is one session. Nothing was written.`,
        409,
      )
    }
    const whose = whoseRunThatIs(other, agent.id)
    if (whose !== null) {
      throw new PanelError(
        `Process ${String(asked.pid)} is already recorded on record ${other.id}, which runs as "${whose}". ` +
          'One process is one session. Nothing was written.',
        409,
      )
    }
  }

  // ---------------------------------------------------------------- 9. no second live process
  const alreadyNamed = theRecordedProcessOf(record)
  if (
    alreadyNamed.pid !== null &&
    alreadyNamed.pid !== asked.pid &&
    theRecordedProcess(alreadyNamed.pid, alreadyNamed.pidStartedAt).trusted
  ) {
    throw new PanelError(
      `Record ${asked.session} already names a live claude process, ${String(alreadyNamed.pid)}, that is not ` +
        `${String(asked.pid)}. Nothing was written.`,
      409,
    )
  }

  // ---------------------------------------------------------------- the write
  const { pidCommand, pidFlags } = theCommandLineStored(commandLine)
  const next = theProcessPatchFor(theStoredStamp(record), {
    recorded: true,
    pid: asked.pid,
    pidStartedAt: asked.pidStartedAt,
    pidCommand,
    pidFlags,
    why: null,
  })
  if (next === null) {
    return {
      record: asked.session,
      pid: asked.pid,
      pidStartedAt: asked.pidStartedAt,
      pidCommand,
      tiedBy,
      changed: false,
      nothingWritten: nothingWrittenSentence({ kind: 'already-stored' }),
      says:
        `Record ${asked.session} already named process ${String(asked.pid)}, started ${asked.pidStartedAt}. ` +
        'Nothing changed.',
    }
  }
  patchRecord(
    asked.session,
    { dataPatch: { extra: { ...theStoredExtra(record), [DISCOVERY_KEY]: next } } },
    asked.actor,
  )
  return {
    record: asked.session,
    pid: asked.pid,
    pidStartedAt: asked.pidStartedAt,
    pidCommand,
    tiedBy,
    changed: true,
    says:
      `Record ${asked.session} now names process ${String(asked.pid)}, started ${asked.pidStartedAt}, tied to ` +
      `its conversation by ${tiedBy}.`,
  }
}

/**
 * WHAT TIES THIS PROCESS TO THIS CONVERSATION, in the order the ties are worth, or null because
 * nothing does.
 *
 *   1. THE PROCESS'S OWN COMMAND LINE — `claude --resume <C>`. The office reads this itself off
 *      /proc and nobody can write it from here, so it is the strongest of the three.
 *   2. A RECORD THE START HOOK STAMPED. Some session record already names this conversation with
 *      this exact process and start time, which is the hook's own observation from inside that
 *      session. The record being written counts: if the hook already stamped it, the tie is its.
 *   3. THE WAITER'S ENVIRONMENT. Claude Code puts the conversation and the process in every shell
 *      it starts, and the waiter sends the conversation when its shell was given both. It is a
 *      CLAIM, because the office cannot read another process's environment, and the reply names it
 *      so that a reader can tell it from the two above.
 */
function howThisProcessIsTied(reading: {
  commandLine: string
  conversation: string
  pid: number
  pidStartedAt: string
  said: string | null
}): HowItIsTied | null {
  if (claudeConversationIn(reading.commandLine) === reading.conversation) return 'its command line'
  if (aStampedRecordNames(reading.conversation, reading.pid, reading.pidStartedAt)) {
    return 'a record the start hook stamped'
  }
  if (reading.said !== null && reading.said === reading.conversation) return "the waiter's environment"
  return null
}

/** Whether some session record already names this conversation with exactly this process. */
function aStampedRecordNames(conversation: string, pid: number, pidStartedAt: string): boolean {
  const row = sqlite
    .prepare(
      'SELECT id FROM records ' +
        "WHERE kind = 'session' AND deleted_at IS NULL " +
        "AND json_extract(data, '$.extra.discovered.externalId') = ? " +
        "AND json_extract(data, '$.extra.discovered.pid') = ? " +
        "AND json_extract(data, '$.extra.discovered.pidStartedAt') = ? LIMIT 1",
    )
    .get(conversation, pid, pidStartedAt) as { id: string } | undefined
  return row !== undefined
}

/**
 * THE OTHER AGENT A RECORD BELONGS TO, or null because it belongs to this one or to nobody.
 *
 * Two things say whose run a record is, and both are read: what the record itself says it ran as,
 * and a live hold naming that record — a hold is one session saying it is answering as one agent, so
 * a record held by another agent is that agent's run whatever its own fields say.
 */
function whoseRunThatIs(other: AnotherRecord, agentId: string): string | null {
  const named = theAgentARunNames(other, other.workspaceId)
  if (named !== null && named.id !== agentId) return named.handle
  const hold = theLiveHoldOnSession(other.id, true)
  if (hold !== null && hold.agent.id !== agentId) return hold.handle
  return null
}
