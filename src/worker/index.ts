// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sayInEnglish } from '@shared/i18n.ts'
import { everyParticipantPage } from '@shared/every-participant-page.ts'
export { PARTICIPANT_PAGE_LIMIT as WORKER_PARTICIPANT_PAGE_LIMIT } from '@shared/every-participant-page.ts'
import type { UsageReceipt } from '../shared/usage-receipts.ts'
/**
 * THE MESSAGE WORKER: it takes the queue and starts a run of an agent's tool for each message.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M9 of `design/messages/ACCEPTANCE.md`. Until 4 September 2026 a message to an agent that
 * was not already running sat in the queue for ever: three wake routes wrote down that somebody
 * wanted an agent woken and nothing acted on one. A decision settled that processes may be started
 * on this machine — proposal `LVH7c4IrtwIE`, decision
 * `oaJ-pSntZ3m-`.
 *
 * It is a separate process. The API server starts it on boot through the one narrow method on
 * `OsProbe`, registers it in the resources ledger, and stops it when it stops.
 *
 *     node_modules/.bin/tsx src/worker/index.ts --session <the session record for this worker>
 *
 * ---------------------------------------------------------------------------------------
 * WHAT ONE PASS DOES
 * ---------------------------------------------------------------------------------------
 *
 * 1. Pick up any run another worker was watching, then read `GET /api/worker/queue`.
 * 2. For each message, in the order it was sent, ask whether a run may start for it. A line Mole
 *    Office wrote is delivered without one, because a line saying what happened to a group is for
 *    people to read. Otherwise seven things can say no, and every one of them writes a sentence onto
 *    the delivery row rather than leaving a clock nobody can explain: the agent is retired, nobody
 *    set a runtime word, no adapter serves that word, the tool is not installed, the agents in this
 *    conversation have said as much as they may without a person, the chain of replies has gone as
 *    far as it may, a run is already serving that agent, or too many runs are going.
 * 3. Where a run may start: file a session record for it, write the rules into the working
 *    directory, start the tool, register the process under that session, and mark the message
 *    delivered — the clock becomes a tick.
 * 4. Look at the runs already going. For each that has ended, read what it said, file it as the
 *    agent's reply, and mark the session finished. When filing the reply is refused, the refusal is
 *    written on the row a person reads, the answer is kept, and it is tried once more after a wait;
 *    a second refusal says so and names the file the words are in. Nothing is dropped in silence.
 *
 * BESIDE THE MESSAGES, THE OFFICE'S MERGE TOOL (sandbox v1, piece P9). The server marks a merge entry
 * whose next move is the merge tool's; each pass starts `tools/the-merger.mjs` — no model — for a marked
 * entry in a slot of its own, registers it in the ledger, stops it by its group when its entry is
 * withdrawn or superseded, and records how it ended. See `tendTheMergeTool`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES NOT DO, SAID PLAINLY
 * ---------------------------------------------------------------------------------------
 *
 * IT HOLDS NO DATABASE PATH. Everything above goes through the API. A worker writing rows itself
 * would bypass validation.
 *
 * IT KEEPS ITS RUNS IN MEMORY AND PICKS THEM BACK UP FROM WHAT IS STORED. A worker that is
 * restarted has an empty list, so every pass begins by reading `GET /api/worker/runs`: every run of
 * this project whose session record says running, that Mole Office started, and that has a ledger
 * row saying which process it is. Those are watched exactly as runs this worker started, and a run
 * that ended while nobody was watching has its answer read off disk and filed at once. Until 4
 * September 2026 the reply was simply lost, and the API server restarts on every merge under
 * `tsx watch`, so that was not a rare state (problem `wrtc5jmjIVpM`).
 *
 * IT STARTS ONE RUN PER MESSAGE AND RESUMES BY THE PROVIDER'S ID. Whether a run should instead be
 * kept alive between messages is a cost question and it is the owner's; section 7.5 of the
 * acceptance document names it as one to put to the owner. Per-message is what is built meanwhile.
 */

import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { THE_MESSAGE_WORKER_ID, theRuntimeWordsSaid, whyTheOfficeCannotStartThisRuntime } from '@shared/participants.ts'
import { readStoredWord } from '@shared/i18n.ts'
import { clockStamp, type ClockStamp } from '@shared/time.ts'
import { stateWord } from '@shared/words.ts'
import { MERGE_TOOL_RUNTIME } from '@shared/merge-queue.ts'
import { MERGE_QUEUE_SNAPSHOT_CHANGING } from '@shared/merge-queue-snapshot.ts'
import { ROUND_LAUNCHER_RUNTIME } from '@shared/next-round.ts'
import { A_WORKER_LAUNCHER_PURPOSE } from '@shared/worker-runs.ts'
import type { TheRowAMessageRunKeeps } from '@shared/run-models.ts'
import type { CastingSelection } from '@shared/casting.ts'
import { whyACheckWaitsItsTurn, type ThePaceOfACheck } from '@shared/checks-an-hour.ts'
import { whatOnMeans, whyNoFurtherCheckNow } from '@shared/checks-in-merges-only.ts'
import { whetherAnOfficeWouldStartACheck } from '@shared/whether-a-check-would-start.ts'
import { theMessageWaitsForARunGoing, type AlreadyAnsweringOnARow } from '@shared/handles.ts'
import { DELIVERY_ENVELOPE, quotesOf, routedOf, theMessageAnAgentReads, theRoutedLineFor, type TheGroupOfAHandOver } from '@shared/messages.ts'
import type { AMarkedPartOnTheWire } from '@shared/intent-mark.ts'
import type { Context } from '@shared/targets.ts'

import { NO_MODEL_SAYS } from '../config/agent-model.mjs'
import { theNativeSelectionRefusal, theRefusalOfAnEffortNotTheRows } from '../config/launcher-selection.mjs'
import { MERGES_ONLY_SAYS, REPO_ROOT, THE_RUN_OUTPUT_FOLDER, THE_WORKER_ENTRY, gateNumber, isTheProgramRun, mergedEnvironment, settingValue, settings, workerCheckoutFrom } from '../config/settings.mjs'
import { whyAnOfficeToolMayNotRunIn } from '../config/the-office-tool-environment.mjs'
import { KEY_HEADER } from '../config/key-header.mjs'
import { theOfficeKey } from '../config/office-key.mjs'
import { aWatchOnTheStarter } from '../config/session-process.mjs'
import { FAKE_INSPECTION_TOOL_SETTING, InspectionAdapter } from './runtimes/inspection.ts'
import { theSeatWaitsIn } from '../config/a-checks-seat-wait.mjs'
import { A_MERGE_TOOL_RUNS_RECEIPT, MergeAdapter } from './runtimes/merge.ts'
import { A_ROUND_LAUNCHER_RUNS_RECEIPT, RoundAdapter, type RoundLauncherEnding } from './runtimes/round.ts'
import type { MergeToolEnding } from '../config/merge-tool.mjs'
import type { MessageHold } from '../config/gates.mjs'
import { WORLD_HEADER, parseWorldHeader } from '../config/world-header.mjs'
// Which world this worker lives in, on every request it makes. Criterion C4.
import { HOME_HEADER } from '../config/visit-headers.mjs'

import { promptFor } from './prompt.ts'
import { outputTiming } from './timing.ts'
import { whereItRan } from '../config/usage.mjs'
import { theModelsSteps, whyTheCheckCrashed } from '../config/inspection-ending.mjs'
import { chaptersSelectedForRun, howToLead, writeRulesInto, type RulesWritten } from './rules.ts'
import { theToolARunDeclares, type RunHandle, type RunResult, type RuntimeAdapter, type ServedReading } from './runtimes/adapter.ts'
import { NOT_REPORTED } from '../config/claude-code-served.mjs'
import { adapterFor, fakeRuntimeScript } from './runtimes/index.ts'
import { outputOf } from './runtimes/common.ts'
import { makeStartupWitness, forgetStartupWitness, withStartupGate, releaseStartupGate, abortStartupGates, theGatedProgramThatRan, theProgramThatRan, startInItsOwnGroup, endGroupWithinASecond, stillRunning, exitCodePathOf, problemPathOf, listenForAStopRequest, whereAPickedUpRunRuns } from './runtimes/os.ts'
import { envFor } from './runtimes/adapter.ts'
import { withHowItWasEnded } from './runtimes/common.ts'
// THE HANDLE'S OWN BEAT WINDOW, read the one way every reader of that setting reads it. The worker
// opens no database and this file imports nothing that does; see the header of lib/env.ts.

// ============================================================================ what the worker is

/** One run this worker is watching. */
interface Watching {
  /** An interrupted startup's recorded group is still occupied. */
  startupGroupHeld?: boolean
  inspection?: { run: string; checkout: string | null; only?: string[]; needsJudgment?: { path: string; why: string }[] }
  adapter: RuntimeAdapter
  handle: RunHandle
  /** The session record filed for this run. */
  session: string
  /** The message it is delivering. */
  messageId: string
  /** The agent it serves, by registry id. */
  agentId: string
  /** The agent's handle, for the words a person reads. */
  handleName: string
  /**
   * The ledger row registered for this run, so it can be released when the run ends.
   *
   * Null when the run had already finished by the time it was registered and the ledger refused it:
   * there is then no row, and the sentence on the delivery row says so.
   */
  ledgerRow: string | null
  /**
   * The visit registered at the office for this run, so it can be ended when the run ends.
   *
   * Null for a run working at home, which needs none, and for one this worker picked up after a
   * restart — the visit that run holds was registered by the worker that started it, and this one
   * has no way to learn its id. That is said rather than guessed at: a wrong id would end somebody
   * else's trip.
   */
  visit?: string | null
  /**
   * WHETHER THIS RUN IS HOLDING THE AGENT'S HANDLE. Criterion M79.
   *
   * A run holds the handle while it answers, so the agent reads as Answering from the moment the
   * run starts until it ends rather than going offline the moment it has spoken. False when the
   * hold was refused, which does not stop the run: what a refusal costs is a colour on a screen.
   *
   * Absent on a run this worker picked up after a restart. The hold that run took is still on the
   * record and the worker that took it is gone, so this one neither beats it nor lets it go: the
   * grace and the lapse windows end it, which is what they are for. Saying so is better than
   * guessing, and better than a second worker beating somebody else's hold.
   */
  holdsTheHandle?: boolean
  /**
   * What the run said, once the run has ended and its output has been read.
   *
   * Kept because filing it can be refused, and a refused answer is tried again rather than thrown
   * away. Absent while the run is still going, or before its output has been read once.
   */
  said?: { text: string; because: string }
  /**
   * HOW THE RUN ENDED AND WHAT ITS TOOL SAID ABOUT THAT, kept beside the answer.
   *
   * The run's own record is patched from this, and that patch happens AFTER the question of whether
   * a restart cut the run off has been asked — because the answer to that question is what the
   * record should say. Absent until the output has been read.
   */
  ended?: { endedHow: string; because: string; providerSession: string | null; usageReceipt?: UsageReceipt; served?: ServedReading['served']; stopCause?: RunResult['stopCause']; inspectionEnding?: RunResult['inspectionEnding']; dshTranscriptRefused?: true }
  /** True once this run's own record has been patched to say how it ended. Patched at most once. */
  patched?: boolean
  /**
   * A CHECK'S WAITS FOR A TEST-BATCHES SEAT, read from its output while it runs.
   *
   * `offset` is how many bytes of the output have been read, so a pass reads only what came after the last one.
   * `closedMs` is every wait that began and finished, added up. `openSince` is the instant the wait now open began.
   * `readALine` says whether the output held a seat line at all: without one, the clock counts from the program's
   * start as it always did, and no wait is recorded. `atTheStopMs` is the wait at the instant the worker stopped the
   * check, kept so the record says the wait that was left out of that stop, not one that grew while the stop happened.
   *
   * Absent on a run that is not a check, and on a check whose output has not been read yet.
   */
  seatWait?: { offset: number; closedMs: number; openSince: string | null; readALine: boolean; atTheStopMs?: number }
  /**
   * THE TOKENS SO FAR, as recordTheTokensSoFar last read and wrote them. `readAt` is when the adapter was last asked.
   * `written` is every count written on the record, oldest first, after a 0 for the run's start. `writtenAt` is when
   * the last was written, or null before the first. Absent until the first reading.
   */
  tokens?: { readAt: number; written: number[]; writtenAt: number | null }
  /** How many times filing this answer has been refused. */
  refused?: number
  /**
   * THE SENTENCE THIS WORKER LAST WROTE ON THE DELIVERY ROW.
   *
   * Sent back with the next one, so that a sentence somebody else wrote in between is kept rather
   * than overwritten. Problem `BGEX4JjSouCL`: a person stopped a run, the row said who and why, and
   * the worker's next pass wrote "The run ended without answering" over it two seconds later.
   */
  lastSaid: string
  /** Not before this moment (milliseconds since the epoch) is filing tried again. */
  tryAgainAt?: number
  /**
   * THE MESSAGE THIS RUN WAS DELIVERING, when this worker picked the run up rather than starting it.
   *
   * Criterion M24: a run a restart cut off is carried on by a new run resuming its conversation, and
   * starting that needs the words the first run was given. A run this worker started itself has no
   * need of it — it was started under this server, so a restart cannot have cut it off.
   */
  delivering?: {
    body: string
    quotes?: readonly Context[]
    quotePositions?: readonly number[] | null
    sentAt: string
    sentBy: { kind: string; id: string } | null
    /** Who sent it, in the words the office handed over with the run. */
    whoSentIt?: string
    /** How the sender asks to be addressed, in the words the office handed over, or null. */
    howToAddressTheSender?: string | null
    /** The group the message was sent to, as the office handed it over, or null for a direct message. */
    fromGroup?: TheGroupOfAHandOver | null
    startedBefore: boolean
    /** The fourth envelope line, when the routing also gave this message to the run's agent. */
    routedLine: string | null
    /** The person's mark on the message, as the office handed it over with the run, or absent for no mark. */
    intent?: unknown
    /** The person's own label on the message, or absent for no label. */
    label?: unknown
    /** The instruction the office handed over for the mark, or absent because there is none. */
    whatTheMarkAsks?: string
    /** The instruction the office handed over for the person's own label, or absent because there is none. */
    whatTheLabelAsks?: string
    markedParts?: readonly AMarkedPartOnTheWire[]
    noMarkName?: string
  }
}

/**
 * ONE MERGE TOOL RUN THIS WORKER IS WATCHING. Sandbox v1, piece P9, SPEC.md 5.3.
 *
 * A LIST OF ITS OWN, BESIDE THE AGENT RUNS AND NOT IN IT. A merge tool run delivers no message, serves
 * no agent and holds no handle, so it has none of the fields a watched agent run is read by; and it
 * takes none of the `MOLE_OFFICE_WORKER_RUNS` places, which are the agent runs' (the check tool's
 * included). It has a slot of its own, `MERGE_TOOL_SLOTS`, so a merge never holds up an agent's answer
 * and an agent run never holds up a merge.
 */
interface WatchingAMerge {
  /** The merge entry it runs for. */
  entry: string
  adapter: MergeAdapter
  handle: RunHandle
  /** The session record filed for this run. */
  session: string
  /** Its ledger row, released when it ends, or null because none is known to this worker. */
  ledgerRow: string | null
  /** The office's sentence for stopping it, once this worker has stopped it for that reason. */
  stoppedBecause?: string
  /** How it ended, read once off its output. */
  ended?: MergeToolEnding
  /** A run that only pins a submitted entry, in the pin slot. Absent on a merge run, and on a run picked up from a worker before this one. */
  pinOnly?: true
  /** A run that checks a resolving entry's resolution, in the same slot. Absent as `pinOnly` is. */
  checkResolution?: true
}

/** One row of `wanted` on GET /api/worker/merges: an entry the office wants its merge tool for. */
interface AMergeToStart {
  entry: string
  state: string
  lane: string
  adapter: string
  since: string
}

/** One row of `going`: a live merge tool run or an ended run with a running session row. */
interface AMergeToolRun {
  entry: string
  state: string
  session: string
  log: string
  pid: number | null
  pgid: number | null
  startedAt: string
  /** Its live ledger row, or null. */
  resource: string | null
  /** The entry already records how the run ended, while its session row still says running. */
  endedOnTheEntry: string | null
  stop: string | null
  startupFailed: string | null
}

/**
 * HOW MANY MERGE TOOL RUNS GO AT ONCE: ONE, beside the agent runs and not counted among them. SPEC.md 5.3:
 * the merge gets a slot of its own. One, because SPEC.md 5.4 has a merge tool run test
 * under the machine's full-suite lock and restart the office itself when it lands, and two of those at
 * once is what the lanes and the lock exist to prevent. Not a setting: nobody has needed two.
 */
export const MERGE_TOOL_SLOTS = 1

/**
 * HOW MANY PIN-ONLY RUNS GO AT ONCE BESIDE IT: ONE (problem GS4-3r9FQQCv, agreed with the merge tool's keeper in message yf17WKvB1SCR).
 * While the merge slot is busy, often with a suite of an hour, an entry submitted meanwhile would wait unpinned and
 * unjudged, and miss the next bus. A pin-only run pins it: it takes no lane, no sandbox and no full-suite seat, so it
 * cannot do what the merge slot's one-at-a-time prevents. It is never started for the entry a merge run holds. A run
 * picked up from a worker before this one is counted as a merge run, since nothing on it says it only pins; that can
 * only hold a pin back, never start a second merge.
 *
 * THE CHECK OF A RESOLUTION TAKES THE SAME SLOT, and only that slot, whether the merge slot is busy or not (see
 * XHY2fVFG3Qq8, answer 1): it takes no lane, no sandbox and no full-suite seat either, and starts no git housekeeping.
 */
export const MERGE_PIN_SLOTS = 1

/** The merge tool runs this process watches, for a caller of `onePass` that hands in no list of its own. */
const theMergeRunsOfThisProcess: WatchingAMerge[] = []

/**
 * ONE LAUNCHER RUN THIS WORKER STARTED FOR A NEXT ROUND (wave 13j round loop-2, src/server/lib/next-round.ts). A list
 * of its own, as the merge tool's is: it delivers no message and serves no agent. It is not picked up by a worker
 * that starts after this one; the launcher returns once it has started the round, so the window is seconds.
 */
export interface WatchingARound {
  /** The agent's last run, which holds the ask; for a worker run, the supervisor's run, which holds it. */
  run: string
  /** The worker's registry id, for a launcher started for a worker run (wave 13j round loop-3). Absent for a next round. */
  worker?: string
  /** The worker's own launcher run. */
  wrapper: string
  /** The project the launcher run is filed in: the worker's own, or for a worker run the project the asking run is in. */
  workspace: string
  adapter: RoundAdapter
  handle: RunHandle
  ledgerRow: string | null
  /** How it ended, read once off its output. */
  ended?: RoundLauncherEnding
}

/** One row of GET /api/worker/rounds. */
interface ARoundToStart {
  workspaceId: string
  run: string
  agentId: string
  handle: string
  runtime: string | null
}

/** One row of GET /api/worker/worker-runs, which lists every project the office's list holds. */
interface AWorkerRunToStart {
  run: string
  agentId: string
  handle: string
  /** The project the run that asked is filed in. */
  workspaceId: string
}

/** The launcher runs this process watches, for a caller of `onePass` that hands in no list of its own. */
const theRoundsOfThisProcess: WatchingARound[] = []

/** What one entry in `GET /api/worker/queue` says. */
interface Waiting {
  /** A starter change temporarily holds a new run for this recipient. */
  heldByStarterChange?: string
  /**
   * The check to start; `only` and `needsJudgment` make it a scoped check (sandbox v1, piece P7).
   * `model` is the model the office chose for the check (criterion U2), absent when it chose none.
   */
  inspection?: { run: string; checkout: string | null; only?: string[]; needsJudgment?: { path: string; why: string }[]; model?: string; waits?: string; pace: ThePaceOfACheck }
  messageId: string
  inheritedFromCopy?: boolean
  workspaceId: string
  /** Where the message was written, as the queue said it. Absent from an older office. */
  writtenIn?: { project?: string; page?: string } | null
  to: { kind: string; id: string }
  handle: string
  runtime: string | null
  /**
   * The model and reasoning effort the office chose for this run (criterion U2). Null or absent
   * means it chose none, and the adapter reads this worker's own environment.
   */
  model?: string | null
  variant?: string | null
  /** The Casting row the queue read for this message run, or none, with its sentence. Absent from an older office. */
  kept?: TheRowAMessageRunKeeps
  retired: boolean
  /**
   * THE WORDS OF THE MESSAGE, WHEN THIS PROCESS HAS THEM. By a decision, the queue answers
   * narrow and carries no bodies, because a pass that starts few runs was reading the words of every
   * message it did not start. A row carried over from GET /api/worker/runs has the words
   * here; a row off the narrow queue does not, and `onePass` asks the message record for them once, only on the
   * messages it is about to start.
   */
  body?: string
  quotes?: readonly Context[]
  quotePositions?: readonly number[] | null
  sentBy: { kind: string; id: string } | null
  /**
   * WHO SENT IT, in the words the office read from its registries and every hand-over prints
   * (problem ynGL0myEnAbi). `promptFor` passes them to the envelope unchanged. Missing only where the
   * office's answer did not carry them, and then the prompt says the office did not name the sender.
   */
  whoSentIt?: string
  /**
   * HOW THE SENDER ASKS TO BE ADDRESSED, in the words the office handed over with `whoSentIt`, or
   * null because the sender set no part. Missing where the office's answer
   * did not carry it, and then the prompt has no line for it.
   */
  howToAddressTheSender?: string | null
  /**
   * THE GROUP THE MESSAGE WAS SENT TO, as the office handed it over, or null because it was sent to no group, as item 5
   * of a decision says. `promptFor` passes it to the envelope, whose first line then names the
   * group. Missing where the office's answer did not carry it, and then there is no line.
   */
  fromGroup?: TheGroupOfAHandOver | null
  sentAt: string
  /**
   * The conversation a run may pick up again, with the runtime word that made it and the session record of the newest
   * run in it (`PickUp` in src/server/lib/worker.ts), or null.
   */
  resume: { id: string; runtime: string; run: string } | null
  hops: number
  /** Why this message needs no run at all, in one sentence, or null because it may have one. */
  needsNoRun: string | null
  /** True when `needsNoRun` is the office's ask for a check of a run that is already settled. */
  askOfASettledRun?: true
  /** Why nothing more is started in this conversation until a person writes, in one sentence, or null. */
  conversationIsWaiting: string | null
  runningAlready: AlreadyAnsweringOnARow['runningAlready']
  /**
   * THE ONE WAITING SENTENCE FOR THE RUN ALREADY GOING, or null because the row carries none.
   *
   * The server builds it with `theAlreadyAnsweringOnARow`, the one function that puts who is
   * answering (the same sentence the chat's answering mark reads) beside what happens to this
   * message. So the message's waiting sentence and the chat say the same thing about one run, and it
   * names the sandbox INSTANCE when the run's record names one. A row whose run was started by this
   * pass did not exist when the server read the queue, so it carries none and `whyNotNow` builds the
   * same sentence for an office-started run rather than leaving the message with no reason. The type
   * comes from `AlreadyAnsweringOnARow`, so this field and `runningAlready` are declared together.
   */
  runningAlreadySays?: AlreadyAnsweringOnARow['runningAlreadySays']
  /** Why a live session is answering as this agent, in one sentence, or null because none is. */
  heldByALiveSession: string | null
  /** Why nothing is started because the permanent resident it is for is asleep, present only on a message that is not urgent then. */
  heldWhileAsleep?: string
  noticeBatchAvailable?: true
  heldByNoticeRule?: string
  /** Why a review that has not been sent is holding this comment back, or null. Criterion M28. */
  heldByAReview: string | null
  /**
   * Why nothing is answering as this agent and the person has not pressed, or null. Criterion M78.
   *
   * It is the only reason on this row that holds a message because nothing is there rather than
   * because something is, and one press by the person is what clears it.
   */
  nobodyIsAnsweringAsIt: string | null
  /**
   * The holds whose gate is off and which would have held this message at block, told to the server when a run takes
   * it, or when the line needs no run and is delivered without one.
   */
  wouldHaveHeld?: MessageHold[]
  /**
   * SENT AS AN EMERGENCY. Criterion M62.
   *
   * The queue already puts every one of these in front of every ordinary message, so the worker
   * does no reordering: the loop takes the list as it comes. This flag is here for the OTHER half,
   * which is what the run is told — the prompt says so in its first line.
   */
  urgent: boolean
  /**
   * THE ROUTED LINE, WHEN THIS DELIVERY'S RECIPIENT IS ONE THE ROUTING CHOSE.
   * The server builds it once with `theRoutedLine`, and `promptFor` puts it in the
   * envelope's fourth line. Null when this recipient is the addressee, or when nothing was routed.
   */
  routedLine?: string | null
  /** The person's mark on the message, as its record holds it, or absent for no mark. `promptFor` hands it on. */
  intent?: unknown
  /**
   * THE PERSON'S OWN LABEL AND THE TWO INSTRUCTIONS, as the message read gives them. The record has the stored mark
   * and label but not the office's reading of the sender's flags, so these come from GET /api/messages/:id and never
   * from the queue row.
   */
  label?: unknown
  whatTheMarkAsks?: string
  whatTheLabelAsks?: string
  markedParts?: readonly AMarkedPartOnTheWire[]
  noMarkName?: string
}

/** How the worker was started. */
export interface WorkerSettings {
  api: string
  workspace: string
  /** The session record the API server filed for this worker, or null when it was started by hand. */
  session: string | null
  /**
   * THE PROCESS THAT STARTED THIS ONE, so a worker never outlives the server it belongs to.
   *
   * The server does the same thing with the shell that started it, and for the reason CLAUDE.md
   * gives: five orphaned-process incidents in this repository, one of them serving stale data out
   * of a deleted database. A worker whose server was killed outright would poll an address nothing
   * answers, for ever, and nobody's list would have it. Null when it was started by hand.
   */
  stopWithPid: number | null
  /** The checkout a run may work in. Nothing outside it is allowed. */
  checkout: string
  /** How many runs may be going at once. */
  runs: number
  /** How far agents may answer each other before a person has to say something. */
  hops: number
  /** Where a run's output is written. */
  outputRoot: string
  /** The environment the adapters read, with the fake-runtime setting resolved through settings.mjs. */
  env: NodeJS.ProcessEnv
  /**
   * TRUE WHEN `MOLE_OFFICE_MESSAGE_WORKER=merges-only`: a pass starts the office's merge tool, the rounds asked
   * through the next-round door (`tendTheRounds`) and the worker runs asked through the worker-run door
   * (`tendTheWorkerRuns`), and `startOne` refuses every run for a message and every check (a
   * check only while `checksInMergesOnly` is set, below). `MERGES_ONLY_SAYS` in
   * src/config/settings.mjs is what that means. `workerSettingsFrom` always sets it. A caller that
   * builds its own settings and leaves it out gets the worker as it was before the mode existed.
   */
  mergesOnly?: boolean
  /**
   * TRUE ONLY FOR A PASS IN MERGES-ONLY MODE WHOSE OFFICE ANSWERED THAT CHECKS RUN IN THAT MODE (GET
   * /api/office/checks-in-merges-only, wave 13j round loop-1). `onePass` sets it on the copy it hands `startOne`, and
   * then `startOne` starts a check and still refuses every agent run. Nothing else sets it.
   */
  checksInMergesOnly?: boolean
}

