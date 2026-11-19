// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER THE SESSION BEHIND A HOLD IS STILL ANSWERING: one reading, for the handle door and the
 * presence dot.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE HEARTBEAT ALONE IS NOT AN ANSWER
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M106 of design/messages/ACCEPTANCE.md: an agent that has stopped for a long time on a usage
 * limit must not still be shown online. A hold is a claim written by a waiter process, and the waiter is
 * not the session: the session starts it in the background and it goes on beating when the session
 * has stopped — a usage limit, a crash, a closed terminal. Measured by Investigator ZI (problem
 * `DyEIJyDCG01X`): the handle read `fresh` for ten hours and twelve minutes with a dead thread
 * behind it, and 85 messages piled up. For a RUN the office already refuses to believe a record
 * that says running unless a process is alive in the ledger now; this makes a HOLD ask the same
 * kind of question about the session it names.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE FACTS A HOLD MAY REST ON, AND NONE IS INVENTED
 * ---------------------------------------------------------------------------------------
 *
 * 1. **The session's own process, which the hook recorded on its record.** A session waiting in its
 *    terminal writes nothing to its transcript — it is idle between turns — yet it can take a
 *    message now: the waiter hands the message over and the session wakes. The hook is spawned by
 *    that process, so it writes the pid, that process's start time and its command line onto the
 *    record. This is read first because it is the sign of life a WAITING session actually gives.
 *    A pid number that is running is not enough: the start time must match the recorded one (a
 *    reused number is a different process) and the command line must still name the claude program.
 *    It is read before the transcript's age is — but not before the transcript's last word, which
 *    criterion M126 puts ahead of it. A CODEX SESSION WRITES NO HOOK, so it has no recorded pid:
 *    its process is tied through `session-process.mjs` by the thread in a live `codex resume
 *    <thread>` command line, or by the bridge the record itself names. Criterion M126 reads both
 *    runtimes the same way.
 * 2. **A process resource row for that session that reads alive.** This is what `runServing` in
 *    lib/worker.ts already checks for a run, asked here about the session the hold names. It is a
 *    measurement of the machine made now, and since M126 it counts only when a transcript is on
 *    record and that transcript's last line names no stop cause.
 * 3. **The session's own transcript, written inside the same lapse window the hold uses.** Claude
 *    Code appends to `~/.claude/projects/<slug>/<id>.jsonl` as it works, so a transcript that grew
 *    inside the window is the session itself saying it is there. The window is
 *    `handleLapsesAfterSeconds()` and it is the hold's window, not a second one: one window for one
 *    claim.
 *
 * IF NONE CAN BE READ, THE OFFICE SAYS SO. `answering: false` with a sentence naming what could not
 * be read — no process recorded for it, a recorded process that is not alive or is not the one that
 * was recorded, no process resource row, no transcript on record, no adapter for the tool, a
 * transcript that would not open, or a transcript that was read and last grew longer ago than the
 * window. It never falls back to the heartbeat, because a fresh beat with a dead session behind it
 * is the whole defect.
 *
 * "COULD NOT TELL" IS ITS OWN ANSWER (problem `TOoUy7fMbg1P`). When a process of the session is alive
 * but its transcript cannot be read — none on record, no adapter, a file that would not open — the
 * reading is `answering: false` with `couldNotTell: true`, and the sentence ends "so whether it is
 * still answering could not be read". Every other `answering: false` is a known answer, and its
 * sentence ends "so nothing shows it is still answering" or names a stop cause. The routing up the
 * chain of starters acts only on a known one.
 *
 * ---------------------------------------------------------------------------------------
 * M126: THE TRANSCRIPT'S LAST WORD, AND NO TRANSCRIPT AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * A live process is not a session that can answer. Criterion M126: two agents that a usage limit had
 * cut off should have been offline, but the contacts still showed them online. Both were codex
 * sessions whose bridges were alive while the sessions behind them had hit a usage limit and
 * stopped, and their records carry no `extra.discovered.logPath`, so M106's reading trusted the live
 * bridge. Two things follow, and they are the whole of this criterion.
 *
 * 1. **When a transcript path is on record, its LAST REAL LINE is read before any process is
 *    trusted.** If that line is a limit, quota or login error — M94's shared reading of the same
 *    transcript, `theStopCauseAtTheEndOfTheTranscript` — the session is not answering and the
 *    sentence names the cause and the reset time. A cause with later activity after it is not the
 *    last word and the session is read normally; that is what separates a session that stopped from
 *    one that hit a limit and went on.
 * 2. **When no transcript path is on record, a live process alone is not answering.** A process row
 *    for a bridge or a waiter says the process is running, not that the session can answer; the
 *    office says it cannot read whether that session can answer. A codex record stamps no path, so
 *    its rollout is looked for by the thread it names; when that file is found it is read, and when
 *    it cannot be found the same cannot-read sentence is said rather than a working session.
 * 3. **A transcript older than the lapse whose last word is not a cause, with a live process the
 *    office can tie to the session, reads answering from that process.** The sentence says how long
 *    the log has been quiet. For claude-code the tie is the recorded pid; for codex it is the thread
 *    in a live `codex resume <thread>` command line or the bridge the record names, both read
 *    through `session-process.mjs`. This is the one rule for both runtimes: before it, a codex
 *    session idle between turns read Offline while a claude-code one read answering, from the same
 *    facts. No transcript at all, and an old transcript with no tied process, still read Offline.
 *
 * ---------------------------------------------------------------------------------------
 * A MESSAGE HANDED OVER AND NOT READ
 * ---------------------------------------------------------------------------------------
 *
 * Problem `-MLrleDe93wM`, found by the owner on 29 September 2026 at 11:42. One agent's last act was
 * at 06:30. Eight messages were handed to its waiter after that and none was read, and the handle
 * said a live session answered the whole time: its recorded process was alive, and a live process
 * answers for a quiet transcript (point 3 above). A live process is not a session that reads.
 *
 * So a hold's hand-overs are compared with the session's own transcript. A hand-over is the
 * delivery row the took door writes (`theFirstMessageHandedToThisSessionAfter` in lib/handles.ts
 * reads the first one later than the transcript's last write). A session that reads a message
 * takes a turn, and a turn is written to its transcript. When a message
 * was handed over after the transcript last grew, and longer ago than
 * `handleUnreadAfterSeconds()`, nobody has read since the transcript last grew. The reading is then
 * `answering: false` and known, whatever process is alive, and the routing up the chain of starters
 * acts on it. The delivery mark is not used: the waiter marks delivered and the session's own
 * act can mark read. The transcript is the evidence that a turn followed the hand-over.
 *
 * It is asked only where the transcript was read. Where it could not be read, whether anybody read
 * cannot be told either, and the reading stays what the rest of this file makes it.
 *
 * ---------------------------------------------------------------------------------------
 * ONE READING, TWO DOORS
 * ---------------------------------------------------------------------------------------
 *
 * `whoIsAnsweringAs` (the handle door) and `participantPresence` (the dot and the contacts list)
 * both arrive at the one judgement, `theReadingOf`, so they cannot disagree about one agent — the
 * defect CLAUDE.md names as this codebase's own. The handle door reaches it through
 * `theSessionBehindTheHold`; the presence door reaches it either through that same function when a
 * hold is there, or through the live-process branch when the only evidence is a resource row the
 * operating system confirms. A live process with no transcript the office can read therefore reads
 * the same word and the same sentence-shaped reading on both paths, which is what M126's bridge
 * case demanded and what the process-row path had kept working out for itself. The reading is pure
 * apart from the resource and record reads it makes: it writes nothing, so asking cannot change the
 * answer (criterion M106's second half: a change is drawn only when the office's answer changes).
 */

import type { HoldOnTheWire } from '@shared/handles.ts'
import { localStamp } from '@shared/time.ts'
import type { PanelRecord } from '@shared/types.ts'
import { join } from 'node:path'

import { adapterFor, theHomeDirectory } from './adapters/index.ts'
import { handleLapsesAfterSeconds, handleUnreadAfterSeconds } from './env.ts'
import { theFirstMessageHandedToThisSessionAfter } from './the-first-message-handed-to-this-session-after.ts'
import { getRecord } from './records.ts'
import { listResources, type ResourceReport } from './resources.ts'
import { type DiscoveryStamp } from './sessions.ts'
import { stampOf } from './stamp-of.ts'
import { theRecordedProcessOf } from '../../config/own-rows.mjs'
// THE SESSION'S OWN PROCESS, shared with the hook that records it. Criterion M106's second half.
// AND, FOR CODEX, THE PROCESS THE SESSION IS TIED TO: the resume thread in a live codex process's
// arguments, or the bridge the record itself names. Criterion M126.
import {
  codexThreadIn,
  commandLineOf,
  theCodexProcessTiedTo,
  theRecordedProcess,
} from '../../config/session-process.mjs'
// WHICH FILE A CODEX SESSION WROTE ITS TURN IN. A codex record carries no discovery stamp; the
// thread id on it, and the process behind it, are what name the rollout.
import { theCodexRolloutFor } from '../../config/codex-log.mjs'
// WHAT A TRANSCRIPT LAST SAID, shared with the hook and the office's sweep. Criterion M126: a
// limit, quota or login error is the session's own statement that it cannot answer, and a live
// process does not overrule it.
import {
  isACauseTheyMustActOn,
  theCauseInWords,
  theCodexTranscriptLastWrittenAt,
  theStopCauseAtTheEndOfTheTranscript,
} from '../../config/stopped-run-cause.mjs'

/**
 * What one hold's session was found to be, and what said so. THREE ANSWERS, NOT TWO.
 *
 * `answering: true` when its recorded process, a process row, or the transcript inside the window
 * says so. `answering: false` with `couldNotTell: false` when the office knows it is not answering:
 * its transcript ended on a stop cause, or nothing of it is alive and nothing it wrote is recent.
 * `answering: false` with `couldNotTell: true` when a process of the session is alive but the office
 * could not read its transcript, so it cannot tell either way (problem `TOoUy7fMbg1P`). A reader
 * that acts on "not answering" — the routing up the chain of starters — must act only on the second.
 */
export type HeldSessionReading = TheReadingsSentence &
  (
    | {
        answering: true
        /** What proved it. */
        from: 'its process' | 'a live process' | 'its transcript'
      }
    | {
        answering: false
        /**
         * True when a process of the session is alive and its transcript could not be read, so the
         * office cannot tell whether it is answering. False when the office knows it is not.
         */
        couldNotTell: boolean
        /** Nothing proved it. */
        from: null
      }
  )

/** The sentence every reading carries, whichever of the three answers it gives. */
interface TheReadingsSentence {
  /**
   * One plain sentence saying what was read. Null when the reading has nothing to add.
   *
   * A READING THAT ANSWERS FROM A PROCESS STILL CARRIES ONE when the transcript on record is older
   * than the lapse: it says the log has been quiet since the moment it last grew, and names the live
   * process that is known to be tied to the session. A reading proved by a fresh transcript needs no
   * sentence — the transcript is the session speaking now — and answers with null. Criterion M126.
   */
  says: string | null
}

/** One stop cause, as `theStopCauseAtTheEndOfTheTranscript` hands it back. */
interface TheStopCause {
  kind: string
  said: string
  resetsAt: string | null
  at: string | null
}

/**
 * THE SENTENCE FOR A SESSION WHOSE TRANSCRIPT ENDED ON A CAUSE THE PERSON MUST ACT ON.
 *
 * It names the record, the cause in the office's words, the moment the transcript stamped it and
 * the reset time the cause's own words carry, then quotes those words. The plain part is the
 * office's reading of the line; the quote is there because the provider's own phrasing is what a
 * person may have to match against a billing page, and rewriting it would lose that. Criterion
 * M126.
 */
function theSentenceForAStoppedSession(session: string, cause: TheStopCause, holdingTheHandle: boolean): string {
  const when = cause.at === null ? null : new Date(cause.at)
  const hitAt = when === null || Number.isNaN(when.getTime()) ? '' : ` at ${localStamp(when)}`
  const resets = cause.resetsAt === null ? '' : `, resets ${cause.resetsAt}`
  return (
    `${theOpening(session, holdingTheHandle)} its transcript's last line ` +
    `says it hit ${theCauseInWords(cause.kind)}${hitAt}${resets} — "${cause.said}" — so it is not answering.`
  )
}

/** The words after the opening for a session handed a message it has not read. Exported for a test (round 130). */
export const IT_HAS_READ_NOTHING_SINCE = 'it has read nothing since'

/**
 * HOW EVERY SENTENCE OPENS: with the session it is about, and whether that session holds the
 * agent's handle.
 *
 * THE HOLD IS A FACT, NOT PART OF THE JUDGEMENT. It changes only these few words, and it is here
 * because a reading made through a live process row has no handle to name. The rest of the sentence
 * is built once, below, so the two doors cannot say different things about the same facts.
 */
function theOpening(session: string, holdingTheHandle: boolean): string {
  return holdingTheHandle
    ? `The session filed as record ${session} is holding its handle, but`
    : `The session filed as record ${session} is not holding its handle, but`
}

/**
 * WHICH PROCESS THE SENTENCE NAMES AS THE ONE THAT IS ALIVE.
 *
 * The reading can answer from three different processes, and the sentence has to name the one that
 * actually answered: the session's own recorded process, because its start time and command line
 * matched; for a codex session, a process tied to its thread or the bridge the record names; or a
 * process resource row the operating system confirms now. A row that could not be checked is never
 * named here, because a row that could not be checked did not answer.
 */
function theAliveProcessWords(process: TheProcessFacts): string {
  if (process.itsOwnProcessIsAlive) return process.itsOwnProcessSays
  if (process.aProcessIsTiedToTheSession) return process.theTieSays
  return 'a process resource row for it reads alive'
}

/**
 * THE SENTENCE FOR A SESSION WHOSE LOG IS QUITE BUT WHOSE PROCESS IS ALIVE. Criterion M126.
 *
 * The transcript is older than the lapse, so the log alone would read Offline. A process the office
 * can tie to this session is alive, so the session is answering still. The sentence says when the
 * transcript last grew — the fact that would otherwise have read Offline — and names the process
 * that makes it answering, so a reader sees both facts rather than a green dot with no reason.
 */
function theSentenceForAQuietLog(
  session: string,
  at: Date,
  quiet: number,
  lapse: number,
  holdingTheHandle: boolean,
  aliveBecause: string,
): string {
  return (
    `${theOpening(session, holdingTheHandle)} its transcript has been quiet since ${localStamp(at)} ` +
    `(${String(quiet)} seconds ago) — longer than the ${String(lapse)} seconds a hold is allowed — ` +
    `but ${aliveBecause}, so it is answering.`
  )
}

/**
 * THE SENTENCE FOR A SESSION THAT WAS HANDED A MESSAGE AND HAS NOT READ IT. Problem `-MLrleDe93wM`.
 *
 * It opens "is holding its handle, but it has read nothing since" the moment the transcript last grew,
 * then names the hand-over and the setting that was passed.
 */
function theSentenceForAnUnreadHandOver(
  session: string,
  lastRead: Date,
  handedOver: Date,
  limit: number,
  holdingTheHandle: boolean,
): string {
  return (
    `${theOpening(session, holdingTheHandle)} ${IT_HAS_READ_NOTHING_SINCE} ${localStamp(lastRead)}. ` +
    `A message was handed to it at ${localStamp(handedOver)}, and its transcript has not grown since, ` +
    `for longer than the ${String(limit)} seconds a message handed over may wait unread, so it is not answering.`
  )
}

/**
 * WHAT ONE READING FOUND ABOUT A SESSION'S PROCESSES, in the shape both doors hand in.
 *
 * The two booleans are the evidence. The two sentences are how the office says what it read, and
 * they are kept apart so the judgement below can name a check that found nothing without inventing
 * a process that is not there.
 */
export interface TheProcessFacts {
  /** True when the session's own recorded process is alive and is still the one that was recorded. */
  itsOwnProcessIsAlive: boolean
  /** True when a process resource row for the session reads alive, as the operating system says now. */
  aProcessRowIsAlive: boolean
  /**
   * True when a live process can be tied to a CODEX session, by the thread in its arguments or by
   * the bridge the record names. Criterion M126: a codex record stamps no pid, so this is the codex
   * half of "the session's own process", read through session-process.mjs.
   */
  aProcessIsTiedToTheSession: boolean
  /** The office's words for the process the record names. */
  itsOwnProcessSays: string
  /** The office's words for the process a codex session is tied to. */
  theTieSays: string
  /** The office's words for what the resource rows said, including a row it could not check. */
  theRowsSay: string
}

/**
 * WHAT ONE READING FOUND ABOUT A SESSION'S TRANSCRIPT, in the shape both doors hand in.
 *
 * The hold is carried here because it changes only the opening words of a sentence. It is not
 * evidence: a session holding a handle is not a session that can answer.
 */
export interface TheTranscriptFacts {
  /** The session record this reading is about. Every sentence names it. */
  session: string
  /** True when this session is holding the agent's handle. */
  holdingTheHandle: boolean
  /** The transcript as the record stamps it, or null when no transcript path is on record. */
  stamp: DiscoveryStamp | null
  /**
   * A CODEX SESSION'S OWN ROLLOUT, found now because a codex record stamps no path.
   *
   * The bridge writes the thread id it speaks for and codex names the rollout after that thread, so
   * `theFactsOfASession` can find the file even though `stamp` is null. Null when no file was found
   * — and then the reading says it could not read, rather than inventing a cause.
   */
  codexLogPath: string | null
  /**
   * THE FIRST MESSAGE HANDED TO THIS SESSION LATER THAN AN INSTANT, or null when none was. Always
   * null for a session that holds no handle, because nothing is handed to it. It is read only when
   * asked (wave 13y round 82).
   */
  firstHandedOverAfter: (after: Date) => Date | null
}

/**
 * THE CODEX BRIDGE BAGS A SESSION'S RECORD MAY CARRY, in the order the office reads them.
 *
 * TWO WRITERS REGISTER A CODEX BRIDGE, and they write two different keys. The interactive bridge
 * writes `extra.codexBridge` with the pid, the script it runs and the thread it speaks for. The exec
 * worker writes `extra.codexCliWorker` with the pid it runs under, its process group, its thread and
 * its state directory, and no script — it runs `codex exec resume <thread>`, so the thread is what
 * ties its process to the session. Both mean the same thing here: a live process the office can tie
 * to this codex session. A record that carries neither, or a bag that is not an object, contributes
 * nothing rather than a plausible value.
 */
function theCodexBagsOn(record: PanelRecord): Record<string, unknown>[] {
  const extra = record.data['extra']
  if (extra === null || typeof extra !== 'object' || Array.isArray(extra)) return []
  const bags: Record<string, unknown>[] = []
  for (const key of ['codexBridge', 'codexCliWorker']) {
    const bag = (extra as Record<string, unknown>)[key]
    if (bag !== null && typeof bag === 'object' && !Array.isArray(bag)) bags.push(bag as Record<string, unknown>)
  }
  return bags
}

/**
 * THE CODEX THREAD A SESSION'S RECORD NAMES, from either bridge's own fields or the process behind it.
 *
 * THE BRIDGE'S RECORD FIRST, because it is the bridge's own statement of which conversation it
 * speaks for: `data.providerSession` is the thread, and the bridge bag carries the same id —
 * `extra.codexBridge.thread` for the interactive bridge, `extra.codexCliWorker.thread` for the exec
 * worker. THE PROCESS IS THE SECOND SOURCE, for a session whose record names its own pid: a
 * `codex resume <thread>` command line carries the thread, and it is read with the same reader that
 * reads a claude process. Neither source is guessed at, and no source at all answers null.
 */
function theCodexThreadOn(record: PanelRecord): string | null {
  const data = record.data
  if (data['runtime'] !== 'codex') return null
  const provider = data['providerSession']
  if (typeof provider === 'string' && provider.trim() !== '') return provider
  for (const bag of theCodexBagsOn(record)) {
    const thread = bag['thread']
    if (typeof thread === 'string' && thread.trim() !== '') return thread
  }
  const proc = theRecordedProcessOf(record)
  if (proc.pid !== null) {
    const id = codexThreadIn(commandLineOf(proc.pid))
    if (id !== null) return id
  }
  return null
}

/**
 * THE BRIDGE A CODEX RECORD NAMES, as either bridge bag writes it: its pid and any script it runs.
 *
 * A codex record keeps no discovery stamp, so the pid the office can ask about is the bridge's own,
 * written onto the record by the bridge itself. The interactive bridge writes `extra.codexBridge`
 * with a pid and the script it runs; the exec worker writes `extra.codexCliWorker` with a pid and no
 * script. Either bag is read, and a script is used only when one is there — the exec worker's
 * process is tied by its thread instead, through `theCodexProcessTiedTo`. The `state` field beside
 * either is a claim and is not read: whether that pid is alive, and still running that script or
 * naming that thread, is `theCodexProcessTiedTo`'s reading in session-process.mjs. A record with no
 * bridge, or one with no usable pid, answers nulls rather than a plausible value.
 */
function theCodexBridgeOn(record: PanelRecord): { pid: number | null; script: string | null } {
  let pid: number | null = null
  let script: string | null = null
  for (const bag of theCodexBagsOn(record)) {
    const candidate = bag['pid']
    if (pid === null && typeof candidate === 'number' && Number.isInteger(candidate) && candidate > 0) pid = candidate
    const candidateScript = bag['script']
    if (script === null && typeof candidateScript === 'string' && candidateScript.trim() !== '') script = candidateScript
  }
  return { pid, script }
}

/**
 * EVERYTHING ONE SESSION'S RECORD SAYS, gathered once so the hold path and the live-process path
 * cannot gather it differently.
 *
 * `machine` is the one resource read a caller that asks about many agents has already made; a
 * caller without it gets one read scoped to this session.
 */
export function theFactsOfASession(
  session: string,
  holdingTheHandle: boolean,
  workspaceId: string,
  machine?: () => readonly ResourceReport[],
): { process: TheProcessFacts; transcript: TheTranscriptFacts } {
  // THE SESSION'S OWN PROJECT, NOT THE REQUESTER'S. A hold is global and the chat is the person's across
  // every project (criterion M55), so a presence read made in one project may ask about a hold
  // claimed in another. The resource row is looked up where the session was registered; the one
  // resource read a roster already made is used only when it is that same project.
  const record = getRecord(session)

  // THE SESSION'S OWN PROCESS, THE TRANSCRIPT IT WAS FILED WITH, AND THE PROCESS ROWS, all read
  // once. Nothing is trusted yet: the judgement below is what order criterion M126 changed.
  const recordedProcess = record === null ? { pid: null, pidStartedAt: null } : theRecordedProcessOf(record)
  const itsProcess = theRecordedProcess(recordedProcess.pid, recordedProcess.pidStartedAt)
  const stamp = record === null ? null : stampOf(record)
  // A CODEX SESSION CARRIES NO STAMP, so its thread is read and its log looked for now. Only when
  // there is no stamp: a record that already names a transcript is read from that path and not from
  // a second one. The thread is also what ties a live codex process to this session, so it is read
  // once and used for both.
  const thread = stamp !== null || record === null ? null : theCodexThreadOn(record)
  const codexLogPath = thread === null ? null : theCodexRolloutFor(thread, join(theHomeDirectory(), '.codex', 'sessions'))
  // THE PROCESS A CODEX SESSION IS TIED TO, measured now: a live codex process whose arguments name
  // this thread, or the bridge the record itself names. Nothing here trusts the bridge's `state`.
  const codexTie =
    thread === null
      ? { trusted: false, says: 'no process was recorded for it' }
      : ((): { trusted: boolean; says: string } => {
          const bridge = theCodexBridgeOn(record as PanelRecord)
          return theCodexProcessTiedTo(thread, bridge.pid, bridge.script)
        })()
  const project = record?.workspaceId ?? workspaceId
  // Only process rows are read. A port row would walk /proc and be thrown away (problem FqD2s_8-Ci6A).
  const rows =
    machine === undefined || project !== workspaceId
      ? listResources({ workspaceId: project, sessionRecordId: session, type: 'process' })
      : machine().filter((one) => one.sessionRecordId === session)
  const processes = rows.filter((one) => one.type === 'process')
  const aLiveProcess = processes.some((one) => one.liveness.state === 'alive')
  const unchecked = processes.find((one) => one.liveness.state === 'unknown')
  // A ROW THAT READS ALIVE IS SAID FIRST. It is a fact the resource page shows, and a sentence
  // that denied it would make the office contradict itself about the same rows. An unchecked row is
  // said next — Mole Office could not look — and only when no row is alive and none could not be
  // checked does the sentence say no row reads alive. The record `Ga1VZCbpv63Y`: a `nobody` answer
  // is lawful when the session cannot answer, but it must admit a live row, not deny one.
  const theRowsSay = aLiveProcess
    ? 'a process resource row for it reads alive'
    : unchecked !== undefined && unchecked.liveness.state === 'unknown'
      ? `its process resource row could not be checked (${unchecked.liveness.reason})`
      : 'no process resource row for it reads alive'

  return {
    process: {
      itsOwnProcessIsAlive: itsProcess.trusted,
      aProcessRowIsAlive: aLiveProcess,
      aProcessIsTiedToTheSession: codexTie.trusted,
      itsOwnProcessSays: itsProcess.says,
      theTieSays: codexTie.says,
      theRowsSay,
    },
    transcript: {
      session,
      holdingTheHandle,
      stamp,
      codexLogPath,
      firstHandedOverAfter: holdingTheHandle ? (after) => theFirstMessageHandedToThisSessionAfter(session, after) : () => null,
    },
  }
}

/**
 * IS THE SESSION THESE FACTS DESCRIBE STILL ANSWERING? THE ONE READING, FOR BOTH DOORS.
 *
 * A hold and a live process row are two ways to arrive at the same question: is there a session
 * here that can take a message now? This function is the only place that question is answered. The
 * handle door (`whoIsAnsweringAs`) and the presence dot both call it — one through
 * `theSessionBehindTheHold`, one through the live-process branch in `participantPresence` — so a
 * live process with no transcript the office can read gets one word and one sentence, whichever
 * path found it. Criterion M126, extended to the process-row path.
 *
 * `now` is supplied by the caller so both doors measure the transcript against the same instant.
 */
export function theReadingOf(
  process: TheProcessFacts,
  transcript: TheTranscriptFacts,
  now: Date,
): HeldSessionReading {
  const lapse = handleLapsesAfterSeconds()
  const { session, holdingTheHandle, stamp, codexLogPath } = transcript
  const opening = theOpening(session, holdingTheHandle)
  // EVERY SENTENCE THAT SAYS NOTHING COULD BE READ NAMES THE PROCESS CHECK TOO, including when no
  // process was recorded at all, so a reader is not left thinking the process was never asked.
  const behindTheHold = `${process.itsOwnProcessSays}; ${process.theRowsSay}`
  // ONE TRANSCRIPT, WHICHEVER WAY IT WAS FOUND: a record's own discovery stamp, or a codex record's
  // rollout looked up by the thread it names. Everything below reads this one path, so a codex
  // session is judged by the same rules as any other and no second reading exists.
  const logPath = stamp !== null ? stamp.logPath : codexLogPath
  const toolName = stamp !== null ? stamp.tool : 'codex'
  // WHETHER ANY PROCESS OF THIS SESSION IS ALIVE NOW: its own recorded process, a process resource row,
  // or a live codex process tied to its thread. When the transcript cannot be read, this is what
  // separates "the office could not tell" from "the office knows it is not answering" (problem
  // `TOoUy7fMbg1P`). A session with a live process and no readable transcript may well be answering,
  // so it is not read as gone; a session with no live process and no readable transcript shows
  // nothing that could be answering.
  const aProcessIsAlive = process.itsOwnProcessIsAlive || process.aProcessRowIsAlive || process.aProcessIsTiedToTheSession
  // THE END OF EVERY SENTENCE FOR A TRANSCRIPT THAT COULD NOT BE READ, chosen by that one fact.
  const theEndWhenItCannotBeRead = aProcessIsAlive
    ? 'so whether it is still answering could not be read.'
    : 'so nothing shows it is still answering.'
  // THE PROCESS CHECK AS THE SENTENCE NAMES IT when the transcript could not be read. A tie to a codex
  // thread is named when it is the only live process, so a "could not tell" never rests on a process
  // the sentence leaves out.
  const theProcessCheck =
    !process.itsOwnProcessIsAlive && !process.aProcessRowIsAlive && process.aProcessIsTiedToTheSession
      ? `${behindTheHold}; ${process.theTieSays}`
      : behindTheHold

  // ---------------------------------------------------------- M126: the transcript's last word
  // BEFORE ANY PROCESS IS TRUSTED, the session's own transcript is asked whether it ended on a
  // cause the person must act on. A process that is still running is not a session that can answer:
  // a usage limit, a quota or a login failure leaves the waiter or bridge beating while the session
  // behind it is frozen. When the last real line names one of those causes, nothing later in the
  // transcript shows the session went on, and the sentence says so in the cause's own words.
  if (logPath !== null) {
    const stopCause = theStopCauseAtTheEndOfTheTranscript(logPath)
    if (stopCause !== null && isACauseTheyMustActOn(stopCause.kind)) {
      return {
        answering: false,
        couldNotTell: false,
        from: null,
        says: theSentenceForAStoppedSession(session, stopCause, holdingTheHandle),
      }
    }
  }

  // ---------------------------------------------------------- M126: no transcript, no reading
  // WHERE NO TRANSCRIPT PATH IS RECORDED, a live process alone does not make a session answering. A
  // codex bridge is a process the session registered that keeps running while the codex session it
  // speaks for has hit a limit and stopped, so the process row would say "answering" about a session
  // that cannot answer. The office says it cannot read this rather than guessing either way. A codex
  // record whose rollout could not be found lands here too: no file was found, so nobody looked, and
  // that is said rather than read as a working session.
  //
  // WHEN A PROCESS OF IT IS ALIVE, THE OFFICE COULD NOT TELL, and says so. That is not the same as
  // "not answering": a message to it does not go up its chain of starters on this alone (problem
  // `TOoUy7fMbg1P`). When nothing of it is alive either, nothing shows it is answering.
  if (logPath === null) {
    const processFact =
      process.itsOwnProcessIsAlive || process.aProcessRowIsAlive
        ? `a process of it is alive now (${process.itsOwnProcessSays}; ${
            process.aProcessRowIsAlive ? 'a process resource row for it reads alive' : process.theRowsSay
          })`
        : process.aProcessIsTiedToTheSession
          ? `a process of it is alive now (${process.theTieSays})`
          : behindTheHold
    return {
      answering: false,
      couldNotTell: aProcessIsAlive,
      from: null,
      says: `${opening} ${processFact}, and no transcript was recorded for it, ${theEndWhenItCannotBeRead}`,
    }
  }

  // THE TRANSCRIPT ITSELF, read through the adapter that wrote the record or, for a codex session
  // that wrote no stamp, through the shared codex reader. It is read before the process checks so a
  // reading that answers from a process can say how long the log has been quiet. A session recorded
  // under a tool this build has no reader for cannot be read at all; that is an absence and it is
  // said rather than guessed.
  const wrote =
    stamp === null
      ? theCodexTranscriptLastWrittenAt(logPath)
      : (() => {
          const adapter = adapterFor(stamp.tool)
          if (adapter === null) return null
          return adapter.transcriptLastWrittenAt({ externalId: stamp.externalId, logPath })
        })()
  // HOW LONG AGO THE TRANSCRIPT LAST GREW, when it could be read and dated. Null when it could not,
  // and the sentence for a process that answers anyway then says nothing about the log.
  const quiet = wrote !== null && wrote.read ? Math.max(0, Math.round((now.getTime() - wrote.at.getTime()) / 1000)) : null
  // THE SENTENCE FOR A LIVE PROCESS WITH A QUIET LOG (criterion M126). A process is alive and tied
  // to this session, and the transcript on record has not grown for longer than the lapse, so the
  // reading says when the log was last written and names the process that makes it answering still.
  const theQuietSince =
    wrote !== null && wrote.read && quiet !== null && quiet > lapse
      ? theSentenceForAQuietLog(session, wrote.at, quiet, lapse, holdingTheHandle, theAliveProcessWords(process))
      : null

  // A MESSAGE HANDED OVER AFTER THE TRANSCRIPT LAST GREW, AND LEFT UNREAD FOR TOO LONG. Problem
  // `-MLrleDe93wM`. This comes before every process check, because a live process is what kept
  // an agent reading as answering while nobody read. It is asked only of a transcript that was read.
  if (wrote !== null && wrote.read) {
    const lastRead = wrote.at
    const unread = transcript.firstHandedOverAfter(lastRead)
    const limit = handleUnreadAfterSeconds()
    if (unread !== null && now.getTime() - unread.getTime() > limit * 1000) {
      return {
        answering: false,
        couldNotTell: false,
        from: null,
        says: theSentenceForAnUnreadHandOver(session, lastRead, unread, limit, holdingTheHandle),
      }
    }
  }

  // THE SESSION'S OWN PROCESS FIRST, when a transcript is on record. A session waiting in its
  // terminal writes nothing to its transcript, yet it can take a message now: the waiter hands the
  // message over and the session wakes. A pid number that is merely running is not this session: its
  // start time and command line have to match as well, so a reused number is not mistaken for a
  // process that is still there.
  if (process.itsOwnProcessIsAlive) return { answering: true, from: 'its process', says: theQuietSince }

  // A PROCESS RESOURCE ROW FOR THAT SESSION THAT READS ALIVE. This is what `runServing` checks for a
  // run, asked here about the session a hold names or a process row belongs to. It counts only now
  // that a transcript is on record and its last line is not a stop cause.
  //
  // BUT NOT FOR A CODEX SESSION, BECAUSE THE ROW IS THE BRIDGE. A codex bridge keeps running while
  // the codex session it speaks for is frozen, which is the defect M126b removed; with a rollout
  // found, that rollout's own freshness is what answers below, and the bridge is not asked.
  if (stamp !== null && process.aProcessRowIsAlive) return { answering: true, from: 'a live process', says: theQuietSince }

  if (wrote === null) {
    return {
      answering: false,
      couldNotTell: aProcessIsAlive,
      from: null,
      says:
        `${opening} ${theProcessCheck}, and this build has ` +
        `no adapter that can read a "${toolName}" session's transcript, ${theEndWhenItCannotBeRead}`,
    }
  }
  if (!wrote.read) {
    return {
      answering: false,
      couldNotTell: aProcessIsAlive,
      from: null,
      says: `${opening} ${theProcessCheck}, and its transcript could not be read (${wrote.reason}), ${theEndWhenItCannotBeRead}`,
    }
  }
  if (quiet === null || quiet <= lapse) return { answering: true, from: 'its transcript', says: null }

  // A CODEX SESSION'S OWN PROCESS, TIED BY ITS THREAD, ANSWERS FOR AN OLD TRANSCRIPT (criterion
  // M126). A codex record stamps no pid, so the tie is read through session-process.mjs: a live
  // `codex resume <thread>` process, or the bridge the record itself names. The transcript is older
  // than the lapse, but a process known to be this session's is alive, so the reading answers from
  // it — the same answer the recorded process gives a claude-code session — and the quiet sentence
  // says why. This comes after the fresh check so a fresh codex log still answers from the log, as
  // it did before.
  if (process.aProcessIsTiedToTheSession) return { answering: true, from: 'its process', says: theQuietSince }

  // THE TRANSCRIPT WAS READ, IT IS OLD, AND NO PROCESS THAT COUNTS HERE IS ALIVE: the office knows
  // nothing is answering. A live codex bridge row does not make this "could not tell", because the
  // rollout was read and the bridge is not the session (M126b).
  return {
    answering: false,
    couldNotTell: false,
    from: null,
    says:
      `${opening} ${behindTheHold}, and its transcript ` +
      `last grew ${String(quiet)} seconds ago — longer than the ${String(lapse)} seconds a hold is allowed — ` +
      'so nothing shows it is still answering.',
  }
}

/**
 * IS THE SESSION NAMED ON THIS HOLD STILL ANSWERING?
 *
 * The handle door's entry point. It gathers the session's facts and hands them to `theReadingOf`,
 * the one judgement; it adds nothing of its own, so the hold path and the live-process path cannot
 * drift apart.
 */
export function theSessionBehindTheHold(
  hold: HoldOnTheWire,
  workspaceId: string,
  now: Date,
  machine?: () => readonly ResourceReport[],
): HeldSessionReading {
  const { process, transcript } = theFactsOfASession(hold.session, true, workspaceId, machine)
  return theReadingOf(process, transcript, now)
}