/** What one pass did, so a test can read it and a person can watch it in the log. */
export interface PassReport {
  started: { messageId: string; agent: string; runtime: string; session: string }[]
  held: { messageId: string; because: string }[]
  answered: { messageId: string; reply: string }[]
  failed: { messageId: string; because: string }[]
  /** Runs another worker started that this pass took over, by session record. */
  pickedUp: string[]
  /** Runs whose wait for the next message ran out in this pass, by session record (criterion M22). */
  waitedLongEnough: string[]
  /**
   * Runs a restart of the API cut off, ended in this pass (criterion M24).
   *
   * `carriedOnBy` is the session record of the run that picked the conversation up, or null because
   * none could be started and the conversation was told so instead.
   */
  cutOff: { session: string; carriedOnBy: string | null }[]
  /**
   * Interrupted runs the person pressed resume on, started in this pass (criterion W7): the run that
   * was resumed and the run that took its conversation up.
   */
  resumed: { session: string; as: string }[]
  /**
   * WHAT THE DEAD-LETTER SWEEP DID IN THIS PASS (criterion M111): the group the addressees were
   * announced in, or null because nothing was sent; the addressees newly named; and why, in one
   * sentence. Null when the sweep could not run, which is printed where a person reads the log —
   * a failed read is never reported as a line that was not sent.
   */
  deadLetters: { groupId: string | null; addressees: string[]; because: string } | null
  /**
   * WHAT THIS PASS DID ABOUT THE OFFICE'S MERGE TOOL. Sandbox v1, piece P9: runs started for entries the
   * office marked, runs that ended and what their entries now say, runs picked up from a worker before
   * this one, runs stopped because their entry was withdrawn or superseded, and entries held back, with
   * why — the slot was taken, or the tool could not be started.
   */
  merges: {
    takenBack?: { problem: string; says: string }[]
    takeBackFailed?: { problem: string; says: string }[]
    started: { entry: string; session: string }[]
    ended: { entry: string; session: string; because: string }[]
    pickedUp: string[]
    stopped: { entry: string; session: string; because: string }[]
    held: { entry: string; because: string }[]
    /** Resolving entries whose time to resolve was over and which the office bounced through the door, with its own sentence. */
    bounced: { entry: string; because: string }[]
  }
  /**
   * WHAT THIS PASS DID ABOUT NEXT ROUNDS (wave 13j round loop-2): launchers started, launchers that ended and what
   * the ask now says, and asks held back, with why. Absent on a pass that did not look: a merges-only pass, a
   * checks-only pass, and a report a test writes by hand.
   */
  rounds?: {
    started: { run: string; wrapper: string }[]
    ended: { run: string; wrapper: string; because: string }[]
    held: { run: string; because: string }[]
  }
  /**
   * WHAT THIS PASS DID ABOUT WORKER RUNS A SUPERVISOR ASKED FOR (wave 13j round loop-3), as `rounds` says it for next
   * rounds, each by the supervisor's run and the worker's registry id. Absent on a pass that did not look.
   */
  workers?: {
    started: { run: string; agentId: string; wrapper: string }[]
    ended: { run: string; agentId: string; wrapper: string; because: string }[]
    held: { run: string; agentId: string; because: string }[]
  }
}

/** A pass report's merge part that says nothing happened. */
function noMergeWork(): PassReport['merges'] {
  return { started: [], ended: [], pickedUp: [], stopped: [], held: [], bounced: [], takenBack: [], takeBackFailed: [] }
}

// ============================================================================ talking to the API

/**
 * THE WORLD OF THE API THIS WORKER TALKS TO, as that API's own replies spell it.
 *
 * Every reply carries an `x-mole-office-world` header: which database it has open, which checkout,
 * which port, and whether that is the canonical stack or a scratch one (criterion G3). The worker
 * cannot work any of that out for itself — it holds no database path on purpose — so it reads the
 * header and hands it back when it registers a run. A row with no world cannot be told apart from a
 * scratch stack's row, which is the fact GROUND's G5 exists to keep (problem `2s-QFF4Tm-VY`).
 *
 * Null until the first reply has been read, which is what it means: nobody has been told yet.
 */
let theWorldTheApiSays: string | null = null

/**
 * The database identity of the world this worker serves, read off the header above.
 *
 * Null until the first reply, and a request carrying no home is a local — which is exactly what this
 * worker is: a process on the same machine, started by the Mole Office it talks to.
 */
let theHomeWorld: string | null = null

/** The world of the API this worker talks to, or null because no reply has carried one yet. */
export function worldOfTheApi(): string | null {
  return theWorldTheApiSays
}

async function ask(
  settings: WorkerSettings,
  path: string,
  init?: { method?: string; body?: unknown; deadlineMs?: number; asAgent?: string; theRunsKey?: string | null },
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> | null; text: string }> {
  // THE OFFICE'S OWN KEY, read beside the database this worker talks to. Criterion P83, point 5. A
  // process of the office proves it is the office, so its requests leave the one-version header
  // window and stop appearing on the Settings list of header-only callers. With no key file the
  // answer is null and every request below is exactly what it was before.
  const office = theOfficeKey(settings.env)
  const reply = await fetch(settings.api + path, {
    method: init?.method ?? 'GET',
    // A DEADLINE ONLY WHERE THE CALLER SET ONE. Every other request here is one the run cannot go
    // ahead without, and cutting one of those short would turn a slow server into a lost message.
    ...(init?.deadlineMs === undefined ? {} : { signal: AbortSignal.timeout(init.deadlineMs) }),
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': settings.workspace,
      'x-mole-office-actor-type': 'agent',
      // WHO THIS READ IS FOR. The worker writes under its own name, and that is what every request
      // here sends. ONE READ IS DIFFERENT: the brief a starting run is handed is read FOR that run's
      // agent, because the brief carries that agent's own notebook and reading it under the worker's
      // name would hand every run the worker's notebook, which is nobody's. Criterion N1.
      'x-mole-office-actor-id': init?.asAgent ?? THE_MESSAGE_WORKER_ID,
      // AND THE OFFICE'S KEY, ON EVERY REQUEST THIS WORKER MAKES AS ITSELF, reads included.
      //
      // THE `/api/brief` READ FOR A RUN CARRIES THE RUN'S OWN KEY INSTEAD, never the office's. That read
      // names the run's agent, because it asks for that agent's notebook. The office's key is the office
      // and never somebody else, so putting it behind an agent's name would be the office's key used to
      // read as an agent (criterion N1). The run's key is the key the office minted for that agent's run,
      // so the agent proves itself. Once the person has closed the key window, a read under an agent's
      // name with no key is refused: a run the office minted no key for then gets
      // no brief, and its prompt says in words that the brief could not be read.
      ...(init?.asAgent !== undefined
        ? init.theRunsKey === undefined || init.theRunsKey === null
          ? {}
          : { [KEY_HEADER]: init.theRunsKey }
        : office.key === null
          ? {}
          : { [KEY_HEADER]: office.key }),
      ...(settings.session === null ? {} : { 'x-mole-office-session': settings.session }),
      // AND WHICH WORLD THIS WORKER LIVES IN. Criterion C4 of design/messages/ACCEPTANCE.md section
      // 8. The worker serves one Mole Office and its home is whatever that Mole Office says it is,
      // read off the world header it already keeps. Absent until it has read one, and a request with
      // no home is a local, which is what a worker on the same machine is.
      ...(theHomeWorld === null ? {} : { [HOME_HEADER]: theHomeWorld }),
    },
    ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  const said = reply.headers.get(WORLD_HEADER)
  if (said !== null && said.trim() !== '') {
    theWorldTheApiSays = said
    const read = parseWorldHeader(said)
    if (read.ok) theHomeWorld = read.world.database
  }
  const text = await reply.text()
  let body: Record<string, unknown> | null = null
  try {
    const parsed: unknown = text === '' ? null : JSON.parse(text)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) body = parsed as Record<string, unknown>
  } catch {
    body = null
  }
  return { ok: reply.ok, status: reply.status, body, text }
}

/**
 * HOW LONG THE WORKER WAITS FOR THE STATE OF THE PROJECT BEFORE STARTING THE RUN WITHOUT IT.
 *
 * Two seconds. `GET /api/brief` reads every record, link and change in the project; on the owner's
 * corpus it answers in about 380 ms, and on a busy server it can be slower than that. What must
 * never happen is a message going undelivered because the context that would have gone with it was
 * slow to read.
 */
const BRIEF_DEADLINE_MS = 2000

/**
 * `ask`, with a deadline, and a refusal reported rather than thrown.
 *
 * A timed-out fetch throws, and the one caller of this wants the same shape either way: a reply it
 * can read, or a status it can say out loud. `status: 0` means nothing answered in time.
 */
async function askWithoutThrowing(
  settings: WorkerSettings,
  path: string,
  deadlineMs: number,
  asAgent?: string,
  theRunsKey?: string | null,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> | null; text: string }> {
  try {
    return await ask(settings, path, { deadlineMs, asAgent, theRunsKey })
  } catch {
    return { ok: false, status: 0, body: null, text: '' }
  }
}

/**
 * THE EXPECTED TIME TYPED AT THE START DOOR, read off the message the run will deliver, or null.
 *
 * Criterion F10. The person's press on a message may type `{"expectedMinutes": <whole minutes>}`; the
 * press wrote it under `runWasAskedFor` on the message. Null means either that nobody typed one — the
 * ordinary case, and then nothing is ever reminded about the run — or that the message could not be
 * read, which is said on the error channel rather than treated as the same thing: an unreadable
 * message and an untyped one are different facts, and neither is a duration.
 */
async function theTypedExpectedMinutes(settings: WorkerSettings, messageId: string): Promise<number | null> {
  let read: Awaited<ReturnType<typeof ask>>
  try {
    read = await ask(settings, `/api/records/${encodeURIComponent(messageId)}`)
  } catch (err) {
    process.stderr.write(
      `The message ${messageId} could not be read for its typed expected time (${(err as Error).message}), ` +
        'so this run starts without one and nothing will be reminded about it.\n',
    )
    return null
  }
  if (!read.ok) {
    process.stderr.write(
      `The message ${messageId} could not be read for its typed expected time (the API answered ` +
        `${String(read.status)}), so this run starts without one and nothing will be reminded about it.\n`,
    )
    return null
  }
  const data = read.body?.['record'] as { data?: Record<string, unknown> } | undefined
  const asked = data?.data?.['runWasAskedFor'] as { expectedMinutes?: unknown } | undefined
  const typed = asked?.['expectedMinutes']
  if (typeof typed === 'number' && Number.isInteger(typed) && typed > 0) return typed
  return null
}

// ============================================================================ deciding about one message

type HeldGate = 'worker-runs' | 'agent-hops' | MessageHold
type Hold = { because: string; gate?: HeldGate }

/** Why a run may not start, with the number gate that held it, or null because it may. */
export function whyNotNow(
  one: Waiting,
  settings: WorkerSettings,
  runsGoing: number,
): Hold | null {
  if (one.retired) {
    return { because: `${one.handle} has been retired, so nothing is started for it. Its messages stay here to be read.` }
  }
  // A PERMANENT RESIDENT ASLEEP: a message that is not urgent waits for it to wake, a check included. The server built
  // the sentence and sets it only on such a message, so an urgent one goes on to the questions below as ever.
  if (one.heldByNoticeRule !== undefined) return { because: one.heldByNoticeRule, gate: 'held-by-a-notice-rule' }
  if (one.heldWhileAsleep !== undefined) return { because: one.heldWhileAsleep, gate: 'held-while-a-resident-sleeps' }
  if (one.inspection) {
    return runsGoing >= settings.runs
      ? { because: `The check is queued until one of the ${settings.runs} runs ends.`, gate: 'worker-runs' }
      : null
  }
  if (one.runtime === null) {
    return {
      because: `Nobody set a runtime word on ${one.handle}'s registry row, so there is no tool to start. Set it to ` +
        `${theRuntimeWordsSaid()} on the agent roster.`,
    }
  }
  const cannot = whyTheOfficeCannotStartThisRuntime(one.runtime)
  if (cannot !== null) return { because: cannot }
  const adapter = adapterFor(one.runtime, settings.env)
  if (adapter === null) {
    return { because: `Nothing here serves the runtime word "${one.runtime}", so no run was started for ${one.handle}.` }
  }
  if (adapter.whereItIs() === null) {
    return {
      because: `${adapter.command} is not installed on this machine, so ${one.handle} cannot be started. Nothing else was ` +
        'started in its place.',
    }
  }
  /**
   * SOMEBODY HAS THIS AGENT OPEN IN A TERMINAL, so the message goes there and nothing is started.
   *
   * Criterion H2, and it is asked FIRST of all the reasons, before even the loop guard, because it
   * is the only one that is not about this worker at all. While the agent is plainly open, opening a
   * second one beside it does not make sense. The sentence is built on the server, where the hold is
   * read; the read that builds it is also the read that releases a hold whose session has gone quiet,
   * so a closed terminal never holds a message up.
   */
  if (one.heldByALiveSession !== null) return { because: one.heldByALiveSession }
  /**
   * A REVIEW HAS NOT SENT THIS COMMENT YET, so nothing carries it anywhere.
   *
   * Criterion M28: several comments left for one agent during a review are held unsent and sent
   * together in one press.
   *
   * It is asked second, after the live session and before everything below, for the reason the two
   * above are ordered as they are: the ones below all mean *this starts as soon as something frees
   * up*, and nothing frees this up but the person sending their review. The sentence is built on
   * the server, from the same reading of the review's membership the column draws.
   */
  if (one.heldByAReview !== null) return { because: one.heldByAReview, gate: 'held-by-an-unsent-review' }
  /**
   * THE CONVERSATION HAS GONE AS FAR AS IT MAY WITHOUT A PERSON, and it is asked before the two
   * questions below because those two say *this starts as soon as something frees up*, which would
   * be untrue here: nothing frees this up but a person writing. The sentence is built on the server,
   * where the count and the limit both are — see `whyThisConversationIsWaiting` in lib/worker.ts.
   */
  if (one.conversationIsWaiting !== null) return { because: one.conversationIsWaiting, gate: 'agent-hops' }
  if (one.sentBy?.kind === 'agent' && one.hops >= settings.hops) {
    return {
      because: `Agents have answered each other ${String(one.hops)} times along one chain of replies since a person last ` +
        `said anything, and this installation allows ${String(settings.hops)}. Nothing is started until somebody ` +
        'writes in this conversation. The messages are all here to read.',
      gate: 'agent-hops',
    }
  }
  /**
   * A RUN IS ALREADY GOING FOR THIS AGENT, so its message waits rather than starting a second one.
   *
   * The sentence the server built is returned as it stands, so the waiting row and the chat draw the same
   * words about the same run: a run in a sandbox names its instance, and a run the office did not start says
   * what really happens to the message. The fallback is for a run this pass started a moment ago, which did
   * not exist when the server read the queue and so carries no sentence. That run is the office's own, and
   * the fallback builds the same sentence the server would have built for it, so both kinds of run read one
   * way.
   */
  if (one.runningAlready !== null) {
    return { because: one.runningAlreadySays ?? theMessageWaitsForARunGoing(null, true) }
  }
  /**
   * AND NOTHING IS ANSWERING AS THIS AGENT AT ALL, so the person is asked before anything starts.
   *
   * Criterion M78. It is asked AFTER the two above and before the concurrency cap, and the order is
   * the answer to a question: `heldByALiveSession` and `runningAlready` are the two states where
   * something IS answering, so asking this before them would offer the person a press for an agent
   * that is perfectly reachable. It is asked before the cap because the cap says *this starts as
   * soon as a run ends*, which would be untrue here — nothing frees this up but the person's press.
   *
   * The sentence is built on the server, where the hold and the run and the press are all read.
   */
  if (one.nobodyIsAnsweringAsIt !== null) return { because: one.nobodyIsAnsweringAsIt, gate: 'wait-for-the-persons-start' }
  if (runsGoing >= settings.runs) {
    return {
      because: `${String(settings.runs)} runs are already going, which is as many as this installation allows at once. ` +
        'This message starts as soon as one of them ends.',
      gate: 'worker-runs',
    }
  }
  return null
}

/**
 * WHERE A RUN MAY WORK: this checkout, or a worktree of it, and nowhere else.
 *
 * The path is resolved through any symbolic links first, because a link into the checkout is not
 * the checkout and a check on the written path would pass for one.
 */
export function refuseAWorkingDirectory(cwd: string, checkout: string): string | null {
  let real: string
  let realCheckout: string
  try {
    real = realpathSync(resolve(cwd))
    realCheckout = realpathSync(resolve(checkout))
  } catch {
    return `${cwd} is not a directory on this machine, so no run was started in it.`
  }
  if (real === realCheckout) return null
  if (real.startsWith(`${realCheckout}/`)) return null
  // A WORKTREE OF THIS CHECKOUT IS ALLOWED AND IT IS NOT INSIDE IT. Git puts a `.git` FILE in a
  // worktree naming the repository it belongs to, so that file is what is read rather than a guess
  // from the path.
  const marker = join(real, '.git')
  if (existsSync(marker)) {
    try {
      if (readFileSync(marker, 'utf8').includes(realCheckout)) return null
    } catch {
      // Fall through to the refusal: a marker that cannot be read is not evidence of anything.
    }
  }
  return (
    `${cwd} is neither this checkout nor a worktree of it, and a run may only work inside one. ` +
    `The checkout is ${realCheckout}. Nothing was started.`
  )
}

// ============================================================================ one pass

/**
 * WHY NO CHECK STARTS IS SAID ONCE, and again only when the sentence changes, so a pass every two seconds does not
 * bury the log. A control that could not be read, a bad checksAtOnce, a bad projects and a project the reading leaves
 * out each have their own sentence; the switch being off has none, because that is the ordinary state.
 */
let theLastReasonNoCheckStarts: string | null = null
function sayOnceWhyNoCheckStarts(sentence: string): void {
  if (sentence === theLastReasonNoCheckStarts) return
  theLastReasonNoCheckStarts = sentence
  process.stderr.write(`${sentence}\n`)
}

/**
 * READ THE SEAT LINES A CHECK HAS WRITTEN SINCE THE WORKER LAST LOOKED. It opens only `run.handle.outputPath`.
 *
 * Only complete lines are read: a line still being written is read on the next pass, so half an instant can never be
 * taken for one. The offset is advanced by the bytes of those lines, so a pass reads nothing twice. A run picked up
 * after a restart begins at offset 0, because its state is new and the file is read from its start.
 */
function readTheSeatWaitsSoFar(run: Watching): void {
  const wait = (run.seatWait ??= { offset: 0, closedMs: 0, openSince: null, readALine: false })
  let fd: number
  try {
    fd = openSync(run.handle.outputPath, 'r')
  } catch {
    return
  }
  try {
    const size = fstatSync(fd).size
    if (size <= wait.offset) return
    const bytes = Buffer.alloc(size - wait.offset)
    const read = readSync(fd, bytes, 0, bytes.length, wait.offset)
    const text = bytes.subarray(0, read).toString('utf8')
    const lastNewline = text.lastIndexOf('\n')
    if (lastNewline === -1) return
    const complete = text.slice(0, lastNewline + 1)
    wait.offset += Buffer.byteLength(complete)
    const found = theSeatWaitsIn(complete, { closedMs: wait.closedMs, openSince: wait.openSince })
    wait.closedMs = found.closedMs
    wait.openSince = found.openSince
    if (found.readALine) wait.readALine = true
  } finally {
    closeSync(fd)
  }
}

/** THE WAIT A CHECK HAS TAKEN SO FAR: its closed waits, and the part of an open one that has passed. */
function theWaitACheckHasTaken(wait: Watching['seatWait']): number {
  if (wait === undefined) return 0
  const open = wait.openSince === null ? 0 : Math.max(0, Date.now() - Date.parse(wait.openSince))
  return wait.closedMs + open
}

/**
 * WHAT THE WORKER SAYS WHEN IT STOPS A CHECK FOR ITS CLOCK. `waitedMs` is the wait left out of the clock, or null when
 * the check's output held no seat line. The words without a wait are exactly the words this stop used before checks
 * wrote their waits down.
 */
export function theClockStopSays(minutes: number, waitedMs: number | null): string {
  const stopped = `The check exceeded its ${minutes} minute clock. The worker stopped its process group.`
  if (waitedMs === null) return stopped
  const seconds = Math.round(waitedMs / 1000)
  return `${stopped} The check waited ${seconds} ${seconds === 1 ? 'second' : 'seconds'} for a test-batches seat, and that wait did not count against the clock.`
}

/** THE WAIT TO WRITE ON A CHECK'S RECORD, in whole seconds, or an empty patch when its output held no seat line. */
function theSeatWaitOnTheRecord(run: Watching): { waitedForASeatSeconds?: number } {
  const wait = run.seatWait
  if (run.inspection === undefined || wait === undefined || !wait.readALine) return {}
  return { waitedForASeatSeconds: Math.round((wait.atTheStopMs ?? theWaitACheckHasTaken(wait)) / 1000) }
}

/**
 * ONE PASS OVER THE QUEUE AND OVER THE RUNS ALREADY GOING.
 *
 * Exported so that a test can run exactly one and read what it did. The loop below is this function
 * called for ever with a wait in between, and nothing else.
 */
export async function onePass(
  settings: WorkerSettings,
  watching: Watching[],
  merges: WatchingAMerge[] = theMergeRunsOfThisProcess,
  rounds: WatchingARound[] = theRoundsOfThisProcess,
): Promise<PassReport> {
  const report: PassReport = {
    started: [],
    held: [],
    answered: [],
    failed: [],
    pickedUp: [],
    waitedLongEnough: [],
    cutOff: [],
    resumed: [],
    deadLetters: null,
    merges: noMergeWork(),
  }

  /**
   * MERGES ONLY: THE MERGE TOOL'S PART OF THE PASS, AND THE ROUNDS ASKED FOR. `MOLE_OFFICE_MESSAGE_WORKER=merges-only`.
   *
   * Everything below this is about runs for messages, and a worker in this mode does none of it. So the queue is
   * not read, no held sentence is written on any delivery, no run another worker left is picked up or
   * carried on, and no wait or dead letter is looked at. Every message to an agent stays queued, exactly
   * as it does with no worker at all. The merge tool is started, stopped and closed, and so are the launchers of the
   * rounds asked through the next-round door and of the worker runs asked through the worker-run door.
   */
  /**
   * WHY THE ROUNDS ASKED FOR START IN THIS MODE (wave 13j round loop-3). Two decisions. One says that a
   * supervisor's next round starts on the supervisor's word. This mode exists so that a message to an
   * agent nobody holds does not start a run by itself: the rule is to ask first (criterion M78). A round asked
   * through POST /api/agents/<agent>/next-round has been asked for, so it is started here, and only those: no run is
   * started for a message, and `off` starts no worker at all. This reading was decided as engineering, in the brief
   * of round loop-3 (from run ALi7EJl2rpIx). It can be undone, and the owner may change it. The rounds are
   * tended before the checks are asked about, so they start whether checks run in this mode or not.
   *
   * THE WORKER RUNS A SUPERVISOR ASKS FOR START HERE TOO, on the same reading. A decision, in its option B, says a
   * supervisor starts its own workers and the office only reminds how many. A worker run asked
   * through POST /api/agents/<agent>/worker-run has been asked for by the supervisor that starts it, so it is not a
   * message starting a run by itself. Extending that reading from rounds to worker runs was an engineering choice of
   * round loop-3, which can be undone; the owner may change it.
   */
  /**
   * AND THE CHECKS, WHEN THE OFFICE SAYS THEY RUN IN THIS MODE (wave 13j round loop-1). 13k round 47b was sealed and
   * its check sat six hours unstarted, because in this mode nothing started it. So once the merge tool is tended the
   * office is asked; when it answers on, the pass goes on with the checks and nothing else: the checks another worker
   * left running are picked up, and no other run is picked up or carried on, no wait or dead letter is looked at, and
   * every message to an agent stays queued with no held sentence. When it answers off, or cannot be read, or leaves
   * this project out, no check starts; picking up the checks another worker left running, closing one that
   * ended and stopping one past its minutes still happen, because they are bookkeeping and safety and start nothing,
   * so they do not wait. Only reading the queue and starting a check wait. Before this, a check that ended while the
   * switch was off was closed only after it was on again.
   */
  // A gate choice ends on every read. This pass asks the office to remove and record the ended choices once.
  await runOutTheGateChoices(settings)
  let checksOnly: { machine: { loadOneMinute: number | null; freeBytes: number | null }; checksAtOnce: number } | null = null
  /** No check may start this pass, for one of the reasons said once above; the pass still picks up, closes and stops. */
  let noCheckMayStart = false
  if (settings.mergesOnly === true) {
    report.merges = await tendTheMergeTool(settings, merges)
    report.rounds = await tendTheRounds(settings, rounds)
    report.workers = await tendTheWorkerRuns(settings, rounds)
    const control = await ask(settings, '/api/office/checks-in-merges-only')
    if (!control.ok) {
      sayOnceWhyNoCheckStarts(`Merges-only mode: whether checks run could not be read, so no check was started: ${refusalIn(control.text)}`)
      noCheckMayStart = true
    } else {
      const on = control.body?.['on'] === true
      // HOW MANY AT ONCE IS THE OFFICE'S SETTING, handed over in the same reading. A reading without a whole number of 1 or
      // more there is not read as some number: no check starts, and the worker says why once.
      const checksAtOnce = (control.body?.['limits'] as { checksAtOnce?: unknown } | undefined)?.checksAtOnce
      // THE PROJECTS IT IS ON FOR, named in the same reading; null is every project. A worker of a project it does not name
      // starts no check, as with the switch off. A reading without a list or null there is not read as either.
      const projects = control.body?.['projects']
      if (on && (typeof checksAtOnce !== 'number' || !Number.isInteger(checksAtOnce) || checksAtOnce < 1)) {
        sayOnceWhyNoCheckStarts(`Merges-only mode: whether checks run could not be read, so no check was started: the reading's limits.checksAtOnce is ${JSON.stringify(checksAtOnce ?? null)}, not a whole number of 1 or more.`)
        noCheckMayStart = true
      } else if (on && projects !== null && !(Array.isArray(projects) && projects.every((one) => typeof one === 'string' && one !== ''))) {
        sayOnceWhyNoCheckStarts(`Merges-only mode: whether checks run could not be read, so no check was started: the reading's projects is ${JSON.stringify(projects ?? null)}, not a list of projects or null.`)
        noCheckMayStart = true
      } else if (
        // WHETHER A CHECK OF THIS PROJECT STARTS is the reading the office makes when it queues one, so the sentence a run
        // stores then and what this pass does cannot disagree (@shared/whether-a-check-would-start.ts).
        !whetherAnOfficeWouldStartACheck('merges-only', () => ({ on, nobodyChose: control.body?.['nobodyChose'] === true, projects: on ? (projects as string[] | null) : null }), settings.workspace).starts
      ) {
        if (on) {
          const named = (projects as string[]).length === 0 ? 'no projects' : (projects as string[]).join(', ')
          sayOnceWhyNoCheckStarts(`Merges-only mode: the office runs checks in this mode for ${named}, not for ${settings.workspace}, so no check was started.`)
        }
        noCheckMayStart = true
      } else {
        const machine = control.body?.['machine'] as { loadOneMinute?: unknown; freeBytes?: unknown } | undefined
        checksOnly = {
          machine: {
            loadOneMinute: typeof machine?.loadOneMinute === 'number' ? machine.loadOneMinute : null,
            freeBytes: typeof machine?.freeBytes === 'number' ? machine.freeBytes : null,
          },
          checksAtOnce: checksAtOnce as number,
        }
      }
    }
  }

  if (settings.mergesOnly === true) {
    // IN MERGES-ONLY MODE, THE CHECKS ANOTHER WORKER LEFT RUNNING, AND NO OTHER RUN, ON EVERY PASS WHATEVER THE SWITCH
    // SAYS. When checks run, the number at once below counts the checks in `watching`, and a restarted worker begins
    // with an empty list while its checks go on running. Picking them up from what the office records makes the count
    // the office's, and this worker closes each one when it ends.
    report.pickedUp = await pickUpRunsAlreadyGoing(settings, watching, 'only the checks')
  } else {
    // RUNS ANOTHER WORKER LEFT BEHIND FIRST, so a run that has already ended is read below with the
    // rest rather than a pass later. See `pickUpRunsAlreadyGoing` for what this is for.
    report.pickedUp = await pickUpRunsAlreadyGoing(settings, watching)
    // AND THE INTERRUPTED RUNS THE PERSON PRESSED RESUME ON (criterion W7), before the queue is read.
    report.resumed = await startTheResumesThePersonAsked(settings, watching)
  }

  // FINISHED RUNS FIRST, so a run that ended a moment ago frees its place before the queue is read.
  for (const run of [...watching]) {
    if (run.startupGroupHeld) continue
    // A CHECK'S OUTPUT SAYS WHEN IT IS WAITING FOR A SEAT, and that time is not the check's clock. The part of the
    // output written since the last pass is read here, before the clock is asked, so a wait that has just begun or
    // just ended is known in the pass that reads it.
    if (run.inspection !== undefined) readTheSeatWaitsSoFar(run)
    if (run.adapter.alive(run.handle)) {
      const waited = theWaitACheckHasTaken(run.seatWait)
      if (run.inspection && run.handle.startedTime &&
          Date.now() - Date.parse(run.handle.startedTime.instant) - waited >= (run.adapter as InspectionAdapter).minutes() * 60_000) {
        const minutes = (run.adapter as InspectionAdapter).minutes()
        // THE WAIT IS FROZEN AT THE STOP, so the record says the wait that was left out of the clock that stopped it.
        if (run.seatWait !== undefined) run.seatWait.atTheStopMs = waited
        const because = theClockStopSays(minutes, run.seatWait?.readALine === true ? waited : null)
        run.said = { text: '', because }
        // THE FIELD THE BRANCH MEANS TO CHANGE IS THE ONLY ONE CHANGED, so a receipt the adapter
        // already made survives the stop. A whole-object rewrite here would drop it before
        // `sayHowItEnded` writes the patch. U3.
        run.ended = { ...(run.ended ?? {}), endedHow: 'stopped', because, providerSession: null }
        run.adapter.stop(run.handle, because)
        continue
      }
      await recordTheConversationOnceItIsSaid(settings, run)
      await recordTheTokensSoFar(settings, run)
      /**
       * A RUN THAT IS STILL GOING SAYS SO ON ITS HANDLE. Criterion M79.
       *
       * A hold is not believed without its heartbeat — that is what makes a hold safe across a
       * restart and safe when a laptop is closed — so a run that took one and then said nothing
       * would read as answering for the two windows and then stop.
       *
       * THE BEAT IS NO LONGER HERE, AND THAT IS DELIBERATE. Until 11 September 2026 this pass beat
       * every held handle itself, which was safe while the pass ran every two seconds and would
       * have broken the hold the moment the pass slowed: a pass that takes a minute (measured: the
       * queue read alone took 24 seconds on a busy server) would leave a hold quiet for that
       * minute, and a pass made slower still would lapse holds that are perfectly alive. So the
       * beat went onto its own timer, `startTheBeatTimer` below, which beats every held handle
       * every MOLE_OFFICE_HANDLE_BEAT_SECONDS whatever the pass cadence is and however long a pass
       * takes. Nothing here beats anything.
       *
       * A REFUSED BEAT IS NOT REPORTED ANYWHERE. The one refusal it can meet is a handle this
       * session no longer holds, which the release path already says out loud, and a line per beat
       * per run would bury it.
       */
      continue
    }
    /**
     * LET THIS RUN GO: off the watched list, and its ledger row released with the reason.
     *
     * Until 4 September the row was left open for ever (problem `2s-QFF4Tm-VY`): nine rows for runs
     * that had all ended were still open on one stack after half an hour. The orphan sweep is how
     * this project finds processes nobody claims, and a row for every run that ever ran makes that
     * list useless. The session record is patched to finished or crashed before this, which is what
     * lets the ledger close the row without a signal — the process is already gone.
     */
    const done = async (why: string): Promise<void> => {
      if (run.inspection) run.adapter.stop(run.handle, 'The check ended; release its remaining process group.')
      const at = watching.indexOf(run)
      if (at !== -1) watching.splice(at, 1)
      await theTripIsOver(settings, run)
      /**
       * AND THE RUN LETS THE AGENT'S HANDLE GO. Criterion M79: the agent reads as Answering from
       * the moment the run starts UNTIL IT ENDS, so the end is where the hold ends. Letting go here
       * rather than leaving it to the grace and lapse windows means the agent reads as reachable
       * again at once instead of two minutes later.
       *
       * A refused release is said out loud and nothing else is done about it: the windows end the
       * hold anyway, so the cost is a colour that is right two minutes late.
       */
      if (run.holdsTheHandle === true) {
        const letGo = await ask(settings, `/api/handles/${encodeURIComponent(run.handleName)}/release`, {
          method: 'POST',
          body: { session: run.session, because: why },
        })
        if (!letGo.ok) {
          process.stderr.write(
            `The handle ${run.handleName} held by run ${run.session} could not be let go: ${refusalIn(letGo.text)}\n`,
          )
        }
      }
      if (run.ledgerRow === null) return
      const let_go = await ask(settings, `/api/resources/${run.ledgerRow}/release`, {
        method: 'POST',
        body: { note: why },
      })
      // 409 IS NOT A FAILURE HERE: a run somebody stopped from the product had its row released by
      // the press that stopped it, and saying so twice is not an error.
      if (!let_go.ok && let_go.status !== 409) {
        process.stderr.write(
          `The ledger row ${run.ledgerRow} for run ${run.session} could not be released: ${let_go.text.slice(0, 300)}\n`,
        )
      }
    }

    // THE OUTPUT IS READ ONCE, and the session record is patched once, however many times filing the
    // answer is tried. Reading it again on a retry would say the run ended twice.
    if (run.said === undefined) {
      const result = run.adapter.readResult(run.handle)
      // A NATIVE OPTION REFUSAL OF AN EFFORT THAT IS NOT THE ROW'S OWN HOLDS NOTHING, and the sentence says why: the row's
      // own effort was not tried, so the refusal says nothing about it. The launcher already says this; the worker does too.
      const refusal = result.endedHow === 'failed' ? theNativeSelectionRefusal(run.adapter.runtime, outputOf(run.handle).said) : null
      const notHeld = refusal === null ? null : theRefusalOfAnEffortNotTheRows(run.handle.start, refusal)
      run.said = { text: result.text, because: `${result.because}${notHeld === null ? '' : ` ${notHeld}`}` }
      // WHAT THE RUNTIME SERVED IT (HB1), read from the runtime's own record of the run and written with its ending.
      // The `Served` shape has no room for the sentence, so a model that could not be read is said in the worker's log.
      const served = run.adapter.servedOf(run.handle)
      if (served.served.model === NOT_REPORTED) process.stderr.write(`Run ${run.session} has no served model: ${served.said}\n`)
      run.ended = {
        endedHow: result.endedHow,
        because: run.said.because,
        providerSession: result.providerSession,
        usageReceipt: result.usageReceipt,
        served: served.served,
        ...(result.stopCause === undefined ? {} : { stopCause: result.stopCause }),
        ...(result.inspectionEnding === undefined ? {} : { inspectionEnding: result.inspectionEnding }),
        ...(result.dshTranscriptRefused === true ? { dshTranscriptRefused: true as const } : {}),
      }
    }
    const said = run.said
    if (run.inspection) {
      const finished = await ask(settings, `/api/checks/${run.inspection.run}/tool-ended`, {
        method: 'POST', body: { session: run.session, reason: run.said.because,
          ...(run.ended?.endedHow !== 'stopped' && run.ended?.stopCause === undefined && run.ended?.inspectionEnding === 'no-verdict' ? { ending: 'no-verdict' } : {}),
          // The server counts the gate a-dsh-checks-transcript-is-its-own from this, once for the check.
          ...(run.ended?.dshTranscriptRefused === true ? { dshTranscriptRefused: true } : {}),
        },
      })
      if (!finished.ok) {
        const because = `The check ending was refused: ${refusalIn(finished.text)}`
        report.failed.push({ messageId: run.messageId, because })
        if (finished.status >= 400 && finished.status < 500) {
          // KEEP WHAT THE ADAPTER ALREADY READ: only the ending changed. U3.
          run.ended = { ...(run.ended ?? {}), endedHow: 'failed', because, providerSession: null }
          await sayHowItEnded(settings, run)
          await done(because)
        }
        continue
      }
      // KEEP THE USAGE RECEIPT the adapter built from the tool's output, for the reason above. U3.
      run.ended = { ...(run.ended ?? {}), endedHow: finished.body?.['failed'] === false ? 'answered' : 'failed', because: String(finished.body?.['says']), providerSession: null }
      await sayHowItEnded(settings, run)
      await sayOnTheRow(settings, run, run.ended.because)
      if (finished.body?.['failed']) report.failed.push({ messageId: run.messageId, because: run.ended.because })
      await done(run.ended.because)
      continue
    }

    if (said.text.trim() === '') {
      /**
       * A RUN THAT PRINTED NOTHING MAY HAVE BEEN CUT OFF BY A RESTART (criterion M24).
       *
       * The API server restarts on every merge, and it kills the worker with it; the runs carry on
       * in their own process groups, but one that dies in the gap leaves an empty output file and a
       * record saying `running`. Until 4 September 2026 nothing anywhere said so — the restart's own
       * startup sweep had closed the run's ledger row, so the next worker never even saw it
       * (problem `Ldq6KsY1S2RW`).
       *
       * IT IS THE SERVER THAT DECIDES WHETHER A RESTART DID IT, from two stamps it holds and this
       * process does not. A refusal here means the run died on its own, and the sentence below is
       * the honest one for that.
       */
      const carried = await carryOnFromARestart(settings, run, watching)
      if (carried !== null) {
        report.cutOff.push(carried)
        const at = watching.indexOf(run)
        if (at !== -1) watching.splice(at, 1)
        await theTripIsOver(settings, run)
        if (run.ledgerRow !== null) {
          await ask(settings, `/api/resources/${run.ledgerRow}/release`, {
            method: 'POST',
            body: { note: 'a restart of the API cut this run off and the worker ended it' },
          })
        }
        continue
      }
      await sayHowItEnded(settings, run)
      const because = `The run ended without answering. ${said.because}`
      await sayOnTheRow(settings, run, because)
      report.failed.push({ messageId: run.messageId, because })
      await done('the run ended on its own without answering, and the worker read its output')
      continue
    }

    if (run.ended?.endedHow !== 'answered') {
      const because = `The run ended without answering. ${said.because}`
      await sayHowItEnded(settings, run)
      await sayOnTheRow(settings, run, because)
      report.failed.push({ messageId: run.messageId, because })
      await done('the run ended on its own without answering, and the worker read its output')
      continue
    }

    await sayHowItEnded(settings, run)

    // A RETRY WAITS. The run stays in the watched list meanwhile, which is what keeps its answer.
    if (run.tryAgainAt !== undefined && Date.now() < run.tryAgainAt) continue

    const filed = await ask(settings, `/api/worker/messages/${run.messageId}/answered`, {
      method: 'POST',
      body: {
        to: { kind: 'agent', id: run.agentId },
        agent: { kind: 'agent', id: run.agentId },
        fromRun: run.session,
        body: said.text,
        because: `${run.handleName} answered. ${said.because}`,
      },
    })
    if (filed.ok) {
      const reply = (filed.body?.['reply'] as { id?: string } | undefined)?.id ?? ''
      report.answered.push({ messageId: run.messageId, reply })
      await done('the run ended on its own and its answer was filed as the agent\'s reply')
      continue
    }

    /**
     * A REFUSED REPLY IS NEVER DROPPED IN SILENCE.
     *
     * Problem `4DK_cvyAc5Ri`, measured on 4 September 2026: the API refused the reply, the worker
     * put the refusal in `report.failed`, and the loop that calls this function threw the report
     * away. The run really had answered, the answer was on disk, and the row a person reads said
     * only that a run had taken the message. Nothing anywhere said the answer had been thrown away.
     *
     * Three things now happen instead. The refusal is written on the delivery row, where a person
     * reads it beside the tick. It is tried once more after a wait, because a refusal can be
     * something that has since been put right. And when the second attempt is refused too, the row
     * says so and names the file the words are in, so they are findable rather than lost.
     *
     * THE MARK IS NOT MOVED BACK TO `queued`, and this is a decision rather than an omission. A run
     * did take this message, so `delivered` is true and moving it back would say nothing had read
     * it. It would also put the message back in the queue, which would start a second run of the
     * same agent for the same message — the defect fixed in the commit before this one. The mark
     * says how far the message got; the sentence beside it says what happened, and that is where a
     * failure belongs. No word was added to the shared list of marks either: `queued`, `delivered`
     * and `seen` are a ladder that `markDelivery` compares by position, so a fourth word would have
     * to be either forward of `seen` or behind `queued`, and a failure is neither.
     */
    const why = refusalIn(filed.text)
    run.refused = (run.refused ?? 0) + 1
    const lastTry = run.refused > 1
    const because = lastTry
      ? `${run.handleName} answered and the answer could not be filed: ${why} It was tried twice. The words are ` +
        `in ${run.handle.outputPath} and nothing was written into this conversation.`
      : `${run.handleName} answered and the answer could not be filed: ${why} It will be tried once more.`
    await sayOnTheRow(settings, run, because)
    report.failed.push({ messageId: run.messageId, because })
    if (lastTry) await done('the run ended on its own and its answer could not be filed')
    else run.tryAgainAt = Date.now() + TRY_A_REFUSED_REPLY_AGAIN_AFTER_MS
  }

  // NO CHECK MAY START THIS PASS: the queue is not read, no wait or dead letter is looked at, and nothing is started.
  // The pick-up and the finished-runs loop above have already run.
  if (noCheckMayStart) return report

  /**
   * RUNS THAT WAITED FOR THE NEXT MESSAGE AND GOT NONE (criterion M22).
   *
   * Asked before the queue, so a conversation that has just run out of time is closed before the
   * next message is judged against it. Which runs are waiting, how long a wait is and what the line
   * says are all the server's: this reads a list and presses a door for each one whose moment has
   * passed.
   *
   * NOTHING IS DECIDED HERE. A wait that has not run out is skipped by the server as well, and the
   * door refuses it, so the two never disagree about whether one is over.
   */
  if (checksOnly === null) report.waitedLongEnough = await endTheWaitsThatAreOver(settings)

  /**
   * THE OFFICE'S ONE LOOK AT ITS DEAD LETTERS, pressed once a pass (criterion M111).
   *
   * A message that reaches nobody is kept as a dead letter; after a time or a count the office
   * tells the secretary the person named to take the dead letters, in one line per sweep, or tells
   * nobody when nobody is named (problem 0WUuvB0IhRfb, src/server/lib/deadletters.ts). The check and
   * the telling are the server's; this presses the one door. It is asked BEFORE the queue, beside the waits, because both are the
   * office's own bookkeeping and neither is about any one message below.
   *
   * IT DOES NOTHING WHEN THERE IS NOTHING TO DO — the server's own words — so pressing it every pass
   * costs one read when no letter is waiting, and a refusal is printed and the pass carries on, the
   * same shape `endTheWaitsThatAreOver` keeps.
   */
  if (checksOnly === null) report.deadLetters = await sweepTheDeadLetters(settings)

  /**
   * THE MERGE TOOL, IN ITS OWN SLOT (sandbox v1, piece P9). Asked before the message queue and apart from
   * it: a merge entry is not a message, and whatever the queue holds does not change what the merge slot
   * may do, nor the other way round.
   */
  if (checksOnly === null) report.merges = await tendTheMergeTool(settings, merges)

  /**
   * AND THE NEXT ROUNDS AND THE WORKER RUNS A SUPERVISOR ASKED FOR (wave 13j rounds loop-2 and loop-3), started with
   * the sandbox launcher. Here for a worker that takes the queue. A merges-only pass tended them at its top, with the
   * merge tool, and does not tend them twice.
   */
  if (checksOnly === null) {
    report.rounds = await tendTheRounds(settings, rounds)
    report.workers = await tendTheWorkerRuns(settings, rounds)
  }

  const checksStartedThisPass = new Map<string, number>()
  const seen = new Set<string>()
  const allQueued: Pick<Waiting, 'messageId' | 'to'>[] = []
  let page: string | null = checksOnly === null ? '/api/worker/queue?page=1' : '/api/worker/queue?only=checks&markDelivered=1'
  while (page !== null) {
    const queue = await ask(settings, page)
    if (!queue.ok) {
      report.failed.push({ messageId: '/api/worker/queue', because: `The office refused a queue page (${String(queue.status)}); the pass stopped.` })
      return report
    }
    const takeOnce = <T extends Pick<Waiting, 'messageId' | 'to'>>(rows: T[]): T[] => rows.filter((one) => {
      const key = heldKey(one)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    const everyoneWaiting = takeOnce((queue.body?.['queue'] ?? []) as Waiting[])
    // A DELIVERY THE QUEUE COULD NOT WORK OUT (item 49 of wave 13y, round 115) is said held, in the queue's own words, on
    // the delivery itself, where its sender and the office read it. It stays queued, so the next pass tries it again. It is
    // in `held` and not `failed`, because it is a standing state and not something this pass did: counted as failed, one
    // delivery that keeps failing would keep every pass at the short wait.
    const failedInTheQueue = takeOnce((queue.body?.['failed'] ?? []) as (Pick<Waiting, 'messageId' | 'to'> & { because: string })[])
    for (const one of failedInTheQueue) {
      await sayItIsHeld(settings, one, one.because)
      report.held.push({ messageId: one.messageId, because: one.because })
    }
    if (checksOnly !== null) {
      const marked = (queue.body?.['markedDelivered'] ?? []) as { messageId: string; because: string }[]
      for (const one of marked) report.held.push({ messageId: one.messageId, because: one.because })
    }
    // IN MERGES-ONLY MODE WITH CHECKS ON, ONLY THE CHECKS ARE LOOKED AT, and the asks for a check of a run already settled,
    // which the explicit queue reading marks delivered once and names with their reason. Every other row is left as
    // it is: no held sentence, no mark, exactly as with no worker at all.
    const waiting = checksOnly === null ? everyoneWaiting : everyoneWaiting.filter((one) => one.inspection !== undefined || one.askOfASettledRun === true)
    allQueued.push(...waiting, ...failedInTheQueue)
    const startWith: WorkerSettings = checksOnly === null ? settings : { ...settings, checksInMergesOnly: true }
    // THE CHECKS THIS PASS STARTED IN EACH LANE, which the office's count of the last hour was read too early to hold.

    for (const one of waiting) {
      if (one.inheritedFromCopy === true) {
        const because = readStoredWord('worker.inheritedFromCopy')
        await sayItIsHeld(settings, one, because)
        report.held.push({ messageId: one.messageId, because })
        continue
      }
      /**
       * ONE AGENT GETS ONE RUN AT A TIME, INCLUDING WITHIN ONE PASS.
       *
       * `runningAlready` is worked out by the server when the queue is READ, so every message in the
       * list was judged against the world as it was before any of them started. Two messages to one
       * agent arriving in the same pass therefore both looked free and both started a run — measured
       * on 4 September 2026: two runs of one agent on one provider conversation (problem
       * `06PmdNHD0JMa`). The runs this worker is watching are the fact that is up to date, so they are
       * asked as well. That also covers the seconds between a run starting and its ledger row
       * existing, which is the other half of why the server's answer can be stale.
       */
      /**
       * A LINE MOLE OFFICE WROTE IS DELIVERED AND NEVER ANSWERED.
       *
       * It says a group was opened, a member was added or two claims are in conflict, and a line like
       * that is for people to read. Until 4 September 2026 each one started a run of every agent in
       * the group and every one of those answers was refused, because there is nobody to answer:
       * *Mole Office itself cannot be written to*. Problem `jN0TdeawNlZZ`. The mark still moves, so
       * nothing is lost and nothing is left under a clock that means nothing.
       */
      if (one.needsNoRun !== null) {
        const done = await ask(settings, `/api/worker/messages/${one.messageId}/needs-no-run`, {
          method: 'POST',
          body: { to: one.to, ...(one.wouldHaveHeld === undefined ? {} : { wouldHaveHeld: one.wouldHaveHeld }) },
        })
        if (done.ok) {
          report.held.push({ messageId: one.messageId, because: one.needsNoRun })
          continue
        }
        // THE REFUSAL IS WRITTEN WHERE A PERSON READS IT rather than swallowed. Nothing is started for
        // this message either way: the queue said it needs no run and the server said the write was
        // wrong, and both of those are things somebody has to be able to see.
        const because = `This line needed no run, and saying so was refused: ${refusalIn(done.text)}`
        await sayItIsHeld(settings, one, because)
        report.failed.push({ messageId: one.messageId, because })
        continue
      }
      if (one.heldByStarterChange !== undefined) {
        await sayItIsHeld(settings, one, one.heldByStarterChange)
        report.held.push({ messageId: one.messageId, because: one.heldByStarterChange })
        continue
      }
      // A CHECK HELD FOR ITS RUN'S REPORT IS SAID HELD, in the server's sentence, and not started, as part 1 of a
      // decision says. The merge queue sent the run's entry back before any check, so starting
      // one would spend tokens on it.
      if (one.inspection?.waits !== undefined) {
        await sayItIsHeld(settings, one, one.inspection.waits)
        report.held.push({ messageId: one.messageId, because: one.inspection.waits })
        continue
      }
      // A CHECK WHOSE LANE IS AT ITS HOURLY CAP WAITS ITS TURN, as part 2 of a decision says. It
      // is said held in the sentence of @shared/checks-an-hour.ts and never refused, and a later pass starts it.
      const lane = one.inspection === undefined || !('lane' in one.inspection.pace) ? null : one.inspection.pace.lane
      const itsTurn = one.inspection === undefined ? null : whyACheckWaitsItsTurn(one.inspection.pace, lane === null ? 0 : (checksStartedThisPass.get(lane) ?? 0))
      if (itsTurn !== null) {
        await sayItIsHeld(settings, one, itsTurn)
        report.held.push({ messageId: one.messageId, because: itsTurn })
        continue
      }
      const mine = watching.find((run) => run.agentId === one.to.id) ?? null
      /**
       * IN MERGES-ONLY MODE THE CHECK'S OWN LIMITS DECIDE, from @shared/checks-in-merges-only.ts: the office's number at
       * once, and a further one only on a machine the office measured as quiet enough. The sentence written on the delivery
       * is the limits themselves, so it does not change from pass to pass with the load; the pass's report has the reading.
       */
      const roomForACheck =
        checksOnly === null
          ? null
          : whyNoFurtherCheckNow({ checksRunning: watching.filter((run) => run.inspection).length, ...checksOnly.machine }, checksOnly.checksAtOnce)
      const hold: Hold | null =
        checksOnly === null
          ? whyNotNow({ ...one, runningAlready: one.runningAlready ?? mine?.session ?? null }, settings, watching.length)
          : roomForACheck === null ? null : { because: roomForACheck }
      if (hold !== null) {
        await sayItIsHeld(settings, one, checksOnly === null ? hold.because : `The check waits: ${whatOnMeans(checksOnly.checksAtOnce)}.`, hold.gate)
        report.held.push({ messageId: one.messageId, because: hold.because })
        continue
      }
      /**
       * THE WORDS ARE ASKED FOR HERE, AND ONLY HERE. A narrow queue row
       * carries everything the decisions above need and no message's words, so a run about to START
       * asks the message record for them once; the words of every held message never leave the
       * server. A record with no words on it is refused, not an empty prompt: handing a run nothing
       * to answer would be a run that says it was started and answered nothing.
       */
      const detail = await ask(settings, `/api/worker/queue?full=1&messageId=${encodeURIComponent(one.messageId)}&recipientId=${encodeURIComponent(one.to.id)}`)
      const complete = ((detail.body?.['queue'] ?? []) as Waiting[]).find((row) => row.messageId === one.messageId && row.to.kind === one.to.kind && row.to.id === one.to.id)
      if (!detail.ok || complete === undefined) {
        const because = !detail.ok
          ? `The office refused the read of this delivery’s whole entry (${String(detail.status)}), so no run was started.`
          : 'This delivery is no longer there to read whole, so no run was started.'
        await sayItIsHeld(settings, one, because)
        report.held.push({ messageId: one.messageId, because })
        continue
      }
      const read = await ask(settings, `/api/records/${one.messageId}`)
      const held = read.body?.['record'] as { data?: Record<string, unknown> } | undefined
      const words = held?.data?.['body']
      if (!read.ok || typeof words !== 'string') {
        const why = !read.ok
          ? `The words of this message could not be read, so no run was started: ` + refusalIn(read.text)
          : 'The message record holds no words on it, so no run is started: this row could not be answered as it stands.'
        await sayItIsHeld(settings, one, why)
        report.held.push({ messageId: one.messageId, because: why })
        continue
      }
      // THE FOURTH ENVELOPE LINE, WHEN THE ROUTING ALSO GAVE THIS MESSAGE TO THIS AGENT. The narrow
      // queue row carries no words, so the record that was just read for the body is where the line is
      // built, with the one matcher every hand-over uses.
      const routedLine = theRoutedLineFor({ routed: routedOf(held?.data ?? {}) }, { kind: 'agent', id: one.to.id })
      const positions = held?.data?.['quotePositions']
      // THE MESSAGE AS THE OFFICE HANDS IT OVER, for the instructions its mark and its own label carry. These are worked
      // out from the sender's row by the office and are on no record, so they are read from the messages door rather
      // than the queue row. A read that does not answer is not a flag with no instruction: starting the run silently
      // would hand it nothing and say nothing, so this message waits.
      const handed = await ask(settings, `/api/messages/${encodeURIComponent(one.messageId)}`)
      const handedAsRead = handed.ok && handed.status === 200 && typeof handed.body === 'object' && handed.body !== null && typeof handed.body['message'] === 'object' && handed.body['message'] !== null
        ? (handed.body['message'] as Record<string, unknown>)
        : null
      if (handedAsRead === null) {
        const why = `The office's reading of this message's mark and label could not be read, so no run was started: ` + refusalIn(handed.text)
        await sayItIsHeld(settings, one, why)
        report.held.push({ messageId: one.messageId, because: why })
        continue
      }
      // The decided fields come from the chosen row; only the start fields come from the fresh read.
      const started = await startOne({ ...complete, ...one, body: words, quotes: quotesOf({ kind: 'message', data: held?.data ?? {} }), quotePositions: Array.isArray(positions) ? positions as number[] : null, routedLine, intent: handedAsRead?.['intent'] ?? held?.data?.['intent'], label: handedAsRead?.['label'] ?? held?.data?.['label'], whatTheMarkAsks: typeof handedAsRead?.['whatTheMarkAsks'] === 'string' ? handedAsRead['whatTheMarkAsks'] : undefined, whatTheLabelAsks: typeof handedAsRead?.['whatTheLabelAsks'] === 'string' ? handedAsRead['whatTheLabelAsks'] : undefined, markedParts: Array.isArray(handedAsRead?.['markedParts']) ? handedAsRead['markedParts'] as AMarkedPartOnTheWire[] : undefined, noMarkName: typeof handedAsRead?.['noMarkName'] === 'string' ? handedAsRead['noMarkName'] : undefined }, startWith, watching)
      if (started.ok) {
        report.started.push(started.started)
        if (lane !== null) checksStartedThisPass.set(lane, (checksStartedThisPass.get(lane) ?? 0) + 1)
      } else {
        await sayItIsHeld(settings, one, started.because)
        report.held.push({ messageId: one.messageId, because: started.because })
      }
    }
    const next = checksOnly === null ? queue.body?.['next'] : null
    if (next !== null && (typeof next !== 'string' || !next.startsWith('/api/worker/queue?'))) {
      report.failed.push({ messageId: '/api/worker/queue', because: 'The queue page did not name a usable next page; the pass stopped.' })
      return report
    }
    page = next
  }
  forgetTheHeldSentencesOfMessagesNoLongerQueued(allQueued)
  return report
}

/**
 * A HELD SENTENCE IS SAID ONCE, NOT ON EVERY PASS.
 *
 * MEASURED, 11 September 2026, on the live server's own log (problem 9UeL9VeVPn33): 143 messages
 * sat in the queue addressed to agents nobody answers as, and every pass posted the same sentence
 * about every one of them — 20,679 posts in two hours, 1,722 seconds of the server's one thread,
 * the same message re-marked up to 296 times. The door writes nothing when the row already holds
 * the sentence, but reads the message, asks the stored conversation whether the group has stopped
 * and whether the starter must be told, and answers — 83 milliseconds each, 12 seconds of every
 * 24-second pass. Nothing about the message had changed between one pass and the next.
 *
 * So this worker remembers what it last said about each queued delivery and says it again only
 * when the sentence differs. The memory is this process's: a worker that starts afresh says every
 * sentence once more, which is one pass, and then is quiet. A message that leaves the queue is
 * forgotten at the end of the pass, so a message that comes back is said afresh. The server is not
 * asked to remember anything, so a sentence the row lost (nothing today takes one off a queued
 * row) would be said again only by a fresh worker — which is the same as before this, one pass
 * later at most.
 */
const heldSentencesSaid = new Map<string, string>()

function heldKey(one: Pick<Waiting, 'messageId' | 'to'>): string {
  return `${one.messageId}|${one.to.kind}:${one.to.id}`
}

/**
 * THE LONGEST SENTENCE THE HELD DOOR TAKES (`heldBody` in src/server/api/worker.ts), which refuses a longer one whole.
 * Such a sentence never reached the delivery, so a person could not see why nothing ran, and the worker sent it again
 * on every pass (wave 13t, round W9, on a Windows 11 machine). A longer sentence is cut to its first 499 characters
 * and "…", which says it was cut.
 */
const THE_HELD_DOORS_LIMIT = 500

function cutForTheHeldDoor(because: string): string {
  return because.length <= THE_HELD_DOORS_LIMIT ? because : `${because.slice(0, THE_HELD_DOORS_LIMIT - 1)}…`
}

async function sayItIsHeld(settings: WorkerSettings, one: Pick<Waiting, 'messageId' | 'to'>, because: string, gate?: HeldGate): Promise<void> {
  const key = heldKey(one)
  const sentence = cutForTheHeldDoor(because)
  if (heldSentencesSaid.get(key) === sentence) return
  const said = await ask(settings, `/api/worker/messages/${one.messageId}/held`, {
    method: 'POST',
    body: { to: one.to, because: sentence, ...(gate === undefined ? {} : { gate }) },
  })
  // REMEMBERED ONLY WHEN THE DOOR TOOK IT. A refusal is not a sentence on the row, so the next pass
  // says it again, as it always did.
  if (said.ok) heldSentencesSaid.set(key, sentence)
  else heldSentencesSaid.delete(key)
}

function forgetTheHeldSentencesOfMessagesNoLongerQueued(waiting: readonly Pick<Waiting, 'messageId' | 'to'>[]): void {
  const still = new Set(waiting.map(heldKey))
  for (const key of [...heldSentencesSaid.keys()]) {
    if (!still.has(key)) heldSentencesSaid.delete(key)
  }
}

/** What this worker last said about a queued delivery, for a test to read; null where nothing was said. */
export function whatTheWorkerLastSaidAbout(one: Pick<Waiting, 'messageId' | 'to'>): string | null {
  return heldSentencesSaid.get(heldKey(one)) ?? null
}

/**
 * END EVERY WAIT WHOSE TIME HAS PASSED, and give back the runs that ended.
 *
 * Criterion M22, on decision `5k2UP25NnN57`: a conversation ends after a set wait, such as 5 or 10 minutes. A run
 * answers and its process ends, but the conversation the tool made is still there and the tool can
 * pick it up again by its own id, so for a set number of minutes the next message to that agent is
 * answered inside it. This is what closes one when nothing comes.
 *
 * A REFUSAL IS PRINTED ONCE AND THE PASS CARRIES ON. Problem MHcSOsp_u5pY, measured on the owner's
 * own call log: the over door was pressed 124,375 times in nine days and refused every time, one
 * press per pass per stuck over wait, the same refusal wearing a new request each time. So the
 * refusal is remembered, by session and by its own words, and the door is not pressed again while
 * the list still names that same wait as over. When the list stops naming it — because the line was
 * written by hand, or another worker ended it — the memory is dropped and the door may be pressed
 * again; when the moment named by the wait has moved, that is a NEW wait and equally a new question.
 * The line on stderr is a refusal's first only, never its repeat.
 */
interface RefusedPress {
  words: string
  /** The deadline the refused press was about, so a NEW wait for the same run is pressed again. */
  until: string | null
}

const pressedAndRefused = new Map<string, RefusedPress>()

async function endTheWaitsThatAreOver(settings: WorkerSettings): Promise<string[]> {
  const answered = await ask(settings, '/api/worker/waits')
  if (!answered.ok) return []
  const waits = (answered.body?.['waits'] ?? []) as { session: string; over: boolean; handle: string; until?: unknown }[]
  const stillOver = new Set<string>()
  const ended: string[] = []
  for (const one of waits) {
    if (!one.over) continue
    stillOver.add(one.session)
    const remembered = pressedAndRefused.get(one.session)
    const until = typeof one['until'] === 'string' ? one['until'] : null
    if (remembered !== undefined && remembered.until === until) continue
    const done = await ask(settings, `/api/worker/waits/${one.session}/over`, { method: 'POST' })
    if (done.ok) {
      pressedAndRefused.delete(one.session)
      ended.push(one.session)
      continue
    }
    const words = refusalIn(done.text)
    pressedAndRefused.set(one.session, { words, until })
    if (remembered === undefined || remembered.words !== words) {
      process.stderr.write(
        `The wait on run ${one.session}, which was serving ${one.handle}, could not be ended: ${words}\n`,
      )
    }
  }
  for (const session of [...pressedAndRefused.keys()]) {
    if (!stillOver.has(session)) pressedAndRefused.delete(session)
  }
  return ended
}

/**
 * PRESS THE DEAD-LETTER SWEEP ONCE, and say what it did, or null because it could not.
 *
 * Criterion M111. The sweep is the office's one write about its dead letters. It checks the threshold, after a time or
 * a count, from settings whose defaults the owner decided. When it is crossed, it
 * tells the secretary the person named about the backlog, or nobody when nobody is named, and names each addressee once
 * (problem 0WUuvB0IhRfb, src/server/lib/deadletters.ts).
 * Everything about it is the server's; this is the press.
 */
async function sweepTheDeadLetters(settings: WorkerSettings): Promise<PassReport['deadLetters']> {
  const done = await ask(settings, '/api/dead-letters/sweep', { method: 'POST', deadlineMs: 15_000 })
  if (!done.ok) {
    process.stderr.write(`The dead-letter sweep could not run: ${refusalIn(done.text)}\n`)
    return null
  }
  const said = done.body ?? {}
  return {
    groupId: typeof said['groupId'] === 'string' ? said['groupId'] : null,
    addressees: Array.isArray(said['addressees']) ? (said['addressees'] as unknown[]).map(String) : [],
    because: typeof said['because'] === 'string' ? said['because'] : '',
  }
}

/**
 * END THE TRIP THIS RUN WAS ON, wherever the run stops being watched.
 *
 * Criterion C6. The worker registers a visit for a run working away from home and, until 4 September
 * 2026, never ended one: visit `ImA3BZkS-2dp` was registered at 17:34:37, the run was stopped, and
 * the trip was still open when the citizens verifier looked. *Away from home* is where a person
 * reads who is working where, so it fills up with people who are not; and a stale visit weakens C4
 * while it is open — the verifier's own probe of the refusal was let through by a trip a browser had
 * left open seven minutes earlier. Problem `NYeGrR8IfY-7`.
 *
 * ONE PLACE, BECAUSE THERE IS ONE PLACE A RUN STOPS BEING WATCHED. `done` is called for a run that
 * answered, for one whose answer could not be filed twice, and for one that ended without answering;
 * the restart path splices the run out itself and calls this beside its own release. A run that
 * waits out has already been through `done`, so its trip ended when the run did — the wait is the
 * conversation staying open, not the run.
 *
 * IT IS ONE TRY AND IT NEVER STOPS THE ENDING. A trip left open is a wrong row on a list; a worker
 * that would not let go of a run because a list could not be updated is worse. A run with no visit
 * asks nothing.
 */
async function theTripIsOver(settings: WorkerSettings, run: Watching): Promise<void> {
  const visit = run.visit ?? null
  if (visit === null) return
  run.visit = null
  const said = await ask(settings, `/api/office/visits/${visit}/end`, { method: 'POST' })
  if (!said.ok) {
    process.stderr.write(
      `The visit ${visit} that run ${run.session} was on could not be ended: ${refusalIn(said.text)}\n`,
    )
  }
}

/**
 * THE CONVERSATION GOES ON THE RUN'S RECORD THE FIRST TIME THE RUN PRINTS IT. Plan hp7Z-IW9JWSX,
 * piece H5, for criterion W6.
 *
 * Codex and OpenCode name their conversation near the start of their output and not again where
 * anything waits for it, so until 3 October 2026 the id was read only when the run ended. A run
 * killed mid-turn then left no id on its record, and nothing could resume it. This reads the id on
 * every pass while the run is going, and writes it once. Claude Code and Kimi need none of this:
 * their adapters choose the id, and `startOne` writes it when the run starts.
 *
 * A REFUSED WRITE IS SAID AND TRIED AGAIN on the next pass, because the handle still has no id.
 */
async function recordTheConversationOnceItIsSaid(settings: WorkerSettings, run: Watching): Promise<void> {
  if (run.handle.providerSession !== null || run.adapter.conversationSoFar === undefined) return
  const conversation = run.adapter.conversationSoFar(run.handle)
  if (conversation === null) return
  const recorded = await ask(settings, `/api/records/${run.session}`, {
    method: 'PATCH',
    body: { dataPatch: { providerSession: conversation } },
  })
  if (recorded.ok) {
    run.handle.providerSession = conversation
    return
  }
  process.stderr.write(
    `Run ${run.session} named its conversation ${conversation}, and the record refused it, so it is tried again ` +
      `on the next pass: ${refusalIn(recorded.text)}\n`,
  )
}

/** How often a run's adapter is asked for its tokens so far. A Claude Code run's count is read from its whole conversation file. */
const READ_THE_TOKENS_EVERY_MS = 30_000
/** How much a run's count must have grown since the last count written before another is written, without a crossing. */
const WRITE_THE_TOKENS_AFTER = 10_000
/** How long after the last count written another may be written, without a crossing. */
const WRITE_THE_TOKENS_AT_MOST_EVERY_MS = 5 * 60_000

/**
 * A RUN'S TOKENS SO FAR GO ON ITS RECORD WHILE IT RUNS (wave 14d). The step reminder in src/server/lib/step-reminders.ts
 * reads them, and reminds the run of its role and its step after the tokens in MOLE_OFFICE_STEP_REMINDER_TOKENS.
 *
 * HOW OFTEN IT WRITES. The adapter is asked at most every 30 seconds. A count is written only when it differs from
 * the last one written, has grown by 10,000 or more since then, and five minutes have passed since the last write. So
 * a long run makes a few writes an hour, not one on each pass.
 *
 * AND AT ONCE WHEN THE COUNT CROSSES THE SETTING. The office counts a step's tokens from a count this worker wrote:
 * the one on the record when its last reminder about the run was sent, or 0 on the run's first step. So the worker
 * keeps every count it has written, after a 0, and writes at once when the count has reached one of them plus the
 * setting and the last count written had not. The office sees the crossing at its next minute. The setting
 * is read at each reading, so a changed setting reaches a running worker. A worker that restarts has lost the counts
 * written before, so for a run it picked up it knows only 0 and its own writes, and a reminder can then wait up to
 * five minutes longer. When the setting cannot be read, that is said on standard error, and that reading is written
 * by the first rule alone.
 *
 * A REFUSED WRITE IS SAID on standard error, and the count is tried again at the next reading.
 */
async function recordTheTokensSoFar(settings: WorkerSettings, run: Watching): Promise<void> {
  if (run.adapter.tokensSoFar === undefined) return
  const now = Date.now()
  if (run.tokens !== undefined && now - run.tokens.readAt < READ_THE_TOKENS_EVERY_MS) return
  const tokens = (run.tokens ??= { readAt: now, written: [0], writtenAt: null })
  tokens.readAt = now
  const read = run.adapter.tokensSoFar(run.handle)
  if (read.tokens === null) return
  const count = read.tokens
  const last = tokens.written[tokens.written.length - 1]!
  if (count === last) return
  let setting: number | null = null
  try {
    setting = gateNumber('step-reminder-tokens')
  } catch (err) {
    process.stderr.write(`Run ${run.session} has spent ${count} tokens, and the step reminder's setting could not be read, so only the growth since the last count decides whether it is written now: ${(err as Error).message}\n`)
  }
  const crossed = setting !== null && tokens.written.some((from) => last < from + setting && from + setting <= count)
  const grown = count - last >= WRITE_THE_TOKENS_AFTER && (tokens.writtenAt === null || now - tokens.writtenAt >= WRITE_THE_TOKENS_AT_MOST_EVERY_MS)
  if (!crossed && !grown) return
  const recorded = await ask(settings, `/api/records/${run.session}`, {
    method: 'PATCH',
    body: { dataPatch: { tokensSoFar: count, whenTheTokensWereRead: clockStamp(() => new Date(now)).stamp, howTheTokensWereReadAndCounted: read.read } },
  })
  if (recorded.ok) {
    tokens.written.push(count)
    tokens.writtenAt = now
    return
  }
  process.stderr.write(`Run ${run.session} has spent ${count} tokens, and its record refused the count, so it is tried again at the next reading: ${refusalIn(recorded.text)}\n`)
}

/**
 * PATCH A RUN'S OWN RECORD TO SAY HOW IT ENDED, once, and only for a run that ended on its own.
 *
 * IT IS AFTER THE RESTART QUESTION AND NOT BEFORE IT, which is where it used to be. A run whose
 * record already said `crashed` could not be recognised as one a restart cut off — that door reads
 * the stored state, and `crashed` is also what a run somebody stopped holds — so the answer was
 * always no and the conversation was told the run had ended without answering. The record's ending
 * is written by whichever of the two decided what the ending WAS.
 */
async function sayHowItEnded(settings: WorkerSettings, run: Watching): Promise<void> {
  if (run.patched === true || run.ended === undefined) return
  const answeredTime = run.ended.endedHow === 'answered' ? clockStamp() : null
  const whyItCrashed = run.inspection !== undefined && run.ended.endedHow !== 'answered' ? await whyThisCheckCrashed(settings, run) : null
  const steps = run.inspection !== undefined ? theModelsSteps({ said: theTextOrNull(run.handle.outputPath), folder: dirname(run.handle.outputPath) }) : null
  const patched = await ask(settings, `/api/records/${run.session}`, {
    method: 'PATCH',
    body: {
      dataPatch: {
        state: run.ended.endedHow === 'answered' ? 'finished' : 'crashed',
        doing: withHowItWasEnded(run.ended.because, run.handle),
        ...outputTiming(run.handle.outputPath),
        // THE WAIT LEFT OUT OF A CHECK'S CLOCK, beside the run's own start. Absent when its output held no seat line:
        // nothing recorded is not the same as no wait.
        ...theSeatWaitOnTheRecord(run),
        ...(answeredTime === null ? {} : { answeredAt: answeredTime.stamp, answeredTime }),
        // WHERE IT RAN, beside the runtime's own numbers (milestone M8): the host, or the sandbox this worker is in.
        ...(run.ended.usageReceipt === undefined ? {} : { usageReceipt: { ...run.ended.usageReceipt, ranIn: whereItRan(process.env) } }),
        ...(run.ended.providerSession === null ? {} : { providerSession: run.ended.providerSession }),
        ...(run.ended.served === undefined ? {} : { served: run.ended.served }),
        // WHY THE PROVIDER STOPPED IT, as the check tool's output named it. Never closedBecause or closedHow: those tell the
        // person and count against the casting roll, and a check's limit is for the hold on new checks alone.
        ...(run.ended.stopCause === undefined ? {} : { stopCause: run.ended.stopCause }),
        // WHY A CHECK CRASHED, on a check that did (item 3p5 of wave 13n). Its shape is CheckCrash in src/shared/kinds.ts.
        ...(whyItCrashed === null ? {} : { whyTheCheckCrashed: whyItCrashed }),
        // THE MODEL'S STEPS, on every check, read from OpenCode's own output (item 3p4 of wave 13n). Its shape is ModelSteps
        // in src/shared/kinds.ts. Every step is in a file beside the check's output, and the field names it.
        ...(steps === null ? {} : { theModelsSteps: steps }),
      },
      // NO REMINDER BEFORE THE SEAL (src/server/lib/before-the-seal.ts): the run has ended, so nobody is left to read one.
      remindBeforeTheSeal: false,
    },
  })
  if (!patched.ok) throw new Error(`The ending and usage receipt for run ${run.session} were not stored: ${refusalIn(patched.text)}`)
  run.patched = true
}

/**
 * WHY A CHECK CRASHED, from three things this worker can read: the check's session record, whose process rows say how far
 * it got; the exit file its process left; and what it wrote on its error stream. `whyTheCheckCrashed` in
 * src/config/inspection-ending.mjs works out the answer, and any other program that ends a check gets the same answer
 * from tools/inspector-why-it-crashed.mjs. A file that is not there is passed as null, so the answer says that nothing
 * recorded it. A record that could not be read is passed as null too, and the answer says the stage is not known.
 */
async function whyThisCheckCrashed(settings: WorkerSettings, run: Watching): Promise<ReturnType<typeof whyTheCheckCrashed>> {
  const record = await askWithoutThrowing(settings, `/api/records/${run.session}`, 10_000)
  return whyTheCheckCrashed({
    record: record.ok ? record.body : null,
    exit: theTextOrNull(run.handle.exitCodePath ?? exitCodePathOf(run.handle.outputPath)),
    errorStream: theTextOrNull(problemPathOf(run.handle.outputPath)),
  })
}

/** The text of a file a check left, or null when it is not there: nothing recorded. Any other failure to read it is thrown. */
function theTextOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

/**
 * A RESTART CUT THIS RUN OFF: carry the conversation on where the runtime allows, then end the run.
 *
 * Criterion M24. Answers null when the server says this was not a restart — the run died on its own
 * — and the caller then says that instead.
 *
 * ---------------------------------------------------------------------------------------
 * THE REPLACEMENT IS STARTED FIRST, AND THE OLD RUN IS ENDED SECOND
 * ---------------------------------------------------------------------------------------
 *
 * That order is chosen against its alternative. Ending first and starting second loses the message
 * outright if this worker stops in between: the record would say the run had ended, the conversation
 * would say to send it again, and nothing more would ever be tried. Starting first and stopping in
 * between leaves the old record saying `running`, so the next pass meets it again — and by then the
 * agent HAS a run going, so no second replacement is started and the door is simply pressed. The
 * cost of one order is a message quietly not answered; the cost of the other is one extra pass.
 *
 * ONE AGENT STILL GETS ONE RUN AT A TIME. The runs this worker is watching are asked, exactly as
 * `onePass` asks them for a message off the queue, so a restart never doubles up on an agent.
 */
async function carryOnFromARestart(
  settings: WorkerSettings,
  run: Watching,
  watching: Watching[],
): Promise<{ session: string; carriedOnBy: string | null } | null> {
  // A RUN THIS WORKER STARTED CANNOT HAVE BEEN CUT OFF BY A RESTART: this worker stops with its
  // server. Asking the door about it would be a request per dead run for an answer already known.
  if (run.delivering === undefined || !run.delivering.startedBefore) return null

  let carriedOnBy: string | null = null
  const alreadyGoing = watching.some((other) => other !== run && other.agentId === run.agentId)
  if (run.handle.providerSession !== null && !alreadyGoing) {
    const started = await startOne(
      {
        messageId: run.messageId,
        workspaceId: settings.workspace,
        to: { kind: 'agent', id: run.agentId },
        handle: run.handleName,
        runtime: run.handle.runtime,
        retired: false,
        body: run.delivering.body,
        quotes: run.delivering.quotes,
        quotePositions: run.delivering.quotePositions,
        sentBy: run.delivering.sentBy as Waiting['sentBy'],
        ...(run.delivering.whoSentIt === undefined ? {} : { whoSentIt: run.delivering.whoSentIt }),
        ...(run.delivering.howToAddressTheSender === undefined
          ? {}
          : { howToAddressTheSender: run.delivering.howToAddressTheSender }),
        ...(run.delivering.fromGroup === undefined ? {} : { fromGroup: run.delivering.fromGroup }),
        sentAt: run.delivering.sentAt,
        resume: { id: run.handle.providerSession, runtime: run.handle.runtime, run: run.session },
        hops: 0,
        needsNoRun: null,
        conversationIsWaiting: null,
        heldByAReview: null,
        runningAlready: null,
        // AND A RUN THIS WORKER IS CARRYING ON IS PAST THE PRESS. Something IS answering as this
        // agent: the run whose message this is. Criterion M78 is about a message nothing is
        // answering, and this is not one.
        nobodyIsAnsweringAsIt: null,
        // A RUN THIS WORKER IS CARRYING ON IS NOT HELD UP BY A HOLD. This message was already given
        // to a run, and the question here is only how to finish it.
        heldByALiveSession: null,
        // AND NOTHING HERE KNOWS WHETHER IT WAS AN EMERGENCY. What a run this worker did not start
        // was delivering is kept on the watched run, which carries the words and not the flag, so
        // false is what is known rather than a claim that it was ordinary. The message is being
        // finished rather than queued, so the flag would change nothing about what happens next —
        // only the first line of the prompt, and that line was already written by the first run.
        urgent: false,
        // THE ROUTED LINE THE FIRST RUN WAS TOLD, carried on the run row this worker picked up. The
        // replacement run is a fresh process and is told the same thing the first run was.
        routedLine: run.delivering.routedLine,
        // THE MARK, THE PERSON'S OWN LABEL AND THE TWO INSTRUCTIONS, as the office handed them over with the run.
        intent: run.delivering.intent,
        label: run.delivering.label,
        whatTheMarkAsks: run.delivering.whatTheMarkAsks,
        whatTheLabelAsks: run.delivering.whatTheLabelAsks,
        markedParts: run.delivering.markedParts,
        noMarkName: run.delivering.noMarkName,
      },
      settings,
      watching,
    )
    if (started.ok) carriedOnBy = started.started.session
    else {
      process.stderr.write(
        `A restart cut run ${run.session} off and it could not be carried on: ${started.because}\n`,
      )
    }
  }

  const ended = await ask(settings, `/api/worker/runs/${run.session}/cut-off`, { method: 'POST' })
  if (!ended.ok) {
    // THE SERVER SAYS THIS WAS NOT A RESTART. Nothing was lost by asking, and the caller falls back
    // to the sentence for a run that died on its own.
    if (carriedOnBy === null) return null
    process.stderr.write(
      `Run ${run.session} was carried on by ${carriedOnBy} and the old run could not be ended: ` +
        `${refusalIn(ended.text)}\n`,
    )
  }
  return { session: run.session, carriedOnBy }
}

/**
 * START THE RESUMES THE PERSON ASKED FOR (criterion W7, src/server/lib/interrupted.ts).
 *
 * Each is the tool's own resume by the recorded conversation, with the same message, started through
 * the one place a run is started from, exactly as the carry-on of a run a restart cut off is. The
 * worker then tells the server which run took it up, or why it could not start, and the page says so.
 *
 * ONE AGENT STILL GETS ONE RUN AT A TIME. An agent with a run going waits, and is tried again on the
 * next pass; its ask stays on the record until then.
 */
async function startTheResumesThePersonAsked(settings: WorkerSettings, watching: Watching[]): Promise<{ session: string; as: string }[]> {
  const answered = await ask(settings, '/api/worker/resumes')
  if (!answered.ok) return []
  const resumes = (answered.body?.['resumes'] ?? []) as {
    session: string
    messageId: string
    agentId: string
    handle: string
    runtime: string
    providerSession: string
    body: string
    quotes?: readonly Context[]
    quotePositions?: readonly number[] | null
    sentAt: string
    sentBy: { kind: string; id: string } | null
    fromGroup: TheGroupOfAHandOver | null
    routedLine: string | null
    intent?: unknown
    label?: unknown
    whatTheMarkAsks?: string
    whatTheLabelAsks?: string
    markedParts?: readonly AMarkedPartOnTheWire[]
    noMarkName?: string
  }[]
  const started: { session: string; as: string }[] = []
  for (const one of resumes) {
    if (watching.some((run) => run.agentId === one.agentId)) continue
    const result = await startOne(
      {
        messageId: one.messageId,
        workspaceId: settings.workspace,
        to: { kind: 'agent', id: one.agentId },
        handle: one.handle,
        runtime: one.runtime,
        retired: false,
        body: one.body,
        quotes: one.quotes,
        quotePositions: one.quotePositions,
        sentBy: one.sentBy as Waiting['sentBy'],
        ...(one.fromGroup === null ? {} : { fromGroup: one.fromGroup }),
        sentAt: one.sentAt,
        resume: { id: one.providerSession, runtime: one.runtime, run: one.session },
        hops: 0,
        needsNoRun: null,
        conversationIsWaiting: null,
        heldByAReview: null,
        runningAlready: null,
        // THE PERSON PRESSED RESUME ON THIS RUN, which is the press criterion M78 asks for.
        nobodyIsAnsweringAsIt: null,
        heldByALiveSession: null,
        // Nothing here knows whether the first message was an emergency, and the first run's prompt
        // already said what it said; false is what is known, as in the carry-on.
        urgent: false,
        routedLine: one.routedLine,
        intent: one.intent,
        label: one.label,
        whatTheMarkAsks: one.whatTheMarkAsks,
        whatTheLabelAsks: one.whatTheLabelAsks,
        markedParts: one.markedParts,
        noMarkName: one.noMarkName,
      },
      settings,
      watching,
    )
    const said = await ask(settings, `/api/worker/runs/${one.session}/resumed`, {
      method: 'POST',
      body: result.ok ? { startedAs: result.started.session } : { failed: result.because },
    })
    if (!said.ok) {
      process.stderr.write(`What became of the resume of run ${one.session} could not be written: ${refusalIn(said.text)}\n`)
    }
    if (result.ok) started.push({ session: one.session, as: result.started.session })
  }
  return started
}

/** Where one run's output goes. One place, so a run picked up later reads the file it wrote. */
function outputPathFor(settings: WorkerSettings, session: string): string {
  return join(settings.outputRoot, session, 'said.txt')
}

/**
 * PICK UP THE RUNS THAT WERE ALREADY GOING, so a worker that was restarted does not lose them.
 *
 * Problem `wrtc5jmjIVpM`. This worker keeps the runs it is watching in a list in memory. When it
 * stops, that list goes: the processes carry on, their session records stay marked running, and
 * nothing reads their output, so the person who wrote to the agent gets a tick and no answer. The
 * API server restarts on every merge under `tsx watch`, so this is not a rare state.
 *
 * Everything needed was already stored, and `GET /api/worker/runs` reads it. Nothing new is written
 * anywhere: a run picked up here is watched exactly as one this worker started, and its output file
 * is the file it has been writing all along.
 *
 * IT RUNS ON EVERY PASS, NOT ONLY AT STARTUP. A pass costs one request, and a startup that happened
 * while the API was not answering would otherwise lose the runs for good.
 *
 * A RUN OF A TOOL NOTHING HERE SERVES IS LEFT ALONE and said once in the log. That is a run started
 * while `MOLE_OFFICE_FAKE_RUNTIME` was set on an installation that no longer has it set. Nothing
 * can read its output honestly, so nothing pretends to.
 *
 * IN MERGES-ONLY MODE WITH CHECKS ON, ONLY THE CHECKS ARE PICKED UP. That pass counts the checks it watches against the
 * office's number at once, so a check left running that it did not pick up is a check it did not count. A check whose
 * process was never registered because its worker ended first is a check too, and is closed here as in the ordinary
 * mode. Every other run is left alone, because in that mode no agent run is carried on.
 */
const saidNothingServesIt = new Set<string>()
const saidWhyNotPickedUp = new Set<string>()

export async function pickUpRunsAlreadyGoing(
  settings: WorkerSettings,
  watching: Watching[],
  only: 'every run' | 'only the checks' = 'every run',
): Promise<string[]> {
  const answered = await ask(settings, '/api/worker/runs')
  if (!answered.ok) return []
  const going = (answered.body?.['runs'] ?? []) as {
    startupFailed?: { run?: string; reason: string }
    startupHeld?: string
    session: string
    messageId: string
    agentId: string
    handle: string
    runtime: string
    providerSession: string | null
    continues?: string | null
    pid: number
    pgid: number | null
    startedAt: string
    says: string
    startedBeforeThisServer: boolean
    body: string
    quotes?: readonly Context[]
    quotePositions?: readonly number[] | null
    sentAt: string
    sentBy: { kind: string; id: string } | null
    whoSentIt?: string
    howToAddressTheSender?: string | null
    fromGroup?: TheGroupOfAHandOver | null
    routedLine: string | null
    intent?: unknown
    label?: unknown
    whatTheMarkAsks?: string
    whatTheLabelAsks?: string
    markedParts?: readonly AMarkedPartOnTheWire[]
    noMarkName?: string
  }[]
  const took: string[] = []
  for (const one of going) {
    if (only === 'only the checks' && one.runtime !== 'inspection-tool') continue
    const watched = watching.find((run) => run.session === one.session)
    if (watched !== undefined) watched.startupGroupHeld = one.startupHeld !== undefined
    if (one.startupHeld !== undefined) {
      await ask(settings, `/api/records/${one.session}`, { method: 'PATCH', body: { dataPatch: { doing: one.startupHeld } } })
      continue
    }
    if (watched !== undefined) continue
    if (one.startupFailed) {
      if (one.startupFailed.run !== undefined) {
        const ended = await ask(settings, `/api/checks/${one.startupFailed.run}/tool-ended`, {
          method: 'POST', body: { session: one.session, reason: one.startupFailed.reason },
        })
        if (!ended.ok) continue
      }
      const closed = await ask(settings, `/api/records/${one.session}`, {
        method: 'PATCH', body: { dataPatch: { state: 'crashed', doing: one.startupFailed.reason } },
      })
      if (closed.ok) took.push(one.session)
      continue
    }

    /**
     * A RUN WITH NO PROCESS GROUP WRITTEN DOWN IS NOT PICKED UP, rather than one guessed for it.
     *
     * The ledger reads the group off the process table when it registers a process row and refuses
     * a pid that is not running, so a process row always has one and this is not expected to happen.
     * If it ever does, taking the pid for the group would be a guess at what to signal, which is the
     * one thing CLAUDE.md is most explicit about never doing.
     */
    if (one.pgid === null) {
      if (!saidNothingServesIt.has(one.session)) {
        saidNothingServesIt.add(one.session)
        process.stderr.write(
          `Run ${one.session} has no process group written down, so it was not picked up: there would be nothing ` +
            `safe to signal. Its output is in ${outputPathFor(settings, one.session)}.\n`,
        )
      }
      continue
    }
    const stored = one.runtime === 'inspection-tool' ? await ask(settings, `/api/records/${one.session}`) : null
    const recordData = (stored?.body?.['record'] as { data?: Record<string, unknown> } | undefined)?.data
    const extra = recordData?.['extra'] as { inspectionRun?: string; inspectionMinutes?: number } | undefined
    const inspection = extra?.inspectionRun ? { run: extra.inspectionRun, checkout: null, minutes: extra.inspectionMinutes, ...(typeof recordData?.['model'] === 'string' ? { model: recordData['model'] } : {}) } : undefined
    const adapter = inspection ? new InspectionAdapter(inspection, settings.env) : adapterFor(one.runtime, settings.env)
    if (adapter === null) {
      if (!saidNothingServesIt.has(one.session)) {
        saidNothingServesIt.add(one.session)
        process.stderr.write(
          `Run ${one.session} is a run of "${one.runtime}", which nothing here serves, so it was not picked up. ` +
            `Its output is in ${outputPathFor(settings, one.session)}.\n`,
        )
      }
      continue
    }

    /**
     * WHERE THE RUN RUNS NOW (`whereAPickedUpRunRuns`). On Windows the list gives the starter and group 0, and the
     * program the starter left in its Job Object is watched in its place, with the starter's pid as its group. A Job
     * Object that cannot be read leaves the run for a later pass, said once for each reason.
     *
     * A CHECK'S HANDLE carries the worker's own stamp of its start, which `runIsAlive` prefers to `startedAt`. Where
     * the program is watched in place of its starter, the program's start takes that stamp's place, so the program is
     * compared with its own start. The check's clock then counts from the program's start.
     */
    const where = whereAPickedUpRunRuns({ pid: one.pid, pgid: one.pgid, startedAt: one.startedAt })
    if ('unknown' in where) {
      const said = `${one.session} ${where.unknown}`
      if (!saidWhyNotPickedUp.has(said)) {
        saidWhyNotPickedUp.add(said)
        process.stderr.write(
          `Run ${one.session} was not picked up on this pass, because where its program runs is unknown. ${where.unknown} ` +
            'A later pass asks again.\n',
        )
      }
      continue
    }
    watching.push({
      ...(inspection ? { inspection } : {}),
      adapter,
      handle: {
        runtime: one.runtime,
        pid: where.pid,
        pgid: where.pgid,
        startedAt: where.startedAt,
        ...(recordData?.['startedTime'] ? { startedTime: where.programStarted ?? (recordData['startedTime'] as ClockStamp) } : {}),
        providerSession: one.providerSession,
        // A RUN THAT PICKED UP A CONVERSATION, as the office reads it (`theRunItPickedUp`), so its receipt is read as a
        // resumed run's after a restart too (wave 13s round 43).
        ...(typeof one.continues === 'string' && one.providerSession !== null
          ? { resumed: one.providerSession, continues: { run: one.continues, outputPath: outputPathFor(settings, one.continues) } }
          : {}),
        outputPath: outputPathFor(settings, one.session),
        exitCodePath: `${outputPathFor(settings, one.session)}.exit-code`,
      },
      session: one.session,
      messageId: one.messageId,
      agentId: one.agentId,
      handleName: one.handle,
      lastSaid: one.says,
      ledgerRow: null,
      delivering: {
        body: one.body,
        quotes: one.quotes,
        quotePositions: one.quotePositions,
        sentAt: one.sentAt,
        sentBy: one.sentBy,
        ...(one.whoSentIt === undefined ? {} : { whoSentIt: one.whoSentIt }),
        ...(one.howToAddressTheSender === undefined ? {} : { howToAddressTheSender: one.howToAddressTheSender }),
        ...(one.fromGroup === undefined ? {} : { fromGroup: one.fromGroup }),
        startedBefore: one.startedBeforeThisServer,
        routedLine: one.routedLine,
        intent: one.intent,
        label: one.label,
        whatTheMarkAsks: one.whatTheMarkAsks,
        whatTheLabelAsks: one.whatTheLabelAsks,
        markedParts: one.markedParts,
        noMarkName: one.noMarkName,
      },
    })
    took.push(one.session)
  }
  return took
}

/**
 * SAY SOMETHING ON A WATCHED RUN'S DELIVERY ROW, WITHOUT OVERWRITING SOMEBODY ELSE'S SENTENCE.
 *
 * The worker writes over its own last sentence and nothing else. Where the row says something else,
 * somebody wrote it since — a person stopping the run says who and why — and that is kept. The
 * answer says which happened, and the caller writes down what the row now holds either way.
 */
async function sayOnTheRow(settings: WorkerSettings, run: Watching, because: string): Promise<void> {
  const sentence = cutForTheHeldDoor(because)
  const said = await ask(settings, `/api/worker/messages/${run.messageId}/held`, {
    method: 'POST',
    body: { to: { kind: 'agent', id: run.agentId }, because: sentence, replacing: run.lastSaid },
  })
  const written = said.body?.['written']
  const there = said.body?.['because']
  run.lastSaid = written === false && typeof there === 'string' ? there : sentence
}

/**
 * File the session record, write the rules, start the tool, register it, and mark the message taken.
 *
 * EXPORTED FOR ONE TEST, and the test is about the refusal at the top of it. `onePass` gates this
 * behind `whyNotNow`, but `carryOnFromARestart` calls it directly, so the runtime check here is on a
 * path nothing else guards. It answers before it touches the filesystem or starts anything, which is
 * what makes that case safe to run.
 */
export async function startOne(
  one: Waiting,
  settings: WorkerSettings,
  watching: Watching[],
): Promise<
  | { ok: true; started: { messageId: string; agent: string; runtime: string; session: string } }
  | { ok: false; because: string }
> {
  /**
   * NO RUN FOR A MESSAGE AND NO CHECK IN MERGES-ONLY MODE, refused here as well as never asked for by `onePass`.
   * This is the one place a run for a message is started from. A caller added later cannot start one in that mode.
   * The rounds asked through the next-round door are started by `tendTheRounds`, and the worker runs asked through
   * the worker-run door by `tendTheWorkerRuns`, each with the sandbox launcher, and not from here.
   */
  if (settings.mergesOnly === true && !(one.inspection !== undefined && settings.checksInMergesOnly === true)) {
    return { ok: false, because: `Nothing was started for this message. ${MERGES_ONLY_SAYS}` }
  }
  /**
   * NO WORDS, NO RUN. A narrow queue row has no body on it by design; this function is the one place
   * a run is started from, and a caller that could not put the words in hand is refused loudly
   * rather than started on an empty prompt.
   */
  if (one.body === undefined) {
    return { ok: false, because: 'This message arrived with no words on it, so there is nothing to answer and nothing is started.' }
  }
  const runtime = one.runtime ?? ''
  const cannotStart = one.inspection ? null : whyTheOfficeCannotStartThisRuntime(runtime)
  if (cannotStart !== null) return { ok: false, because: cannotStart }
  // THE MODEL THE OFFICE CHOSE TRAVELS ON THE ROW (criterion U2): `one.inspection.model` for a check,
  // and `one.model` with `one.variant` for any other run. Null means it chose none, and the adapter
  // reads this worker's own environment.
  const adapter = one.inspection
    ? new InspectionAdapter(one.inspection, settings.env)
    : adapterFor(runtime, settings.env, { model: one.model ?? null, variant: one.variant ?? null })
  if (adapter === null) return { ok: false, because: `Nothing here serves the runtime word "${runtime}".` }
  /**
   * NO MODEL, NO RUN, as FLO-05 of a decision says. The office ships no default model, so an
   * adapter that passes a model and has none to pass answers null. The message is held with the sentence that says
   * where a model is named, and nothing is started. Asked once here, so the record below carries the same word the
   * command line is given.
   */
  const model = adapter.modelItWouldUse === undefined ? undefined : adapter.modelItWouldUse()
  if (model === null) return { ok: false, because: NO_MODEL_SAYS[one.inspection ? 'check' : 'conversation'] }

  const cwd = settings.checkout
  const refused = refuseAWorkingDirectory(cwd, settings.checkout)
  if (refused !== null) return { ok: false, because: refused }

  /**
   * A CONVERSATION IS PICKED UP ONLY BY THE TOOL THAT MADE IT.
   *
   * A provider's conversation id is one tool's name for one conversation and means nothing to
   * another tool. Measured on 4 September 2026 (problem `QLYp6AG-Dnbw`): a `claude-code` run was
   * started with an id the fake runtime had made, Claude Code refused the argument, and the message
   * had already been marked taken. An agent whose runtime word is changed, or a machine where the
   * fake runtime was on and then off, reaches this every time. Starting a new conversation is the
   * honest answer, and the row a person reads says that is what happened and why.
   */
  const pickUp = !one.inspection && one.resume !== null && one.resume.runtime === adapter.runtime ? one.resume.id : null
  const notThatOne =
    one.resume === null || pickUp !== null
      ? ''
      : ` The newest conversation ${one.handle} had here was made by ${one.resume.runtime} and this is a ` +
        `${adapter.runtime} run, so it was not picked up and this run starts a new one.`

  /**
   * WHICH PROGRAM IS ABOUT TO RUN THIS, AND WHAT VERSION IT SAYS IT IS.
   *
   * Problem `cP2qOXQoYRcv`. This machine held Codex twice — 0.137.0 at /usr/local/bin/codex and
   * 0.147.0 under nvm — and every adapter resolves its command through `PATH`, so which one answered
   * depended on the shell the worker was started from. The owner removed the older one on
   * 5 September 2026; `PATH` still decides, so the run says which program ran, on its own record.
   *
   * ASKED HERE FOR EVERY ADAPTER, not in each one, because `theProgramThatRan` reads the same
   * `command` and the same `PATH` that `startRun` will resolve a moment later. One place asks, so a
   * fourth adapter records this without doing anything, and the answer cannot disagree with the
   * program that runs.
   *
   * IT COSTS ONE PROCESS PER WORKER, not one per run: the reading is remembered inside
   * `theProgramThatRan` against the command and the `PATH`.
   */
  /**
   * THE EXPECTED TIME THE START DOOR TYPED, CARRIED ONTO THE RUN'S RECORD. Criterion F10.
   *
   * Whoever started the task may type how long it was expected to take, at the person's press
   * (POST /api/messages/:id/start-an-agent, body {"expectedMinutes": <whole minutes>}). The press
   * wrote it on the message under `runWasAskedFor`; this reads it once per run START and files it on
   * the session record, which is the one place the office's expected-time reminder reads. Nothing
   * here invents a duration: a message with no typed time starts a run that carries none, and the
   * criterion says plainly that nothing is reminded about such a run.
   */
  const expected = await theTypedExpectedMinutes(settings, one.messageId)
  const declaredTool = theToolARunDeclares(adapter)
  // Manual Linux starts need the same version and registration gates as session-backed starts.
  const startupWitness = !one.inspection ? makeStartupWitness(settings.outputRoot) : null

  const filed = await ask(settings, '/api/records', {
    method: 'POST',
    body: {
      kind: 'session',
      title: one.inspection ? `The office checking run ${one.inspection.run}` : `${one.handle} answering a message`,
      data: {
        state: 'running',
        runtime: adapter.runtime,
        // THE DECLARED TOOL, the one the usage page counts; absent for a run of no adapted tool.
        ...(declaredTool === null ? {} : { adaptedTool: declaredTool }),
        doing: `reading a message sent at ${one.sentAt} and answering it`,
        workingDirectory: cwd,
        startedByMoleOffice: true,
        // THE RUN NAMES THE AGENT BY ITS HANDLE AND BY ITS REGISTRY ID. The handle is what the run
        // answers as and what the archive and the other writers carry as `servingAgent`; the id is
        // the identity, and since I-1 an agent's id need not equal its handle. Both are written so a
        // later reader can find the agent whether it holds the old name or the id. `one.to.id` is
        // the registry id the message's delivery row stored, and `one.handle` is resolved from it.
        servingAgent: one.handle,
        servingAgentId: one.to.id,
        extra: {
          ...(one.inspection
            ? { purpose: 'inspection', inspectionRun: one.inspection.run, inspectionMinutes: (adapter as InspectionAdapter).minutes(), ...(settings.env[FAKE_INSPECTION_TOOL_SETTING] ? { fakeInspectionTool: settings.env[FAKE_INSPECTION_TOOL_SETTING] } : {}) }
            : { messageWorkerStart: 'preparing', ...(settings.session === null ? {} : { messageWorker: settings.session }), ...(startupWitness === null ? {} : { startupWitness: startupWitness.path, ...(startupWitness.boot !== null && startupWitness.inode !== null ? { startupBoot: startupWitness.boot, startupInode: startupWitness.inode } : {}) }) }),
        },
        deliveringMessage: one.messageId,
        ...(expected === null ? {} : { expectedMinutes: expected }),
        ...(pickUp === null ? {} : { providerSession: pickUp }),
        // WHICH MODEL THIS RUN IS GIVEN. Criterion M85. Asked of the adapter that is about to start
        // it, so what is recorded is the argument that actually goes to the command rather than a
        // second reading of the setting that could disagree with it. An adapter with no model to
        // name writes none: an opencode run nobody named a model for, and the three runtimes that
        // are configured elsewhere, would otherwise have this record invent a fact.
        ...(model === undefined ? {} : { model }),
        // NO EFFORT FROM A VARIANT (wave 13n round BQ). A variant is not an effort, so the variant an
        // adapter would use is not written here. A native start files the office's effort through
        // recordEffort, before spawning.
        // WHICH RUN STARTED THIS ONE: this worker's own run. Criterion P11, problem pcEzep3-FHck.
        //
        // The other half of P11 is built already: an agent's first run names the run that
        // registered it, written by `theRunThatStartedThisOne` in src/server/lib/records.ts. A run
        // the worker starts is not registered by anybody, so nothing wrote a parent for it and
        // following a chain of runs upward stopped here with nothing saying why.
        //
        // THE WORKER'S OWN RUN IS THE ANSWER, AND IT IS OBSERVED RATHER THAN WORKED OUT. This
        // process is what starts the tool, and `settings.session` is the session record the API
        // server filed for it and handed over as `--session`. Both records are filed in
        // `settings().workspace`, so the parent is always a run in the same project as its child.
        //
        // THE OTHER CANDIDATE IS NOT WRITTEN, AND THAT IS THE POINT. The run of whoever wrote the
        // message did not start this run: it caused a message to exist, which is a different fact
        // and one the delivery row already holds. Writing it here would be a guess wearing a
        // fact's clothes, which is what the problem record says was refused the first time.
        //
        // NOTHING IS WRITTEN WHEN THIS WORKER HAS NO RUN OF ITS OWN, which is a worker somebody
        // started by hand with no `--session`. Absence says nobody recorded one; a parent invented
        // for it would say something nothing observed.
        ...(settings.session === null ? {} : { parentAttachment: settings.session }),
      },
    },
  }).catch(error => { if (startupWitness !== null) forgetStartupWitness(startupWitness); throw error })
  const session = (filed.body?.['record'] as { id?: string } | undefined)?.id ?? null
  if (session === null) {
    if (startupWitness !== null) forgetStartupWitness(startupWitness)
    return { ok: false, because: `A session record for this run could not be filed: ${filed.text.slice(0, 300)}` }
  }
  let launchMayHaveStarted = false
  let probeMayHaveStarted = false
  let startupRegistered = false
  let inspectionToolRecorded = false
  try {
  // Filing is the admission point. A waiting starter change can refuse it; once it commits,
  // the live session makes a later starter change wait for this run.
  // Keep the probe phase separate so recovery can check its gate, or preserve an older ambiguous start.
  if (!one.inspection) {
    const probing = await ask(settings, `/api/records/${session}`, {
      method: 'PATCH', body: { dataPatch: { extra: { messageWorkerStart: 'probing' } } },
    })
    if (!probing.ok) throw new Error(`The version probe could not be recorded: ${refusalIn(probing.text)}`)
  }
  const ran = startupWitness === null ? theProgramThatRan(adapter.command, settings.env['PATH']) : await theGatedProgramThatRan(adapter.command, settings.env['PATH'], startupWitness, async group => {
    const recorded = await ask(settings, `/api/records/${session}`, { method: 'PATCH', body: { dataPatch: { extra: { startupGroup: group } } } })
    if (!recorded.ok) throw new Error(`${sayInEnglish('startupGate.noGroup')} ${refusalIn(recorded.text)}`)
    // Once the callback returns the gate can execute outside code; recovery checks its group.
    probeMayHaveStarted = true
  })
  const recordedProgram = await ask(settings, `/api/records/${session}`, {
    method: 'PATCH', body: { dataPatch: { ...(ran.path === null ? {} : { ranProgram: ran.path }), ranProgramVersion: ran.version, ...(!one.inspection ? { extra: { messageWorkerStart: 'preparing', ...(startupWitness === null ? {} : { startupGroup: null }) } } : {}) } },
  })
  if (!recordedProgram.ok) throw new Error(`The program and version could not be recorded: ${refusalIn(recordedProgram.text)}`)
  // A successful gated probe returned only after its recorded group was empty.
  probeMayHaveStarted = false
  /**
   * THE KEY THE OFFICE MINTED FOR THIS RUN, if it minted one. M81 and P83 point 5.
   *
   * It came back on the reply that filed the run's own session record, bound to the agent the run
   * serves, and it is handed to the run below instead of whatever single key this worker was started
   * with. The value is read here and used; it is never logged, written to a file, or put in a
   * refusal. Absent means the office minted none — no registry row for the served agent, or a run
   * the office does not start. A run given no key does not inherit the worker's.
   */
  const runKey =
    ((filed.body?.['runKey'] as { key?: unknown } | undefined)?.key as string | undefined) ?? null

  // THE STATE OF THE PROJECT, FOR THE TOOLS THAT HAVE NO START HOOK. Criterion I2. It is read here
  // rather than in the rules writer because the writer is pure: it reads two files and returns a
  // string, and a fetch inside it would make it something a test cannot run without a server.
  //
  // A brief that could not be read is null and the rules file goes out without it. It is not worth
  // refusing to start a run over, and `briefWritten` on the reply says which happened, so nothing
  // reports a briefed run that was not one.
  // THE STATE OF THE PROJECT, FOR THE TOOLS WITH NO START HOOK MOLE OFFICE USES. Criterion I2.
  //
  // It goes in the prompt and not in the rules file. A rules file can be dropped whole for being
  // too long with nothing said about it: measured 6 September 2026, Codex 0.147.0 reads a project
  // document only up to `project_doc_max_bytes`, 32,768 by default, and the file this repository
  // writes is 32,653 bytes. What goes in is the opening the reply carries, built once in the route,
  // so the hook, this prompt and tools/brief.mjs all say the same paragraphs.
  //
  // A brief that could not be read is null and the prompt says so in words. It is not worth
  // refusing to start a run over.
  //
  // AND IT IS THE ONE REQUEST HERE WITH A DEADLINE ON IT. Everything else the worker asks for is
  // something the run cannot go ahead without; the brief is context, and a run that never starts
  // because the state of the project was slow to read is worse than a run that starts without it.
  // Measured 6 September 2026: without a deadline, adding this call made
  // `tests/a-restart-never-loses-a-run.test.ts` fail about half the time, because a run's whole
  // start was waiting behind a read of every record in the project.
  const outputPath = outputPathFor(settings, session)
  mkdirSync(join(settings.outputRoot, session), { recursive: true })
  let brief: string | null = null
  let leading = ''
  let knows: { path: string; say: string } | null = null
  let rulesNotWritten: string | null = null
  let noticeBatch: {messages:{messageId:string;body:string;quotes?:readonly Context[];quotePositions?:readonly number[] | null}[]} | null = null
  if (!one.inspection) {
  const briefed = await askWithoutThrowing(settings, '/api/brief', BRIEF_DEADLINE_MS, one.handle, runKey)
  const head = briefed.body === null ? null : briefed.body['head']
  brief = briefed.ok && typeof head === 'string' && head.trim() !== '' ? head : null
  if (brief === null) {
    process.stdout.write(
      `${one.handle}: this run starts without the state of the project. ` +
        (briefed.ok
          ? 'GET /api/brief answered without an opening this worker could read.\n'
          : `GET /api/brief did not answer within ${String(BRIEF_DEADLINE_MS)} ms, or answered ${String(briefed.status)}.\n`),
    )
  }
  /**
   * CLOSE THE RUN'S RECORD WHEN THE START FAILS BEFORE IT REACHES THE MODEL.
   *
   * The three failures below — the chapters the run reads, the rules file, and the words on taking
   * somebody to a page — are all on this path, where `one.inspection` is not set, so no check is
   * told that its tool ended. The refusal of a start over a tracked rules file is closed the same
   * way, though it is an answer rather than a failure. The record is closed with state "crashed"
   * and the same sentence the caller is given, which is how every other failed start in this
   * function closes its record. A rules file the file system refused to write — the marked `CLAUDE.md`
   * of an installation, or the rules file any other tool reads (`adapter.rulesFile`) — is neither:
   * that run goes on without the general rules and says so, below.
   *
   * A REFUSED PATCH IS NOT A SECOND FAILURE: the caller still gets the `because` sentence. A close
   * is never sent from inside a `try` whose `catch` closes again, because a thrown request there
   * would be read as that catch's failure and close the record a second time with the wrong words.
   */
  const endTheStartAsCrashed = async (because: string): Promise<{ ok: false; because: string }> => {
    await ask(settings, `/api/records/${session}`, { method: 'PATCH', body: { dataPatch: { state: 'crashed', doing: because } } })
    return { ok: false, because }
  }

  const selected = await askWithoutThrowing(settings, '/api/office-regulations/chapters', BRIEF_DEADLINE_MS, one.handle, runKey)
  if (!selected.ok) {
    const because = `GET /api/office-regulations/chapters did not answer with selected chapters (${String(selected.status)}). No run was started.`
    return await endTheStartAsCrashed(because)
  }
  /**
   * WHAT THE RULES WRITER ANSWERED, declared before the `try` so the refusal below is closed after
   * the `try` has ended. A close sent from inside a `try` whose `catch` closes again would be read
   * as that catch's failure and close the record a second time with the wrong words. The answer that
   * the run goes on without the general rules is read after the `try` as well.
   */
  let rulesWritten: RulesWritten | null = null
  try {
    const chapters = chaptersSelectedForRun(selected.body, settings.checkout)
    if (typeof selected.body?.['says'] === 'string' && selected.body['says'] !== '') process.stdout.write(String(selected.body['says']) + '\n')
    rulesWritten = writeRulesInto(cwd, settings.checkout, adapter.rulesFile, chapters)
  } catch (err) {
    const because = `The rules a run reads could not be written: ${(err as Error).message}`
    return await endTheStartAsCrashed(because)
  }
  /**
   * A REFUSAL IS AN ANSWER, NOT A FAILURE. `writeRulesInto` answers `refused: true` with the
   * sentence to hand back when this checkout tracks the rules file it would write (message
   * `sJlcSoK29PeV`, item 3). The sentence goes back whole, never behind "The rules a run reads
   * could not be written:", and the run's record is closed with it as `doing`.
   */
  if (rulesWritten !== null && rulesWritten.refused === true) return await endTheStartAsCrashed(rulesWritten.because)
  /**
   * A RUN THAT STARTS WITHOUT THE GENERAL RULES SAYS SO, in this worker's log as a missing brief is,
   * and in its prompt. Message TxINgmO9H6gu: another `CLAUDE.md` in the folder, a folder that cannot
   * be written, or a refused write of the file `adapter.rulesFile` names does not stop the run, and
   * the run never goes on silently without them. The sentence is the writer's, whole.
   */
  if (rulesWritten !== null && rulesWritten.startsWithoutTheRules === true) {
    process.stdout.write(`${one.handle}: ${rulesWritten.because}\n`)
    rulesNotWritten = rulesWritten.because
  }

  /**
   * WHAT THIS RUN IS TOLD ABOUT TAKING SOMEBODY TO A PAGE, read out of the skill (criterion M23).
   *
   * Read here rather than once at startup so that editing the skill reaches the next run rather
   * than the next restart of the worker. It throws when the section has gone, and the run is not
   * started: an agent that does not know how to lead answers "take me there" with a link, which is
   * the defect this criterion exists to remove, and it would do it without saying anything.
   */
  try {
    leading = howToLead(settings.checkout)
  } catch (err) {
    return await endTheStartAsCrashed((err as Error).message)
  }


  /**
   * WHAT THIS AGENT ALREADY KNOWS, WRITTEN BESIDE THE RUN. Criterion H3.
   *
   * The text is built on the server, where the notes and the records are, and this only writes the
   * file: the worker holds no database path and no view about what an agent knows.
   *
   * A RUN STILL STARTS WHEN THIS FAILS, and the prompt says so. The message is the thing that has to
   * reach the agent; refusing to answer it because a folder could not be read would be losing the
   * work over the bundle. What is never done is naming a file that is not there.
   */
  const knowsPath = join(settings.outputRoot, session, 'what-this-agent-knows.md')
  const gathered = await ask(settings, `/api/handles/${encodeURIComponent(one.handle)}/knows`)
  const bundle = gathered.ok ? ((gathered.body?.['text'] as string | undefined) ?? null) : null
  if (bundle !== null) {
    try {
      writeFileSync(knowsPath, bundle, 'utf8')
      knows = { path: knowsPath, say: String(gathered.body?.['notesSay'] ?? '') }
    } catch {
      knows = null
    }
  }

  if (one.noticeBatchAvailable) {
    const prepared = await ask(settings, `/api/worker/messages/${one.messageId}/taken`, {method:'POST',body:{to:one.to,session,runtime:adapter.runtime,because:'Prepare the original notice batch before launching this work turn.',prepareOnly:true}})
    if (!prepared.ok || !Array.isArray(prepared.body?.['messages'])) return await endTheStartAsCrashed('The notice batch could not be prepared: ' + refusalIn(prepared.text))
    noticeBatch = prepared.body as unknown as {messages:{messageId:string;body:string;quotes?:readonly Context[];quotePositions?:readonly number[] | null}[]}
  }

  } else {
    const recorded = await ask(settings, `/api/checks/${one.inspection.run}/tool-started`, {
      method: 'POST', body: { session, log: outputPath, model, minutes: (adapter as InspectionAdapter).minutes() },
    })
    if (!recorded.ok) {
      await ask(settings, `/api/records/${session}`, { method: 'PATCH', body: { dataPatch: { state: 'crashed', doing: refusalIn(recorded.text) } } })
      return { ok: false, because: refusalIn(recorded.text) }
    }
    inspectionToolRecorded = true
  }

  // A RUN AWAY FROM HOME IS A VISIT, REGISTERED ON THE AGENT'S BEHALF. Criterion C6.
  const trip = await theVisitThisRunNeeds(settings, one)
  // Once this write commits a process may be spawned. Recovery must not infer that a missing
  // process row means no process exists after this point.
  if (!one.inspection) {
    const launching = await ask(settings, `/api/records/${session}`, {
      method: 'PATCH', body: { dataPatch: { extra: { messageWorkerStart: 'launching', ...(startupWitness === null ? {} : { startupGroup: null }) } } },
    })
    if (!launching.ok) {
      const because = `The run's launch could not be recorded: ${refusalIn(launching.text)}`
      await ask(settings, `/api/records/${session}`, { method: 'PATCH', body: { dataPatch: { state: 'crashed', doing: because } } })
      return { ok: false, because }
    }
  }
  launchMayHaveStarted = true
  let handle: RunHandle
  try {
    const start = () => adapter.start({
      // MOLE OFFICE'S OWN ID FOR THIS RUN, which is the session record filed for it a moment ago.
      // The Kimi adapter builds its conversation id out of this; nothing else reads it.
      session,
      agent: one.handle,
      key: one.inspection ? null : runKey,
      prompt: one.inspection ? '' : promptFor({
        agent: one.handle,
        workspace: settings.workspace,
        api: settings.api,
        messageId: one.messageId,
        writtenIn: one.writtenIn ?? null,
        body: one.body + (noticeBatch === null || noticeBatch.messages.length === 0 ? '' : '\n\nOriginal notices for this work turn:\n\n' + noticeBatch.messages.filter(row=>row.messageId!==one.messageId).map(row=>'Message ' + row.messageId + '\n' + theMessageAnAgentReads(row.body, row.quotes ?? [], row.quotePositions ?? null)).join('\n\n')),
        quotes: one.quotes,
        quotePositions: one.quotePositions,
        urgent: one.urgent,
        // THE ROUTED LINE, when this delivery's recipient is one the routing chose.
        // `promptFor` passes it to the envelope's fourth line and never rebuilds it.
        routedLine: one.routedLine ?? null,
        // THE PERSON'S MARK AND OWN LABEL, with the office's reading of what each asks, as the message read gave them.
        intent: one.intent,
        label: one.label,
        whatTheMarkAsks: one.whatTheMarkAsks,
        whatTheLabelAsks: one.whatTheLabelAsks,
        markedParts: one.markedParts,
        noMarkName: one.noMarkName,
        // WHO SENT IT, as the office's queue or runs door said it (problem ynGL0myEnAbi). The office
        // reads the sender's name in its registries; this worker has none to read.
        from: typeof one.whoSentIt === 'string' ? one.whoSentIt : DELIVERY_ENVELOPE.aSenderTheOfficeDidNotName(one.sentBy),
        // AND HOW THAT SENDER ASKS TO BE ADDRESSED, as the same door said it.
        addressTheSender: typeof one.howToAddressTheSender === 'string' ? one.howToAddressTheSender : null,
        // AND THE GROUP IT WAS SENT TO, as the same door said it and as item 5 of a decision
        // says.
        fromGroup: one.fromGroup ?? null,
        carryingOn: pickUp !== null,
        howToLead: leading,
        knows,
        brief,
        rulesNotWritten,
        // The prompt names the environment variable; the adapter hands the value to envFor.
        key: runKey,
      }),
      cwd,
      api: settings.api,
      workspace: settings.workspace,
      outputPath,
      ...(one.kept === undefined ? {} : { kept: one.kept }),
      recordEffort: async effort => {
        const wrote = await ask(settings, `/api/records/${session}`, { method: 'PATCH', body: { dataPatch: { effort } } })
        if (!wrote.ok) throw new Error(`The run's effort could not be recorded: ${refusalIn(wrote.text)}`)
      },
      ...(pickUp === null ? {} : { resume: pickUp }),
      // AND THE RUN WHOSE CONVERSATION IT PICKS UP, whose output holds the total a resumed Codex thread reported before
      // this run (wave 13s round 43). A server older than this worker names none, and the receipt then says so.
      ...(pickUp === null || typeof one.resume?.run !== 'string' ? {} : { continues: { run: one.resume.run, outputPath: outputPathFor(settings, one.resume.run) } }),
      // WHICH WORLD THIS RUN BELONGS TO AND THE TRIP IT IS ON. Both absent for a run working at
      // home, which needs no visit.
      ...(trip.home === null ? {} : { home: trip.home }),
      ...(trip.visit === null ? {} : { visit: trip.visit }),
    })
    handle = await (startupWitness === null ? start() : withStartupGate(startupWitness, start))
    if (startupWitness !== null) {
      const recorded = await ask(settings, `/api/records/${session}`, { method: 'PATCH', body: { dataPatch: { extra: { startupGroup: handle.pgid } } } })
      if (!recorded.ok) throw new Error(`${sayInEnglish('startupGate.noGroup')} ${refusalIn(recorded.text)}`)
    }
  } catch (err) {
    if (startupWitness !== null) await abortStartupGates(startupWitness)
    const because = `The run could not be started: ${(err as Error).message}`
    if (one.inspection) await ask(settings, `/api/checks/${one.inspection.run}/tool-ended`, { method: 'POST', body: { session, reason: because } })
    await ask(settings, `/api/records/${session}`, { method: 'PATCH', body: { dataPatch: { state: 'crashed', doing: because } } })
    return { ok: false, because }
  }

  // REGISTERED BEFORE IT IS USED, which is GROUND's G5 and the reason a person can stop it.
  const world = worldOfTheApi()
  const held = await ask(settings, '/api/resources', {
    method: 'POST',
    body: {
      sessionRecordId: session,
      type: 'process',
      key: String(handle.pid),
      detail: `a ${adapter.runtime} run answering a message for ${one.handle}`,
      startedByTheProduct: true,
      // THE WORLD IS THE ONE THE API THIS WORKER TALKS TO REPORTS, read off its own replies. The
      // worker cannot work it out: it holds no database path. Left out when no reply has carried
      // one yet, which stores null and means nobody was told, not that there is none.
      ...(world === null ? {} : { world }),
    },
  })
  /**
   * A RUN NOTHING KNOWS ABOUT IS WORSE THAN NO RUN — unless it has already finished.
   *
   * The ledger refuses to register a pid that is not running, and a run can end before the round
   * trip that registers it does: measured on 4 September 2026, a run that answered in a few
   * milliseconds. Killing a finished run and throwing its answer away would be losing work over
   * bookkeeping, so a run that has ENDED is kept and the row says nothing on any list ever had it.
   * A run still GOING that could not be registered is stopped, because that is a process on this
   * machine no list has and no press can end. The stopped run's record is closed as "crashed" for
   * every run, not only a check, because nothing else closes the record of a process this branch
   * has stopped.
   */
  let notRegistered: string | null = null
  if (held.ok && startupWitness !== null) {
    startupRegistered = true
    releaseStartupGate(handle.pid)
    // Until this mark is stored, recovery treats the registered group as an interrupted start.
    await ask(settings, `/api/records/${session}`, { method: 'PATCH', body: { dataPatch: { extra: { messageWorkerStart: 'started' } } } })
  }
  if (!held.ok && startupWitness !== null) {
    await abortStartupGates(startupWitness)
    const because = `${sayInEnglish('startupGate.noRegistration')} ${refusalIn(held.text)}`
    await ask(settings, `/api/records/${session}`, { method: 'PATCH', body: { dataPatch: { state: 'crashed', doing: because } } })
    return { ok: false, because }
  }
  if (!held.ok) {
    if (adapter.alive(handle)) {
      adapter.stop(handle, 'it could not be written into the “Running on this machine” list')
      const because = withHowItWasEnded(`The run was started and could not be registered, so it was stopped again: ${held.text.slice(0, 300)}`, handle)
      if (one.inspection) {
        const reason = `The check could not be registered in the process ledger: ${held.text.slice(0, 300)}`
        await ask(settings, `/api/checks/${one.inspection.run}/tool-ended`, { method: 'POST', body: { session, reason } })
      }
      await ask(settings, `/api/records/${session}`, { method: 'PATCH', body: { dataPatch: { state: 'crashed', doing: because } } })
      return { ok: false, because }
    }
    notRegistered =
      'It had already finished by the time it was registered, so nothing on any list ever held it. ' +
      `The ledger said: ${held.text.slice(0, 200)}`
  }

  /**
   * THE CONVERSATION GOES ON THE RECORD AS SOON AS IT IS KNOWN, and for one tool that is now.
   *
   * The session record was filed before the run started, when the only conversation anybody knew
   * about was one being picked up. Claude Code and Kimi CLI let whoever starts them name the
   * conversation, so their adapters choose the id and put it on the handle at that moment.
   *
   * WITHOUT THIS, A WORKER RESTARTED MID-RUN LOSES AN ID IT HAD ALREADY CHOSEN. The next worker
   * rebuilds the handle from what the record says, finds nothing there, and the run's answer is
   * filed with no conversation — so the next message starts a fresh one. Codex and OpenCode mint
   * their own ids and print them near the start, and `recordTheConversationOnceItIsSaid` writes
   * theirs on the record while the run is going.
   *
   * NOTHING IS WRITTEN WHEN THE RECORD ALREADY SAYS IT, which is every resumed run.
   */
  if (handle.startedTime !== undefined || (handle.providerSession !== null && handle.providerSession !== pickUp)) {
    await ask(settings, `/api/records/${session}`, {
      method: 'PATCH',
      body: { dataPatch: {
        ...(handle.startedTime === undefined ? {} : { startedAt: handle.startedAt, startedTime: handle.startedTime }),
        ...(handle.providerSession !== null && handle.providerSession !== pickUp ? { providerSession: handle.providerSession } : {}),
      } },
    })
  }

  /**
   * AND THE RUN HOLDS THE AGENT'S HANDLE WHILE IT ANSWERS. Criterion M79.
   *
   * An agent went offline the moment it had spoken, because nothing was holding a heartbeat for it. A
   * hold is what this product already has for exactly that: a session saying it is the one
   * answering as an agent. A terminal takes one through the waiter; a run takes one here.
   *
   * IT IS TAKEN AFTER THE PROCESS IS REGISTERED, so a run that could not be registered and was
   * stopped never holds anything, and it is beaten on every pass while the run is watched.
   *
   * A REFUSED HOLD DOES NOT STOP THE RUN. The run is already going and its answer is the thing that
   * matters; what a refusal costs is a colour on a screen, and the sentence says so rather than
   * killing a process over a dot. It can only be refused by a session holding the handle, and no
   * run is started for an agent one of those is answering as.
   */
  const heldHandle = one.inspection ? { ok: false, text: 'The check uses its own run.' } : await ask(settings, `/api/handles/${encodeURIComponent(one.handle)}/hold`, {
    method: 'POST',
    /**
     * NO MACHINE IS NAMED, AND THE OFFICE FILLS IT IN.
     *
     * Asking this machine its name is asking the machine, and one interface in this product does
     * that — `OsProbe` in src/server/lib/resources.ts. The
     * office started this run on its own machine, so the office is the honest answer anyway.
     *
     * THE RUNTIME WORD IS THE AGENT'S OWN, from its registry row, and not the adapter's. A hold
     * names which runtime the session answering as this agent is, and `holdTheHandle` refuses any
     * word no adapter is declared for. Under the fake runtime — which is how every worker test
     * runs — the adapter calls itself "fake", which is not one of those words. What actually ran
     * is on the run's own session record, which says "fake" where that is what ran.
     */
    body: { session, runtime: one.runtime ?? adapter.runtime },
  })
  if (!heldHandle.ok && !one.inspection) {
    process.stderr.write(
      `${one.handle}: this run could not hold its handle, so the agent may read as offline while it answers. ` +
        `${refusalIn(heldHandle.text)}\n`,
    )
  }

  const taken =
    (pickUp === null
      ? `A ${adapter.runtime} run was started for ${one.handle} with this message.`
      : `A ${adapter.runtime} run picked up ${one.handle}'s conversation with this message.`) +
    notThatOne +
    (notRegistered === null ? '' : ` ${notRegistered}`)

  watching.push({
    ...(one.inspection ? { inspection: one.inspection } : {}),
    adapter,
    handle,
    session,
    messageId: one.messageId,
    agentId: one.to.id,
    handleName: one.handle,
    // WHETHER THIS RUN IS HOLDING THE AGENT'S HANDLE, so the pass knows whether to beat it and
    // whether there is anything to let go of at the end. Criterion M79.
    holdsTheHandle: heldHandle.ok,
    lastSaid: taken,
    ledgerRow: (held.body?.['resource'] as { id?: string } | undefined)?.id ?? null,
    visit: trip.visit,
  })

  await ask(settings, `/api/worker/messages/${one.messageId}/taken`, {
    method: 'POST',
    body: { to: one.to, session, runtime: adapter.runtime, because: taken, ...(one.wouldHaveHeld === undefined ? {} : { wouldHaveHeld: one.wouldHaveHeld }) },
  })
  return { ok: true, started: { messageId: one.messageId, agent: one.handle, runtime: adapter.runtime, session } }
  } catch (error) {
    // After the launching marker a child may exist even when no ledger row can be read. Leave that
    // ambiguous case live; closing it could let a starter change pass a still-running child.
    if (launchMayHaveStarted) {
      if (startupWitness !== null) await abortStartupGates(startupWitness)
      throw error
    }
    const because = `The run could not be prepared: ${(error as Error).message}`
    if (probeMayHaveStarted) {
      // Recovery checks the recorded group before closing an authorized probe.
      return { ok: false, because }
    }
    try {
      if (one.inspection && inspectionToolRecorded) {
        await ask(settings, `/api/checks/${one.inspection.run}/tool-ended`, { method: 'POST', body: { session, reason: because } })
      }
      const closed = await ask(settings, `/api/records/${session}`, { method: 'PATCH', body: { dataPatch: { state: 'crashed', doing: because } } })
      if (!closed.ok) process.stderr.write(`Run ${session} could not be closed after its start failed: ${refusalIn(closed.text)}\n`)
    } catch (closeError) {
      process.stderr.write(`Run ${session} could not be closed after its start failed: ${(closeError as Error).message}\n`)
    }
    return { ok: false, because }
  } finally {
    if (startupWitness !== null) forgetStartupWitness(startupWitness, (!launchMayHaveStarted && !probeMayHaveStarted) || startupRegistered)
  }
}

let gateRunOutRefusal: string | null = null

/** A refusal is said once while it stays the same, and never stops the rest of the pass. */
async function runOutTheGateChoices(settings: WorkerSettings): Promise<void> {
  const read = await ask(settings, '/api/worker/gates/run-out', {method: 'POST', body: {}})
  if (read.ok) { gateRunOutRefusal = null; return }
  const sentence = `Ended gate choices could not be removed this pass: ${refusalIn(read.text)}`
  if (gateRunOutRefusal === sentence) return
  gateRunOutRefusal = sentence
  process.stderr.write(`${sentence}\n`)
}

// ============================================================================ the merge tool

/**
 * WHAT THIS WORKER HAS ALREADY PRINTED ABOUT THE MERGE TOOL, so a sentence that stays true is printed
 * once and not once a pass — the lesson of problem 9UeL9VeVPn33, which `heldSentencesSaid` records.
 */
const mergeSentencesSaid = new Map<string, string>()

function sayOnceAboutMerges(key: string, sentence: string): void {
  if (mergeSentencesSaid.get(key) === sentence) return
  mergeSentencesSaid.set(key, sentence)
  process.stderr.write(`${sentence}\n`)
}

/**
 * THE MERGE TOOL'S PART OF ONE PASS. Sandbox v1, piece P9, SPEC.md 5.3.
 *
 * The server says what it wants (GET /api/worker/merges) and this does it, in five steps:
 *
 *   0. A resolving entry whose own supervisor's time to resolve is over has the office asked to bounce it
 *      (POST /api/worker/merges/<entry>/hour-over; see XHY2fVFG3Qq8, answer 2), once per entry the list
 *      answered under `hourOver`; an entry whose time to resolve cannot be read is said in the log and left alone.
 *   1. An entry-ended run with a gone process is closed from its log and exit-code file. A live run
 *      a worker before this one started is picked up, and a start whose worker ended before registering
 *      its process is closed with that sentence, since there is nothing to watch or to signal.
 *   2. A run whose entry was withdrawn or superseded is stopped by its process group.
 *   3. A run that has ended is closed: the entry records how it ended, the run's own record says
 *      finished or crashed, and its ledger row is released. A run step 2 stopped has its open
 *      containers released first, while its record still says running.
 *   4. An entry the office marked is started, in the merge slot, when the slot is free. While it is busy, a submitted
 *      entry is started in the pin slot with `--pin-only`, which pins it and stops.
 *
 * IT DECIDES NOTHING ABOUT THE ENTRY. Which entries want the tool, which runs to stop and what follows
 * a run's ending are the server's; this starts, watches, stops and says what happened. The end of the time
 * to resolve is the server's to judge too: this asks the door for each entry the server listed, and the server reads its
 * own record again before it writes.
 */
/** A take-back runs the handed-back files alone on main; allow the suite's bound for these sequential runs. */
export const TAKE_BACK_LIMIT_MS = 3 * 60 * 60 * 1_000
interface WatchedTakeBack {
  problem: string
  child: ReturnType<typeof startInItsOwnGroup>
  outputPath: string
  started: number
  /** Ends the check's group, and answers the sentence of an end at once, or null (`endGroupWithinASecond`). */
  stop: () => Promise<string | null>
  finish: (ending: { ok: boolean; says: string }) => Promise<{ ok: boolean; says: string }>
}
// Like merge runs, these survive passes of this worker process; a restart does not pick them up.
const watchedTakeBacks = new Map<string, WatchedTakeBack>()
const takeBackKey = (settings: WorkerSettings, problem: string) => JSON.stringify([settings.api, settings.workspace, settings.checkout, problem])

async function runATakeBack(settings: WorkerSettings, problem: string): Promise<{ ok: boolean; says: string; started?: true }> {
  const adapter = new MergeAdapter(problem, settings.env), why = adapter.whyItCannotStart(settings.checkout)
  if (why !== null) return { ok: false, says: why }
  const filed = await ask(settings, '/api/records', { method: 'POST', body: {
    kind: 'session', title: `The office checking the files on main before taking back hand-back ${problem}`,
    data: { state: 'running', runtime: adapter.runtime, startedByMoleOffice: true, workingDirectory: settings.checkout,
      doing: `Running the handed-back files by name on main before deciding whether to take back hand-back ${problem}.`,
      extra: { purpose: 'take-back-check', problem }, ...(settings.session === null ? {} : { parentAttachment: settings.session }) },
  } })
  const session = (filed.body?.['record'] as { id?: string } | undefined)?.id
  if (!filed.ok || session === undefined) return { ok: false, says: `A session for the take-back main check could not be filed: ${refusalIn(filed.text)}` }
  const outputPath = outputPathFor(settings, session)
  mkdirSync(join(settings.outputRoot, session), { recursive: true })
  let ledgerRow: string | null = null
  const finish = async (ending: { ok: boolean; says: string }) => {
    const closed = await ask(settings, `/api/records/${session}`, { method: 'PATCH', body: { dataPatch: {
      state: ending.ok ? 'finished' : 'crashed', doing: ending.says, ...outputTiming(outputPath), usageReceipt: { ...A_MERGE_TOOL_RUNS_RECEIPT, ranIn: whereItRan(process.env) },
    } } })
    if (ledgerRow !== null) await ask(settings, `/api/resources/${ledgerRow}/release`, { method: 'POST', body: { note: ending.says.slice(0, 500) } })
    return closed.ok ? ending : { ok: false, says: `${ending.says} The check session's ending could not be stored: ${refusalIn(closed.text)}` }
  }
  const env = envFor({ cwd: settings.checkout, api: settings.api, workspace: settings.workspace, outputPath }, settings.env, undefined, MERGE_TOOL_RUNTIME)
  let child: ReturnType<typeof startInItsOwnGroup>
  try { child = startInItsOwnGroup({ command: adapter.command, args: [adapter.script(settings.checkout), '--take-back', problem, '--session', session, '--api', settings.api, '--workspace', settings.workspace], cwd: settings.checkout, env, outputPath }) }
  catch (error) { return finish({ ok: false, says: `The take-back main check could not start: ${String(error)}` }) }
  const stop = () => endGroupWithinASecond(child)
  const held = await ask(settings, '/api/resources', { method: 'POST', body: { sessionRecordId: session, type: 'process', key: String(child.pid), startedByTheProduct: true, detail: `the main check for hand-back ${problem}` } })
  if (!held.ok) {
    const atOnce = stillRunning(child.pid) ? await stop() : null
    return finish({ ok: false, says: `The take-back main check could not be registered and was stopped: ${refusalIn(held.text)}${atOnce === null ? '' : ` ${atOnce}`}` })
  }
  ledgerRow = (held.body?.['resource'] as { id?: string } | undefined)?.id ?? null
  const started = Date.now()
  watchedTakeBacks.set(takeBackKey(settings, problem), { problem, child, outputPath, started, stop, finish })
  return { ok: true, started: true, says: `The take-back main check started as run ${session}.` }
}

async function tendTheMergeTool(settings: WorkerSettings, merges: WatchingAMerge[]): Promise<PassReport['merges']> {
  const out = noMergeWork()
  const read = await ask(settings, '/api/worker/merges')
  if (!read.ok) {
    if (read.status === 503 && read.body?.['code'] === MERGE_QUEUE_SNAPSHOT_CHANGING) return out
    // NOTHING IS STARTED, STOPPED OR CLOSED ON A LIST THAT COULD NOT BE READ. The runs keep going in their
    // own groups and the next pass asks again.
    sayOnceAboutMerges('the list', `The merge tool's work could not be read, so nothing about it was done this pass: ${refusalIn(read.text)}`)
    return out
  }
  mergeSentencesSaid.delete('the list')
  const wanted = (read.body?.['wanted'] ?? []) as AMergeToStart[]
  const going = (read.body?.['going'] ?? []) as AMergeToolRun[]
  const hourOver = (read.body?.['hourOver'] ?? []) as { entry: string }[]
  const hourCannotBeRead = (read.body?.['hourCannotBeRead'] ?? []) as { entry: string; says: string }[]

  // 0. THE RESOLVING ENTRIES WHOSE TIME TO RESOLVE IS OVER, bounced by the office through its door. A refusal writes nothing,
  // so the entry stays where it is and the next pass asks again; it is said once, and the pass goes on.
  for (const one of hourOver) {
    const bounced = await ask(settings, `/api/worker/merges/${encodeURIComponent(one.entry)}/hour-over`, { method: 'POST', body: {} })
    if (bounced.ok) {
      out.bounced.push({ entry: one.entry, because: String(bounced.body?.['says'] ?? '') })
      continue
    }
    sayOnceAboutMerges(one.entry, `Merge entry ${one.entry} could not be bounced although its time to resolve was over when the list was read: ${refusalIn(bounced.text)}`)
  }
  // AN ENTRY WHOSE TIME TO RESOLVE CANNOT BE READ IS NAMED, NOT BOUNCED. The office's own guard writes those fields before an
  // entry can be resolving, so this is the office's record being broken, and a person has to look.
  for (const one of hourCannotBeRead) sayOnceAboutMerges(`${one.entry} hour`, one.says)

  // 0a. THE HAND-BACKS WHOSE DEADLINES PASSED, read by the office. Person-needed notes go through its door;
  // unreadable facts are said once; due problems run one at a time, with a bounded process group of their own.
  for (const one of (read.body?.['takeBacksForAPerson'] ?? []) as { problem: string; says: string }[]) {
    const noted = await ask(settings, `/api/worker/merges/hand-backs/${encodeURIComponent(one.problem)}/a-person-must-look`, { method: 'POST', body: {} })
    if (!noted.ok) sayOnceAboutMerges(`${one.problem} person`, `The office refused the person-must-look note for ${one.problem}: ${refusalIn(noted.text)}`)
  }
  for (const one of (read.body?.['takeBacksCannotBeRead'] ?? []) as { problem: string; says: string }[]) sayOnceAboutMerges(`${one.problem} unreadable`, one.says)
  const endedTakeBacks = new Set<string>()
  for (const [key, run] of watchedTakeBacks) {
    if (key !== takeBackKey(settings, run.problem)) continue
    const running = stillRunning(run.child.pid) && !existsSync(run.child.exitCodePath)
    const expired = running && Date.now() - run.started >= TAKE_BACK_LIMIT_MS
    if (running && !expired) continue
    let ending: { ok: boolean; says: string }
    if (expired) {
      const atOnce = await run.stop()
      ending = { ok: false, says: `Take-back ${run.problem} exceeded its ${TAKE_BACK_LIMIT_MS / 1_000} second bound; process group ${run.child.pgid} was ended.${atOnce === null ? '' : ` ${atOnce}`} Log: ${run.outputPath}.` }
    } else {
      let exit = '', says = ''
      try { exit = readFileSync(run.child.exitCodePath, 'utf8').trim(); says = readFileSync(run.outputPath, 'utf8').trim() } catch { /* Missing evidence cannot be success. */ }
      ending = { ok: exit === '0', says: says || `Take-back ${run.problem} ended with ${exit || 'no recorded exit code'}. Log: ${run.outputPath}.` }
    }
    const result = await run.finish(ending)
    watchedTakeBacks.delete(key); endedTakeBacks.add(run.problem)
    if (result.ok) out.takenBack!.push({ problem: run.problem, says: result.says })
    else { out.takeBackFailed!.push({ problem: run.problem, says: result.says }); sayOnceAboutMerges(`${run.problem} take-back`, result.says) }
  }
  for (const one of (read.body?.['takeBacksDue'] ?? []) as { problem: string }[]) {
    if (endedTakeBacks.has(one.problem)) continue
    if ([...watchedTakeBacks].some(([key, run]) => key === takeBackKey(settings, run.problem))) break
    let result: { ok: boolean; says: string; started?: true }
    try { result = await runATakeBack(settings, one.problem) } catch (error) { result = { ok: false, says: `Take-back ${one.problem} could not run: ${String(error)}` } }
    if (!result.started) { out.takeBackFailed!.push({ problem: one.problem, says: result.says }); sayOnceAboutMerges(`${one.problem} take-back`, result.says) }
  }

  // 1. ENTRY-ENDED RUNS, RUNS THIS WORKER DID NOT START, AND STARTS THAT NEVER REACHED THE LEDGER.
  for (const one of going) {
    if (merges.some((run) => run.session === one.session)) continue
    if (typeof one.endedOnTheEntry === 'string') {
      const adapter = new MergeAdapter(one.entry, settings.env)
      const handle: RunHandle = {
        runtime: MERGE_TOOL_RUNTIME,
        pid: one.pid ?? 0,
        pgid: one.pgid ?? 0,
        startedAt: one.startedAt,
        providerSession: null,
        outputPath: one.log,
        exitCodePath: `${one.log}.exit-code`,
      }
      // THE TOOL WROTE ITS ENDING TO THE ENTRY BEFORE THIS ROW CLOSED. If its process is gone, read
      // the surviving log and exit-code file now. A missing process identity is not a failed start:
      // this tool got far enough to record its ending on the entry.
      if (one.pid === null || !adapter.alive(handle)) {
        const ending = adapter.readEnding(handle)
        const because = await closeAMergeToolRun(
          settings,
          { entry: one.entry, session: one.session, handle, ledgerRow: one.resource },
          ending,
        )
        if (because !== null) out.ended.push({ entry: one.entry, session: one.session, because })
        continue
      }
    }
    if (one.startupFailed !== null) {
      const because = await closeAMergeToolRun(settings, { entry: one.entry, session: one.session, handle: null, ledgerRow: null }, { ok: false, says: one.startupFailed })
      if (because !== null) out.ended.push({ entry: one.entry, session: one.session, because })
      continue
    }
    // A RUN WITH NO PROCESS GROUP WRITTEN DOWN IS NOT PICKED UP, for the reason `pickUpRunsAlreadyGoing`
    // gives: taking the pid for the group would be a guess at what to signal.
    if (one.pid === null || one.pgid === null) {
      sayOnceAboutMerges(
        one.session,
        `Merge tool run ${one.session} for merge entry ${one.entry} has no process group written down, so it was not picked up: there would be nothing safe to signal.`,
      )
      continue
    }
    merges.push({
      entry: one.entry,
      adapter: new MergeAdapter(one.entry, settings.env),
      // THE LOG IS THE ONE THE ENTRY RECORDS, which is the file the run has been writing all along.
      handle: { runtime: MERGE_TOOL_RUNTIME, pid: one.pid, pgid: one.pgid, startedAt: one.startedAt, providerSession: null, outputPath: one.log, exitCodePath: `${one.log}.exit-code` },
      session: one.session,
      ledgerRow: one.resource,
    })
    out.pickedUp.push(one.session)
  }

  // 2. RUNS THE OFFICE WANTS STOPPED, by their group, once each.
  for (const one of going) {
    if (one.stop === null) continue
    const run = merges.find((watched) => watched.session === one.session)
    if (run === undefined || run.stoppedBecause !== undefined) continue
    run.stoppedBecause = one.stop
    if (run.adapter.alive(run.handle)) run.adapter.stop(run.handle)
    out.stopped.push({ entry: one.entry, session: one.session, because: one.stop })
  }

  // 3. RUNS THAT HAVE ENDED. The output is read once; closing is tried again on the next pass if the
  // server could not take it.
  for (const run of [...merges]) {
    if (run.adapter.alive(run.handle)) continue
    run.ended ??= run.adapter.readEnding(run.handle)
    let ending = run.stoppedBecause === undefined ? run.ended : { ok: false, says: withHowItWasEnded(run.stoppedBecause, run.handle) }
    // A RUN THE OFFICE STOPPED HAS ITS CONTAINERS RELEASED FIRST, while its record still says running
    // (releaseTheContainersOfAStoppedRun). A container that could not be released is said in its ending.
    if (run.stoppedBecause !== undefined) {
      const notReleased = await releaseTheContainersOfAStoppedRun(settings, run, run.stoppedBecause)
      if (notReleased !== null) ending = { ok: false, says: `${ending.says} ${notReleased}` }
    }
    const because = await closeAMergeToolRun(settings, run, ending)
    if (because === null) continue
    merges.splice(merges.indexOf(run), 1)
    out.ended.push({ entry: run.entry, session: run.session, because })
  }

  // 4. ENTRIES THE OFFICE WANTS THE TOOL FOR, oldest first, while the merge slot is free. While it is busy, a submitted
  // entry is pinned in the pin slot, and never the entry a run already holds. A resolving entry is wanted only for the
  // check of its resolution, which always runs in the pin slot.
  for (const want of wanted) {
    if (merges.some((run) => run.entry === want.entry)) continue
    const merging = merges.filter((run) => run.pinOnly !== true && run.checkResolution !== true)
    const beside = merges.filter((run) => run.pinOnly === true || run.checkResolution === true)
    const checkResolution = want.state === 'resolving'
    const pinOnly = !checkResolution && merging.length >= MERGE_TOOL_SLOTS
    if (checkResolution && beside.length >= MERGE_PIN_SLOTS) {
      const busy = beside.map((run) => `run ${run.session} for merge entry ${run.entry}`).join(', ')
      out.held.push({
        entry: want.entry,
        because: `The office checks a resolution beside the merge slot, ${String(MERGE_PIN_SLOTS)} run at a time, and ${busy} is going there. This entry is started when it ends.`,
      })
      continue
    }
    if (pinOnly && (want.state !== 'submitted' || beside.length >= MERGE_PIN_SLOTS)) {
      const busy = merging.map((run) => `run ${run.session} for merge entry ${run.entry}`).join(', ')
      out.held.push({
        entry: want.entry,
        because: `The office runs ${String(MERGE_TOOL_SLOTS)} merge tool at a time, and ${busy} is going. This entry is started when it ends.`,
      })
      continue
    }
    const started = await startTheMergeTool(settings, want, merges, pinOnly ? 'pin-only' : checkResolution ? 'check-resolution' : 'merge')
    if (started.ok) {
      mergeSentencesSaid.delete(want.entry)
      out.started.push({ entry: want.entry, session: started.session })
      continue
    }
    sayOnceAboutMerges(want.entry, started.because)
    out.held.push({ entry: want.entry, because: started.because })
  }
  return out
}

/**
 * START THE MERGE TOOL FOR ONE ENTRY: file its session, have the entry record the start, start it in its
 * own group, and register it in the ledger before anything else happens to it.
 *
 * THE ENTRY RECORDS THE START BEFORE THE PROCESS EXISTS, as the check tool's does, so the tool finds
 * itself named as the entry's run when it first asks, and a second start for the same entry is refused
 * by the entry itself. The cost is a start whose worker dies before registering its process, which the
 * server reads as `startupFailed` once that worker is known gone, and the next worker closes.
 */
async function startTheMergeTool(
  settings: WorkerSettings,
  want: AMergeToStart,
  merges: WatchingAMerge[],
  kind: 'merge' | 'pin-only' | 'check-resolution' = 'merge',
): Promise<{ ok: true; session: string } | { ok: false; because: string }> {
  const pinOnly = kind === 'pin-only'
  const checkResolution = kind === 'check-resolution'
  const adapter = new MergeAdapter(want.entry, settings.env)
  const cwd = settings.checkout
  const cannot = adapter.whyItCannotStart(cwd)
  if (cannot !== null) return { ok: false, because: cannot }
  const ran = theProgramThatRan(adapter.command, settings.env['PATH'])
  const fake = adapter.fakeScript()
  const filed = await ask(settings, '/api/records', {
    method: 'POST',
    body: {
      kind: 'session',
      title: pinOnly
        ? `The office pinning merge entry ${want.entry} with its merge tool`
        : checkResolution
          ? `The office checking the resolution of merge entry ${want.entry} with its merge tool`
          : `The office running its merge tool for merge entry ${want.entry}`,
      data: {
        state: 'running',
        runtime: adapter.runtime,
        doing: pinOnly
          ? `pinning merge entry ${want.entry}, which is ${stateWord(want.state).text}, while the merge slot is busy; this run takes no lane and no sandbox`
          : checkResolution
            ? `checking the resolution its supervisor handed over for merge entry ${want.entry}, which is ${stateWord(want.state).text}; this run takes no lane and no sandbox`
            : `running the merge tool for merge entry ${want.entry}, which is ${stateWord(want.state).text}`,
        workingDirectory: cwd,
        startedByMoleOffice: true,
        // NO `servingAgent`: this run serves no agent, so it is never sealed or sent to the check when it finishes.
        extra: { purpose: 'merge', mergeEntry: want.entry, ...(pinOnly ? { pinOnly: true } : {}), ...(checkResolution ? { checkResolution: true } : {}), ...(fake === null ? {} : { fakeMergeTool: fake }) },
        ...(ran.path === null ? {} : { ranProgram: ran.path }),
        ranProgramVersion: ran.version,
        // WHICH RUN STARTED THIS ONE: this worker's own, for the reason `startOne` gives, and because it is
        // what tells a later worker whether this start's worker is gone (`theWorkerThatStartedItIsGone`).
        ...(settings.session === null ? {} : { parentAttachment: settings.session }),
      },
    },
  })
  const session = (filed.body?.['record'] as { id?: string } | undefined)?.id ?? null
  if (session === null) {
    return { ok: false, because: `A session record for the merge tool run for merge entry ${want.entry} could not be filed: ${refusalIn(filed.text)}` }
  }
  const outputPath = outputPathFor(settings, session)
  mkdirSync(join(settings.outputRoot, session), { recursive: true })
  const recorded = await ask(settings, `/api/merge-queue/${encodeURIComponent(want.entry)}/tool-started`, {
    method: 'POST',
    body: { session, log: outputPath },
  })
  if (!recorded.ok) {
    const because = `Merge entry ${want.entry} did not take merge tool run ${session}, so the tool was not started: ${refusalIn(recorded.text)}`
    await ask(settings, `/api/records/${session}`, { method: 'PATCH', body: { dataPatch: { state: 'crashed', doing: because } } })
    return { ok: false, because }
  }
  let handle: RunHandle
  try {
    handle = adapter.start({ session, cwd, api: settings.api, workspace: settings.workspace, outputPath, ...(pinOnly ? { pinOnly: true as const } : {}), ...(checkResolution ? { checkResolution: true as const } : {}) })
  } catch (err) {
    const says = `The merge tool could not be started: ${(err as Error).message}`
    await closeAMergeToolRun(settings, { entry: want.entry, session, handle: null, ledgerRow: null }, { ok: false, says })
    return { ok: false, because: says }
  }
  // REGISTERED BEFORE IT IS USED, which is what lets a person stop it by its group from the product.
  const world = worldOfTheApi()
  const held = await ask(settings, '/api/resources', {
    method: 'POST',
    body: {
      sessionRecordId: session,
      type: 'process',
      key: String(handle.pid),
      detail: `the office's merge tool for merge entry ${want.entry}`,
      startedByTheProduct: true,
      ...(world === null ? {} : { world }),
    },
  })
  if (!held.ok && adapter.alive(handle)) {
    // A PROCESS NO LIST HOLDS IS STOPPED, for the reason `startOne` gives.
    adapter.stop(handle)
    const says = withHowItWasEnded(`The merge tool run was started and could not be registered, so it was stopped again: ${held.text.slice(0, 300)}`, handle)
    await closeAMergeToolRun(settings, { entry: want.entry, session, handle, ledgerRow: null }, { ok: false, says })
    return { ok: false, because: says }
  }
  if (!held.ok) {
    // IT HAD ALREADY ENDED, and it is kept so its ending is read and recorded like any other.
    process.stdout.write(
      `Merge tool run ${session} for merge entry ${want.entry} had already ended when it was registered, so no list held it. ` +
        `The ledger said: ${held.text.slice(0, 200)}\n`,
    )
  }
  merges.push({
    entry: want.entry,
    adapter,
    handle,
    session,
    ledgerRow: held.ok ? ((held.body?.['resource'] as { id?: string } | undefined)?.id ?? null) : null,
    ...(pinOnly ? { pinOnly: true as const } : {}),
    ...(checkResolution ? { checkResolution: true as const } : {}),
  })
  process.stdout.write(`The merge tool started for merge entry ${want.entry} as run ${session}${pinOnly ? ', to pin it only' : checkResolution ? ', to check its resolution' : ''}.\n`)
  return { ok: true, session }
}

/**
 * THE CONTAINERS OF A MERGE TOOL RUN THE OFFICE STOPPED, released while the run's record still says running. The
 * decision rsa_P_w4e0Vm, wave 13u round 185. The tool's cleanup brings the entry's sandbox down from a process group of
 * its own, after the tool's group has ended. Once the run is recorded as ended, the ledger lets only the agent the run
 * answers as, its starter, a secretary or the person stop its container. A merge tool run
 * answers as no agent, so the cleanup was refused, and two withdrawn entries' containers stayed up for 20 hours and for
 * two days.
 *
 * So each open container row of the run is released here with force, before the run is closed. The door asks for its
 * sentence back for a container it can describe, and is sent it. tools/sandbox-common.mjs reads the same sentence for
 * the launcher (releaseThroughTheLedger), and tests/a-stopped-merge-tools-containers-are-released-before-it-ends.test.ts
 * goes red here if the door's words change. A 409 says the row or the container changed since it was read, so it is
 * closed or gone already, and it is not a failure here, as in closeAMergeToolRun. Answers what could not be released,
 * in a sentence, or null when no container row of the run is left open.
 */
async function releaseTheContainersOfAStoppedRun(settings: WorkerSettings, run: { entry: string; session: string }, stoppedBecause: string): Promise<string | null> {
  const read = await ask(settings, `/api/resources?sessionRecordId=${encodeURIComponent(run.session)}`)
  if (!read.ok) {
    const says = `Its open containers could not be read, so none was released: ${refusalIn(read.text)}`
    sayOnceAboutMerges(`${run.session} containers`, `Merge tool run ${run.session}: ${says}`)
    return says
  }
  const open = ((read.body?.['resources'] ?? []) as { id: string; type: string; key: string }[]).filter((row) => row.type === 'container')
  const notReleased: string[] = []
  for (const row of open) {
    const path = `/api/resources/${encodeURIComponent(row.id)}/release`
    const body = { force: true, note: `The office stopped merge tool run ${run.session} for merge entry ${run.entry}: ${stoppedBecause}`.slice(0, 500) }
    let letGo = await ask(settings, path, { method: 'POST', body })
    const sentence = letGo.status === 400 ? /Send the sentence back as \{"expect": "\.\.\."\}: "([\s\S]+)"$/.exec(String(letGo.body?.['error'] ?? '')) : null
    if (sentence !== null) letGo = await ask(settings, path, { method: 'POST', body: { ...body, expect: sentence[1] } })
    if (!letGo.ok && letGo.status !== 409) notReleased.push(`container ${row.key} (ledger row ${row.id}): ${refusalIn(letGo.text)}`)
  }
  if (notReleased.length === 0) return null
  const says = `Its containers were not all released: ${notReleased.join('; ').replace(/\.?$/u, '.')}`
  sayOnceAboutMerges(`${run.session} containers`, `Merge tool run ${run.session}: ${says}`)
  return says
}

/**
 * CLOSE ONE MERGE TOOL RUN: the entry records how it ended, the run's own record says finished or
 * crashed, and its ledger row is released. Answers what the entry now says about the ending, or null
 * because the server could not take it and it is to be tried again.
 *
 * THE ENTRY'S WORDS AND THE DISK READING MUST AGREE. A missing exit code with an entry that says it
 * merged is treated as finished; otherwise a disagreement is recorded in the doing line and the run
 * is crashed.
 */
async function closeAMergeToolRun(
  settings: WorkerSettings,
  run: { entry: string; session: string; handle: RunHandle | null; ledgerRow: string | null },
  ending: MergeToolEnding,
): Promise<string | null> {
  const told = await ask(settings, `/api/merge-queue/${encodeURIComponent(run.entry)}/tool-ended`, {
    method: 'POST',
    body: { session: run.session, reason: ending.says },
  })
  // A REFUSAL IN THE 400s IS AN ANSWER: this run is not the entry's to end any more, or the entry is gone.
  // The run is still closed, and the refusal is said. Anything else is tried again next pass.
  if (!told.ok && (told.status < 400 || told.status >= 500)) {
    sayOnceAboutMerges(`${run.session} ending`, `The ending of merge tool run ${run.session} could not be recorded on merge entry ${run.entry}, and will be tried again: ${refusalIn(told.text)}`)
    return null
  }
  const answered = told.body?.['entry'] as { state?: unknown; tool?: { session?: unknown; reason?: unknown } } | undefined
  const recorded = answered?.tool
  const entrySays = told.ok && recorded?.session === run.session && typeof recorded.reason === 'string' ? recorded.reason : null
  // WHETHER THE ENTRY IS MERGED IS READ FROM ITS STATE, not from its words (check 5PDAmYI1pxq_): the words the tool writes
  // can change, and a pattern over them missed the real sentence.
  const entrySaysMerged = told.ok && answered?.state === 'merged'
  // THE WORDS FOR A MERGED ENTRY: its own, when it recorded this run's ending, and otherwise a plain sentence of its state.
  const mergedWords = entrySays ?? 'The entry is merged.'
  const noExitCode = !ending.ok && ending.says.startsWith('The merge tool ended without a recorded exit code.')
  const finishedDespiteMissingExitCode = noExitCode && entrySaysMerged
  const agreesWithEntry = entrySays === null || entrySays === ending.says
  // A ROW NEVER SAYS CRASHED AND MERGED AT ONCE (problem h4TKLwqtAGpt). An entry that says it is merged is the work this
  // run exists for, so the run reads finished whatever its process did after; an exit code it left is still said.
  const finished = entrySaysMerged || (ending.ok && agreesWithEntry)
  const because = finishedDespiteMissingExitCode
    ? mergedWords
    : entrySaysMerged && !(ending.ok && agreesWithEntry)
      ? `${mergedWords.replace(/\.$/u, '')}. After that, its process ended this way: ${ending.says}`
      : agreesWithEntry
        ? ending.says
        : `${ending.says} The entry says: ${entrySays}`
  if (!told.ok) {
    process.stderr.write(`Merge entry ${run.entry} did not take the ending of merge tool run ${run.session}: ${refusalIn(told.text)}\n`)
  }
  const patched = await ask(settings, `/api/records/${run.session}`, {
    method: 'PATCH',
    body: {
      dataPatch: {
        state: finished ? 'finished' : 'crashed',
        doing: because,
        ...(run.handle === null ? {} : outputTiming(run.handle.outputPath)),
        // THE RECEIPT SAYS IN WORDS THAT THERE ARE NO TOKENS, because the tool runs no model.
        usageReceipt: { ...A_MERGE_TOOL_RUNS_RECEIPT, ranIn: whereItRan(process.env) },
      },
    },
  })
  if (!patched.ok) {
    process.stderr.write(`The ending of merge tool run ${run.session} was not stored on its own record: ${refusalIn(patched.text)}\n`)
  }
  if (run.ledgerRow !== null) {
    const letGo = await ask(settings, `/api/resources/${run.ledgerRow}/release`, { method: 'POST', body: { note: because.slice(0, 500) } })
    // 409 IS NOT A FAILURE: a person who stopped the run from the product released its row with the press.
    if (!letGo.ok && letGo.status !== 409) {
      process.stderr.write(`The ledger row ${run.ledgerRow} of merge tool run ${run.session} could not be released: ${refusalIn(letGo.text)}\n`)
    }
  }
  mergeSentencesSaid.delete(`${run.session} ending`)
  process.stdout.write(`Merge tool run ${run.session} for merge entry ${run.entry} ended: ${because}\n`)
  return because
}

// ============================================================================ next rounds

/** The sentences already said about next rounds, so a held ask is said once and not every pass. */
const roundSentencesSaid = new Map<string, string>()

function sayOnceAboutRounds(key: string, sentence: string): void {
  if (roundSentencesSaid.get(key) === sentence) return
  roundSentencesSaid.set(key, sentence)
  process.stderr.write(`${sentence}\n`)
}

/**
 * THE NEXT ROUNDS' PART OF A PASS (wave 13j round loop-2). First the launchers that have ended are closed; then each
 * round the office lists is started, one launcher run each. src/server/lib/next-round.ts says what the office checks
 * at each step; this is the worker's half, which files its launcher run, asks the starting door, starts the launcher
 * in its own group, registers it, and says how it ended.
 */
async function tendTheRounds(settings: WorkerSettings, rounds: WatchingARound[]): Promise<NonNullable<PassReport['rounds']>> {
  const out: NonNullable<PassReport['rounds']> = { started: [], ended: [], held: [] }
  for (const round of [...rounds]) {
    if (round.worker !== undefined || round.adapter.alive(round.handle)) continue
    round.ended ??= round.adapter.readEnding(round.handle)
    const because = await closeALauncherRun(theSettingsInAProject(settings, round.workspace), round, round.ended)
    if (because === null) continue
    rounds.splice(rounds.indexOf(round), 1)
    out.ended.push({ run: round.run, wrapper: round.wrapper, because })
  }
  const read = await ask(settings, '/api/worker/rounds')
  if (!read.ok) {
    sayOnceAboutRounds('the list', `The next rounds could not be read, so none was started this pass: ${refusalIn(read.text)}`)
    return out
  }
  roundSentencesSaid.delete('the list')
  for (const want of (read.body?.['rounds'] ?? []) as ARoundToStart[]) {
    if (rounds.some((round) => round.worker === undefined && round.run === want.run)) continue
    const projectSettings = theSettingsInAProject(settings, want.workspaceId)
    const started = await startARound(projectSettings, want, rounds)
    if (started.ok) {
      roundSentencesSaid.delete(want.run)
      out.started.push({ run: want.run, wrapper: started.wrapper })
      continue
    }
    const cutNotice = ' The reason was cut; the whole reason is in the worker log.'
    const because = started.because.length <= 2000 ? started.because : started.because.slice(0, 2000 - cutNotice.length) + cutNotice
    if (because !== started.because) process.stderr.write(`${started.because}\n`)
    else sayOnceAboutRounds(want.run, started.because)
    const recorded = await ask(projectSettings, `/api/worker/rounds/${encodeURIComponent(want.run)}/held`, {
      method: 'POST', body: { because },
    })
    if (!recorded.ok) sayOnceAboutRounds(`${want.run} held`, `The reason the round was held could not be recorded: ${refusalIn(recorded.text)}`)
    else roundSentencesSaid.delete(`${want.run} held`)
    out.held.push({ run: want.run, because: started.because })
  }
  return out
}

/**
 * THE WORKER RUNS' PART OF A PASS (wave 13j round loop-3), built like `tendTheRounds`: the worker launchers that have
 * ended are closed, then each worker run the office lists is started, one launcher run each. src/server/lib/worker-runs.ts
 * says what the office checks at each step.
 */
async function tendTheWorkerRuns(settings: WorkerSettings, rounds: WatchingARound[]): Promise<NonNullable<PassReport['workers']>> {
  const out: NonNullable<PassReport['workers']> = { started: [], ended: [], held: [] }
  for (const round of [...rounds]) {
    if (round.worker === undefined || round.adapter.alive(round.handle)) continue
    round.ended ??= round.adapter.readEnding(round.handle)
    const because = await closeALauncherRun(theSettingsInAProject(settings, round.workspace), round, round.ended)
    if (because === null) continue
    rounds.splice(rounds.indexOf(round), 1)
    out.ended.push({ run: round.run, agentId: round.worker, wrapper: round.wrapper, because })
  }
  const read = await ask(settings, '/api/worker/worker-runs')
  if (!read.ok) {
    sayOnceAboutRounds('the worker runs', `The worker runs could not be read, so none was started this pass: ${refusalIn(read.text)}`)
    return out
  }
  roundSentencesSaid.delete('the worker runs')
  for (const want of (read.body?.['workerRuns'] ?? []) as AWorkerRunToStart[]) {
    if (rounds.some((round) => round.worker === want.agentId)) continue
    const of = `the worker run of ${want.handle} under run ${want.run}`
    const started = await startALauncher(theSettingsInAProject(settings, want.workspaceId), rounds, {
      run: want.run,
      worker: want.agentId,
      what: of,
      of,
      title: `The office starting ${of}`,
      extra: { purpose: A_WORKER_LAUNCHER_PURPOSE, run: want.run, worker: want.agentId },
      starting: { path: `/api/worker/worker-runs/${encodeURIComponent(want.run)}/starting`, body: { agent: want.agentId } },
    })
    const key = `${want.run} ${want.agentId}`
    if (started.ok) {
      roundSentencesSaid.delete(key)
      out.started.push({ run: want.run, agentId: want.agentId, wrapper: started.wrapper })
      continue
    }
    sayOnceAboutRounds(key, started.because)
    out.held.push({ run: want.run, agentId: want.agentId, because: started.because })
  }
  return out
}

/**
 * THE SETTINGS FOR A WORKER RUN ASKED IN ONE PROJECT. An ask in the worker's own project is served as it always was. An
 * ask in another project on the office's list is served in that project: the launcher run is filed there, every request
 * about it names that project, and the launcher is given it, so the worker's run is filed beside the run that asked.
 * The launcher run there names no session and no parent, because the worker's own run is in the worker's own project,
 * and a run names no parent in another project.
 */
function theSettingsInAProject(settings: WorkerSettings, project: string): WorkerSettings {
  return project === settings.workspace ? settings : { ...settings, workspace: project, session: null }
}

/** START THE LAUNCHER FOR ONE NEXT ROUND, with `startALauncher`. */
function startARound(settings: WorkerSettings, want: ARoundToStart, rounds: WatchingARound[]): Promise<{ ok: true; wrapper: string } | { ok: false; because: string }> {
  return startALauncher(settings, rounds, {
    run: want.run,
    what: `the next round after run ${want.run}`,
    of: `the next round of ${want.handle} after run ${want.run}`,
    title: `The office starting the next round of ${want.handle} after run ${want.run}`,
    extra: { purpose: 'round', round: want.run },
    starting: { path: `/api/worker/rounds/${encodeURIComponent(want.run)}/starting`, body: {} },
  })
}

/** What one launcher is started for: a next round, or a worker run when `worker` is set. */
interface ALauncherToStart {
  /** The run that holds the ask. */
  run: string
  /** The worker's registry id, for a worker run. The launcher is then given `worker --parent <run>`. */
  worker?: string
  /** What is started, in words, after "was not started" and "did not start": "the next round after run X". */
  what: string
  /** What the launcher starts, in words, for its process row and the log: "the next round of H after run X". */
  of: string
  title: string
  /** The launcher run's `extra`, which the starting door checks. */
  extra: Record<string, unknown>
  /** The starting door and what it is sent beside the launcher run. */
  starting: { path: string; body: Record<string, unknown> }
}

/**
 * START THE LAUNCHER FOR ONE ASK. The launcher run is filed first, because the starting door checks it and the
 * launcher files the new run under it. The starting door answers the model and the rest of the command line, or
 * refuses; a refusal leaves the launcher run crashed, saying it never started anything.
 */
async function startALauncher(
  settings: WorkerSettings,
  rounds: WatchingARound[],
  want: ALauncherToStart,
): Promise<{ ok: true; wrapper: string } | { ok: false; because: string }> {
  const What = `${want.what.charAt(0).toUpperCase()}${want.what.slice(1)}`
  const adapter = new RoundAdapter(settings.env)
  const cwd = settings.checkout
  const cannot = adapter.whyItCannotStart(cwd)
  if (cannot !== null) return { ok: false, because: `${What} was not started: ${cannot}` }
  const ran = theProgramThatRan(adapter.command, settings.env['PATH'])
  const fake = adapter.fakeScript()
  const filed = await ask(settings, '/api/records', {
    method: 'POST',
    body: {
      kind: 'session',
      title: want.title,
      data: {
        state: 'running',
        runtime: ROUND_LAUNCHER_RUNTIME,
        doing: `starting ${want.of}, with the sandbox launcher; this run runs no model`,
        workingDirectory: cwd,
        startedByMoleOffice: true,
        // NO `servingAgent`: this run serves no agent. The new run does, and the launcher files it.
        extra: { ...want.extra, ...(fake === null ? {} : { fakeRoundLauncher: fake }) },
        ...(ran.path === null ? {} : { ranProgram: ran.path }),
        ranProgramVersion: ran.version,
        ...(settings.session === null ? {} : { parentAttachment: settings.session }),
      },
    },
  })
  const wrapper = (filed.body?.['record'] as { id?: string } | undefined)?.id ?? null
  if (wrapper === null) return { ok: false, because: `A launcher run for ${want.what} could not be filed: ${refusalIn(filed.text)}` }
  const neverStarted = async (because: string): Promise<{ ok: false; because: string }> => {
    await ask(settings, `/api/records/${wrapper}`, {
      method: 'PATCH',
      body: { dataPatch: { state: 'crashed', doing: `It never started the launcher: ${because}`, usageReceipt: { ...A_ROUND_LAUNCHER_RUNS_RECEIPT, ranIn: whereItRan(process.env) } } },
    })
    return { ok: false, because }
  }
  const starting = await ask(settings, want.starting.path, { method: 'POST', body: { ...want.starting.body, wrapper } })
  const answer = starting.body?.[want.worker === undefined ? 'round' : 'workerRun'] as
    | { handle: string; runtime: string; model: string; instance: string; sandboxes: string; brief: string; verb?: 'worker' | 'exec'; worktree?: string | null; cutFrom?: string | null; tip?: string | null; clone?: string | null; paths?: string[] | null; images?: string[] | null; selection?: CastingSelection | null }
    | undefined
  if (!starting.ok || answer === undefined) return neverStarted(`The office did not start ${want.what}: ${refusalIn(starting.text)}`)
  const outputPath = outputPathFor(settings, wrapper)
  mkdirSync(join(settings.outputRoot, wrapper), { recursive: true })
  // THE LAUNCHER WRITES WITH THE OFFICE'S KEY, as this worker does, under this worker's name. With none, it would be
  // refused at its first write, so it is not started.
  const office = theOfficeKey(settings.env)
  const closing = { run: want.run, wrapper, workspace: settings.workspace, ...(want.worker === undefined ? {} : { worker: want.worker }) }
  let handle: RunHandle
  try {
    if (office.key === null) throw new Error(`the office's key could not be read, so the launcher could not write: ${office.says}`)
    // THE OPENCODE COMMAND uses the whole brief the starting door checked. A read failure fails this start too.
    let command: string[] | undefined
    if (answer.verb === 'exec' && answer.runtime === 'opencode') {
      const text = readFileSync(answer.brief, 'utf8')
      if (text.trim() === '') throw new Error(`The brief ${answer.brief} is empty, so no OpenCode worker was started.`)
      command = ['opencode', 'run', '--format', 'json', text]
    }
    handle = adapter.start({
      session: wrapper, cwd, api: settings.api, workspace: settings.workspace, outputPath, key: office.key,
      instance: answer.instance, sandboxes: answer.sandboxes, handle: answer.handle, brief: answer.brief, model: answer.model, runtime: answer.runtime,
      // A next round continues the run it follows, named. A worker run's verb is the office's answer: `exec` with the
      // worker's own worktree for dsh and OpenCode. So is the commit the launcher files the run at: the commit its
      // worktree is cut from when the worktree is not there yet, and the commit it stands at when it is. So are the
      // sandbox's clone it is cut from, when the ask named one and the worktree is made now, and the paths the ask
      // named, which the launcher checks out in the worker's worktree, and the images it named, which the launcher gives
      // codex exec. A worker run or a next round
      // on a Casting row with native selection data is given that row's selection, as the office answered it for this start.
      ...(want.worker === undefined
        ? { follows: want.run, ...(answer.worktree == null ? {} : { worktree: answer.worktree }), ...(answer.cutFrom == null ? {} : { cutFrom: answer.cutFrom }), ...(answer.tip == null ? {} : { tip: answer.tip }), ...(answer.selection == null ? {} : { selection: answer.selection }) }
        : {
            verb: answer.verb ?? 'worker',
            parent: want.run,
            ...(answer.worktree === null || answer.worktree === undefined ? {} : { worktree: answer.worktree }),
            ...(answer.cutFrom === null || answer.cutFrom === undefined ? {} : { cutFrom: answer.cutFrom }),
            ...(answer.clone === null || answer.clone === undefined ? {} : { clone: answer.clone }),
            ...(answer.paths == null || answer.paths.length === 0 ? {} : { paths: answer.paths }),
            ...(answer.images == null || answer.images.length === 0 ? {} : { images: answer.images }),
            ...(answer.selection == null ? {} : { selection: answer.selection }),
          }),
      ...(command === undefined ? {} : { command }),
    })
  } catch (err) {
    const says = `The sandbox launcher could not be started: ${(err as Error).message}`
    await closeALauncherRun(settings, { ...closing, handle: null, ledgerRow: null }, { ok: false, says })
    return { ok: false, because: says }
  }
  const world = worldOfTheApi()
  const held = await ask(settings, '/api/resources', {
    method: 'POST',
    body: {
      sessionRecordId: wrapper,
      type: 'process',
      key: String(handle.pid),
      detail: `the sandbox launcher starting ${want.of}`,
      startedByTheProduct: true,
      ...(world === null ? {} : { world }),
    },
  })
  if (!held.ok && adapter.alive(handle)) {
    // A PROCESS NO LIST HOLDS IS STOPPED, for the reason `startOne` gives.
    adapter.stop(handle)
    const says = withHowItWasEnded(`The sandbox launcher was started and could not be registered, so it was stopped again: ${held.text.slice(0, 300)}`, handle)
    await closeALauncherRun(settings, { ...closing, handle, ledgerRow: null }, { ok: false, says })
    return { ok: false, because: says }
  }
  rounds.push({
    ...closing,
    adapter,
    handle,
    ledgerRow: held.ok ? ((held.body?.['resource'] as { id?: string } | undefined)?.id ?? null) : null,
  })
  process.stdout.write(`The sandbox launcher started ${want.of}, as launcher run ${wrapper}.\n`)
  return { ok: true, wrapper }
}

/**
 * CLOSE ONE LAUNCHER RUN: the office is told how it ended, the launcher run's own record says finished or crashed,
 * and its ledger row is released. Answers what was said, or null because the office could not take it and it is to be
 * tried again. It is finished only when the launcher ended well and the ask says the round's run was filed.
 */
async function closeALauncherRun(
  settings: WorkerSettings,
  round: { run: string; wrapper: string; worker?: string; handle: RunHandle | null; ledgerRow: string | null },
  ending: RoundLauncherEnding,
): Promise<string | null> {
  // A WORKER RUN'S LAUNCHER IS TOLD AT THE WORKER-RUN DOOR, by the worker it starts; a next round's at the round door.
  const forAWorker = round.worker !== undefined
  const told = await ask(settings, `/api/worker/${forAWorker ? 'worker-runs' : 'rounds'}/${encodeURIComponent(round.run)}/ended`, {
    method: 'POST',
    body: { ...(forAWorker ? { agent: round.worker } : {}), wrapper: round.wrapper, ok: ending.ok, says: ending.says.slice(0, 2000) },
  })
  // A REFUSAL IN THE 400s IS AN ANSWER: the ask is failed, or is not this launcher's any more. Anything else is tried again.
  if (!told.ok && (told.status < 400 || told.status >= 500)) {
    sayOnceAboutRounds(`${round.wrapper} ending`, `The ending of launcher run ${round.wrapper} could not be told to the office, and will be tried again: ${refusalIn(told.text)}`)
    return null
  }
  const asked = told.body?.[forAWorker ? 'workerRun' : 'nextRound'] as { state?: unknown; started?: { run?: unknown } } | undefined
  const filedRun = told.ok && asked?.state === 'started' && typeof asked.started?.run === 'string' ? asked.started.run : null
  const finished = ending.ok && filedRun !== null
  const because = told.ok
    ? `${ending.says} The office says the ${forAWorker ? "worker's" : "round's"} run is ${filedRun ?? 'not filed'}.`
    : `${ending.says} The office said: ${refusalIn(told.text)}`
  const patched = await ask(settings, `/api/records/${round.wrapper}`, {
    method: 'PATCH',
    body: {
      dataPatch: {
        state: finished ? 'finished' : 'crashed',
        doing: because.slice(0, 2000),
        ...(round.handle === null ? {} : outputTiming(round.handle.outputPath)),
        usageReceipt: { ...A_ROUND_LAUNCHER_RUNS_RECEIPT, ranIn: whereItRan(process.env) },
      },
    },
  })
  if (!patched.ok) process.stderr.write(`The ending of launcher run ${round.wrapper} was not stored on its own record: ${refusalIn(patched.text)}\n`)
  if (round.ledgerRow !== null) {
    const letGo = await ask(settings, `/api/resources/${round.ledgerRow}/release`, { method: 'POST', body: { note: because.slice(0, 500) } })
    // 409 IS NOT A FAILURE: a person who stopped the launcher from the product released its row with the press.
    if (!letGo.ok && letGo.status !== 409) process.stderr.write(`The ledger row ${round.ledgerRow} of launcher run ${round.wrapper} could not be released: ${refusalIn(letGo.text)}\n`)
  }
  roundSentencesSaid.delete(`${round.wrapper} ending`)
  process.stdout.write(`Launcher run ${round.wrapper} for ${forAWorker ? `the worker run of agent ${round.worker ?? ''} under` : 'the next round after'} run ${round.run} ended: ${because}\n`)
  return because
}

// ============================================================================ how it is started

/** Read the worker's settings from the environment, the command line and the settings declaration. */
export function workerSettingsFrom(argv: readonly string[], from: NodeJS.ProcessEnv = process.env): WorkerSettings {
  const at = argv.indexOf('--session')
  const watching = argv.find((one) => one.startsWith('--stop-with-pid='))
  const starter = watching === undefined ? Number.NaN : Number(watching.slice('--stop-with-pid='.length))
  const environment = mergedEnvironment(from)
  // THE FOLDER THE RUNS WORK IN, AND WHERE EACH WRITES ITS RULES FILE: the install's root unless
  // MOLE_OFFICE_WORKER_CHECKOUT names another, which only a test's scratch office does (round 15).
  const checkout = workerCheckoutFrom(environment)
  // THE FAKE-RUNTIME SETTING IS READ THROUGH THE DECLARATION, so `.env` reaches it the same way it
  // reaches every other setting and this file is not a second place that reads the environment.
  const faked = settingValue('MOLE_OFFICE_FAKE_RUNTIME')
  /**
   * THE ADDRESS IS READ THROUGH `settings()` AND NOT THROUGH `settingValue`.
   *
   * `settingValue('MOLE_OFFICE_API')` gives back the DECLARED value, which when nobody has set one
   * is the template `http://127.0.0.1:<MOLE_OFFICE_PORT>` — a sentence for a person reading the
   * settings, not an address. `settings().apiAddress` is the derived one, which is where this
   * server actually is. Measured on 4 September 2026: the worker started, polled that template
   * forty times, and wrote "Failed to parse URL" into its log while a message sat in the queue.
   */
  const resolved = settings()
  // THE SERVER THAT STARTED THIS WORKER SAYS WHERE IT ANSWERS (`--api <address>`), and that wins over
  // the declaration: a checkout whose .env names the canonical API would otherwise send a scratch
  // server's worker to the canonical one. Without the flag, the derived address is the fallback.
  const apiFlag = argv.indexOf('--api')
  const told = apiFlag === -1 ? null : (argv[apiFlag + 1] ?? null)
  return {
    api: told ?? resolved.apiAddress,
    workspace: resolved.workspace,
    session: at === -1 ? null : (argv[at + 1] ?? null),
    stopWithPid: Number.isFinite(starter) && starter > 0 ? starter : null,
    checkout,
    runs: gateNumber('worker-runs'),
    hops: gateNumber('agent-hops'),
    // Run output is data: under the data root, which is the checkout itself from a checkout.
    outputRoot: THE_RUN_OUTPUT_FOLDER,
    // `.env` UNDER THE ENVIRONMENT THIS WORKER WAS STARTED WITH, so a run's tool and the adapter that
    // chooses its model see the same world `settings()` above read. The adapters answer out of this
    // and nothing else; until 8 September 2026 they reached into the checkout's `.env` themselves
    // when a value was missing here, which answered a test's built world out of the owner's file.
    env:
      faked === null
        ? environment
        : { ...environment, MOLE_OFFICE_FAKE_RUNTIME: resolve(REPO_ROOT, faked) },
    // THE SAME READING THE SERVER MADE when it decided to start this worker: the one declaration, over
    // the environment the server handed down and `.env` under it. `off` does not reach here from the
    // server, which then starts no worker; a worker started by hand under `off` serves everything, as it
    // always has.
    mergesOnly: settingValue('MOLE_OFFICE_MESSAGE_WORKER', from) === 'merges-only',
  }
}

/** The line the worker prints when it starts, so a person reading the log knows what it will do. */
export function whatItWillDo(settings: WorkerSettings): string {
  // A WORKER CHECKOUT THAT IS NEITHER OF THE PAIRED OFFICE'S TWO is said once here, and each run of the merge tool, the
  // check tool or the sandbox launcher there is refused when it starts (envFor).
  const refused = whyAnOfficeToolMayNotRunIn(settings.checkout, 'MOLE_OFFICE_WORKER_CHECKOUT')
  const ownToolsLine = refused === null
    ? ''
    : `${refused.replace(/ Nothing was started\.$/, '')} So each run of the merge tool, the check tool or the sandbox launcher there is refused, and an agent's run starts as before.`
  if (settings.mergesOnly === true) {
    return [
      `The message worker is watching ${settings.api} in ${settings.workspace} for merge entries and for the next rounds asked through the next-round door, and in every project on the office's list for the worker runs asked through the worker-run door.`,
      MERGES_ONLY_SAYS,
      `At most ${String(MERGE_TOOL_SLOTS)} run of the office's merge tool at once, for the merge entries the office marks.`,
      `Its runs work in ${settings.checkout} and their output goes to ${settings.outputRoot}.`,
      ownToolsLine,
    ].filter((line) => line !== '').join('\n')
  }
  const faked = fakeRuntimeScript(settings.env)
  return [
    `The message worker is watching ${settings.api} for messages to agents in ${settings.workspace}.`,
    `At most ${String(settings.runs)} runs at once, at most ${String(settings.hops)} agent replies without a person.`,
    `Beside them, at most ${String(MERGE_TOOL_SLOTS)} run of the office's merge tool, for the merge entries the office marks.`,
    `Runs work in ${settings.checkout} and their output goes to ${settings.outputRoot}.`,
    ownToolsLine,
    faked === null
      ? ''
      : `RUNS ARE NOT REAL: every message is answered by ${faked} instead of an agent tool. Nothing an agent says here came from a model.`,
  ]
    .filter((line) => line !== '')
    .join('\n')
}

/** How long between passes when the last pass changed something or a run is in flight. */
const BETWEEN_PASSES_MS = 2_000

/**
 * How long between passes when the last pass changed nothing, and no run is going.
 *
 * Measured by Cluster B on 11 September 2026: `GET /api/worker/queue` was read 28,115 times in
 * 2.4 days at a mean of 1.8 seconds — a flat two-second cadence reading an empty queue tens of
 * thousands of times. Thirty seconds is still six times a minute, and a message written the
 * moment after a pass waits at most thirty seconds for the next one; that cost is the owner's to accept
 * and the brief records it. NOT a setting: it is how often a quiet queue is looked at, not what
 * the queue does.
 */
const PASS_WHEN_NOTHING_CHANGED_MS = 30_000

/**
 * THE WAIT AFTER ONE PASS, from what the pass changed and what is in flight.
 *
 * Fast — a few seconds — when something happened on the last pass or a run is going, because a
 * queue with work in it and a run that just ended are both worth looking at again at once. Slow —
 * thirty seconds — when nothing changed, because an empty queue read twice a second is the door's
 * cost for nothing. THE HELD MESSAGES ARE NOT "SOMETHING HAPPENED": the 633 dead letters sat in
 * the queue held for days, and every pass said the same sentence about them, so counting `held`
 * here would keep the cadence fast for ever. What counts is what the pass DID — started, answered,
 * failed, picked up, waited out, cut off.
 */
export function waitAfterAPass(report: PassReport, watching: readonly Watching[]): number {
  const changed =
    report.started.length > 0 ||
    report.answered.length > 0 ||
    report.failed.length > 0 ||
    report.pickedUp.length > 0 ||
    report.waitedLongEnough.length > 0 ||
    report.cutOff.length > 0 ||
    // A MERGE TOOL RUN STARTED, ENDED, PICKED UP OR STOPPED IS SOMETHING HAPPENING. An entry held because the
    // slot is taken is not.
    report.merges.started.length > 0 ||
    report.merges.ended.length > 0 ||
    report.merges.pickedUp.length > 0 ||
    report.merges.stopped.length > 0 ||
    // A LAUNCHER STARTED OR ENDED FOR A NEXT ROUND OR A WORKER RUN, so the pass that closes it comes soon.
    (report.rounds?.started.length ?? 0) > 0 ||
    (report.rounds?.ended.length ?? 0) > 0 ||
    (report.workers?.started.length ?? 0) > 0 ||
    (report.workers?.ended.length ?? 0) > 0
  // A MERGE TOOL RUN STILL GOING IS NOT A REASON TO PASS EVERY TWO SECONDS. Its end is seen without asking the
  // server, by `waitForTheNextPass`, which starts the next pass at once when it comes. Until wave 13y round 21 a run
  // going kept the pass at two seconds, and a pass asks the server six things, so a merge with a suite of an hour
  // cost about 180 requests a minute for that hour (a measurement found the merge list asked every 2 s on live).
  if (changed || watching.length > 0) return BETWEEN_PASSES_MS
  return PASS_WHEN_NOTHING_CHANGED_MS
}

/**
 * THE WAIT BEFORE THE NEXT PASS, CUT SHORT WHEN A MERGE TOOL RUN THIS WORKER WATCHES HAS ENDED.
 *
 * Every two seconds of the wait it looks, on this machine and without asking the server, whether each watched merge
 * tool run's process is still there (`alive`, the check step 3 of `tendTheMergeTool` makes). When one has gone, the
 * wait ends and the next pass closes it, as soon as the two-second pass did before. So the end of a merge is
 * recorded no later than before, and the server is asked nothing while it runs.
 *
 * WHAT WAITS LONGER WHILE A MERGE RUNS, said plainly: what only the server knows. A stop a person presses on a merge
 * entry, an entry newly submitted for the pin slot, and a message to an agent are seen at the next pass, up to
 * thirty seconds later, as they already are when no merge runs.
 *
 * `pause` is for tests; production waits on a timer.
 */
export async function waitForTheNextPass(
  ms: number,
  merges: readonly WatchingAMerge[],
  pause: (ms: number) => Promise<void> = (wait) => new Promise((go) => setTimeout(go, wait)),
): Promise<'waited' | 'a merge tool run ended'> {
  for (let waited = 0; waited < ms; waited += BETWEEN_PASSES_MS) {
    await pause(Math.min(BETWEEN_PASSES_MS, ms - waited))
    if (merges.some((run) => !run.adapter.alive(run.handle))) return 'a merge tool run ended'
  }
  return 'waited'
}

/**
 * THE BEAT, ON ITS OWN TIMER, AND NEVER ON THE PASS. Criterion M79's heartbeat, and the second
 * half of the cadence work.
 *
 * The pass used to beat every held handle itself. That worked while the pass ran every two
 * seconds and broke the moment the pass slowed — which the adaptive cadence below now does on
 * purpose, thirty seconds between passes on an empty queue. A hold beats every
 * MOLE_OFFICE_HANDLE_BEAT_SECONDS (the handle's own beatEvery, read through settingValue here —
 * the same declaration the server reads) whether passes are fast, slow, or stuck behind a slow server, so no
 * future change to the pass cadence can ever slow the heartbeat again. Living inside the
 * 90-second lapse margin is not the fix; removing the coupling is.
 *
 * A BEAT SLOWER THAN THE INTERVAL SKIPS ITSELF RATHER THAN PILING UP, and a beat that cannot be
 * said is silent, for the reason the pass's old comment gave: the one refusal it can meet is a
 * handle this session no longer holds, which the release path already says out loud.
 */
export function startTheBeatTimer(settings: WorkerSettings, watching: Watching[]): NodeJS.Timeout {
  // READ THE WAY THIS FILE ALREADY READS SETTINGS, not through the server's env module. The worker
  // is its own program and `tests/a-program-is-judged-on-the-files-it-is-built-from` names the only
  // three files any program may load from outside its own folders; importing src/server/lib/env.ts
  // here would have made the worker load a fourth. `settingValue` is the same declaration either way.
  const everyMs = Number(settingValue('MOLE_OFFICE_HANDLE_BEAT_SECONDS')) * 1_000
  let beating = false
  const timer: NodeJS.Timeout = setInterval(() => {
    if (beating) return
    beating = true
    const said = beatTheHeldHandles(settings, watching)
    void said
      .catch(() => {})
      .finally(() => {
        beating = false
      })
  }, everyMs)
  timer.unref()
  return timer
}

async function beatTheHeldHandles(settings: WorkerSettings, watching: readonly Watching[]): Promise<void> {
  for (const run of [...watching]) {
    if (run.holdsTheHandle !== true) continue
    await ask(settings, `/api/handles/${encodeURIComponent(run.handleName)}/beat`, {
      method: 'POST',
      body: { session: run.session },
    })
  }
}

/** An empty pass report, for the loop's catch, which must still be able to ask what the wait is. */
function anEmptyPassReport(): PassReport {
  return { started: [], held: [], answered: [], failed: [], pickedUp: [], waitedLongEnough: [], cutOff: [], resumed: [], deadLetters: null, merges: noMergeWork() }
}

/**
 * How long to wait before trying a refused reply once more.
 *
 * Long enough that whatever refused it has a chance to have been put right, short enough that a
 * person watching the conversation sees the second answer arrive rather than giving up on it. Not a
 * setting: it is how patient one retry is, and nobody has needed to change it.
 */
const TRY_A_REFUSED_REPLY_AGAIN_AFTER_MS = 5_000

/** The sentence an API refusal carries, or the whole reply when it is not shaped like one. */
function refusalIn(text: string): string {
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed === 'object' && parsed !== null) {
      const said = (parsed as { error?: unknown }).error
      if (typeof said === 'string' && said.trim() !== '') return said.trim()
    }
  } catch {
    // A refusal that is not JSON is quoted as it came, which is more use than a sentence about it.
  }
  return text.trim() === '' ? 'the API refused it and said nothing.' : text.trim().slice(0, 300)
}

async function watchTheQueue(): Promise<void> {
  const settings = workerSettingsFrom(process.argv.slice(2))
  const watching: Watching[] = []
  // THE MERGE TOOL RUNS, a list of their own (piece P9). Like the agent runs, they are not stopped when
  // this worker stops: they are registered, and the next worker picks them up.
  const merges: WatchingAMerge[] = []
  process.stdout.write(`${whatItWillDo(settings)}\n`)
  let stopping = false
  const standDown = (why: string): void => {
    if (stopping) return
    stopping = true
    process.stdout.write(`The message worker is stopping: ${why}.\n`)
    // THE RUNS ARE NOT KILLED. A run is registered in the ledger under its own session and a person
    // may stop it from the product; ending them here because this process was asked to stop would
    // throw away work nobody asked to throw away.
    process.exit(0)
  }
  process.on('SIGTERM', () => {
    standDown('it was asked to stop')
  })
  process.on('SIGINT', () => {
    standDown('it was interrupted')
  })
  // ON WINDOWS THERE IS NO SIGTERM, so the server's ask to stop comes as a request on this worker's group's pipe and
  // is heard here. On Linux and the Mac this listens for nothing: the SIGTERM above is the ask.
  listenForAStopRequest(() => {
    standDown('it was asked to stop')
  }, (sentence) => {
    process.stderr.write(`${sentence}\n`)
  })
  // AND THE BEAT, ON ITS OWN TIMER, STARTED BEFORE THE FIRST PASS so a hold taken a moment before
  // the first pass is beaten from the start rather than waiting for one.
  startTheBeatTimer(settings, watching)
  // THE SERVER THAT STARTED THIS ONE IS KNOWN BY ITS START TIME AS WELL AS ITS PID (problem 26r01Ohh-DqX).
  let theServer = settings.stopWithPid === null ? null : aWatchOnTheStarter(settings.stopWithPid)
  for (;;) {
    // THE SERVER THAT STARTED THIS ONE IS STILL THERE, ASKED FIRST. A worker whose server was killed
    // outright has nothing to talk to and nothing watching it, which is how an orphan is made.
    const server = theServer === null ? null : theServer()
    if (server?.state === 'gone') {
      standDown(`the server that started it, process ${String(settings.stopWithPid)}, has gone`)
      return
    }
    // COULD NOT LOOK IS NOT GONE (invariant 5): said once, and the worker stops asking, as the server's
    // own watchdog does. Before the watch, signal 0 never failed to answer.
    if (server?.state === 'unreadable') {
      process.stderr.write(
        `--stop-with-pid=${String(settings.stopWithPid)}: the message worker cannot tell whether its server is still running ` +
          `(${server.why}), so it will not stop by itself when the server goes.\n`,
      )
      theServer = null
    }
    let report = anEmptyPassReport()
    try {
      // Limits and model choices are read again for this pass. Active runs keep their own model.
      const current = workerSettingsFrom(process.argv.slice(2))
      settings.runs = current.runs
      settings.hops = current.hops
      settings.env = current.env
      report = await onePass(settings, watching, merges)
      // WHAT WENT WRONG IN A PASS IS PRINTED. The report used to be thrown away here, so a reply
      // the API refused left nothing in the log either (problem `4DK_cvyAc5Ri`).
      for (const gone of report.failed) {
        process.stderr.write(`Message ${gone.messageId}: ${gone.because}\n`)
      }
    } catch (err) {
      process.stderr.write(`The message worker could not finish a pass: ${(err as Error).message}\n`)
    }
    await waitForTheNextPass(waitAfterAPass(report, watching), merges)
  }
}

/** True when this file was run rather than imported, which is how the server starts it. */
function startedDirectly(): boolean {
  // The one rule, which also holds inside a bundle: src/config/settings.mjs `isTheProgramRun`.
  return isTheProgramRun(import.meta.url, THE_WORKER_ENTRY)
}

if (startedDirectly()) {
  await watchTheQueue()
}

/**
 * THE ONE AGENT A STORED REFERENCE NAMES, read off the roster the office answered with.
 *
 * A stored reference — here the delivery row's recipient id, written earlier and read back now — is
 * never resolved by the arriving-reference rule. It is read by exact id, then the one agent bearing
 * the string as a handle, and no agent where more than one answers. The worker holds no database, so
 * this is the local copy of `theOneAgentAStringNames` in src/server/lib/agent-references.ts, over
 * the already-fetched list. A hand-written `row.id === … || row.handle === …` would follow a bare
 * handle to whichever live agent now bears it, which is the wrong agent once a handle is freed and
 * taken again.
 */
function theOneAgentAStoredReferenceNames<T extends { id?: string; handle?: string }>(
  agents: readonly T[],
  reference: string,
): T | null {
  const named = new Map<string, T>()
  for (const one of agents) {
    if (one.id !== reference && one.handle !== reference) continue
    if (one.id === undefined) continue
    named.set(one.id, one)
  }
  if (named.size !== 1) return null
  return [...named.values()][0] ?? null
}

type WorkerParticipant = { id?: string; handle?: string; homeWorld?: string | null }
type WorkerParticipantPage = { agents?: WorkerParticipant[]; next?: string | null }
type WorkerParticipantAnswer = { ok: boolean; body: Record<string, unknown> | null }

export async function theParticipantsTheWorkerNeeds(read: (path: string) => Promise<WorkerParticipantAnswer>): Promise<WorkerParticipant[]> {
  try {
    const pages = await everyParticipantPage<WorkerParticipantPage>('/api/participants', async path => {
      const answer = await read(path)
      return { ok: answer.ok, body: answer.body as WorkerParticipantPage | null }
    })
    return pages.flatMap(page => page.agents ?? [])
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return []
  }
}

/**
 * THE VISIT A RUN NEEDS, REGISTERED AT THE OFFICE ON THE AGENT'S BEHALF. Criterion C6.
 *
 * *A run the worker starts in a scratch world is a visit the worker registers at the office on the
 * agent's behalf; the run's environment carries its home and the visit.*
 *
 * ---------------------------------------------------------------------------------------
 * WHEN A RUN IS A VISIT, WHICH IS AN ENGINEERING READING OF THE CRITERION AND IS SAID HERE
 * ---------------------------------------------------------------------------------------
 *
 * A run is a visit exactly when the agent's HOME WORLD is not the world the run works in. The
 * criterion says "a run the worker starts in a scratch world", and the two are the same thing
 * whenever the agent lives in the main world, which is the default home criterion C1 gives every
 * citizen. They part company for an agent registered in the scratch world itself: that agent is a
 * citizen of that world, and a visit from a world to itself is refused by name, because a citizen at
 * home is never checked and a row saying otherwise would put somebody on a list of people working
 * away from home who are not.
 *
 * AN AGENT WITH NO HOME RECORDED IS TREATED AS A CITIZEN OF THIS WORLD, not of a guessed one. Its
 * registry row predates criterion C1, and inventing a home for it would produce a visit nobody made.
 *
 * ---------------------------------------------------------------------------------------
 * IT NEVER STOPS A RUN
 * ---------------------------------------------------------------------------------------
 *
 * A run that could not have its trip registered still starts, and its environment then carries no
 * visit — which is exactly what it holds. The world it works in refuses its writes and says why, in
 * the sentence criterion C4 wrote, and that is a better outcome than a message that is never
 * answered because a list could not be updated.
 */
async function theVisitThisRunNeeds(
  settings: WorkerSettings,
  one: Waiting,
): Promise<{ home: string | null; visit: string | null }> {
  const here = theHomeWorld
  if (here === null) return { home: null, visit: null }
  // The page shape omits homeWorld, so this read asks for whole rows and follows every page.
  const agents = await theParticipantsTheWorkerNeeds(path => ask(settings, path))
  const mine = theOneAgentAStoredReferenceNames(agents, one.to.id)
  const home = mine?.homeWorld ?? null
  if (home === null || home === here) return { home: here, visit: null }
  const registered = await ask(settings, '/api/office/visits', {
    method: 'POST',
    body: {
      visitor: { kind: 'agent', id: one.to.id },
      fromWorld: home,
      why: `a run answering the message ${one.messageId}`,
    },
  })
  const visit = (registered.body?.['visit'] as { id?: string } | undefined)?.id ?? null
  return { home, visit }
}
