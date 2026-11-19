// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { prepareNoticeBatch } from '../../holder/notice-batches.ts'
/**
 * WHICH LIVE SESSION IS ANSWERING AS A DURABLE AGENT, OVER HTTP.
 *
 *   GET  /api/handles                  every hold, newest first, with any that went quiet released
 *   GET  /api/handles/:handle          who is answering as this agent right now, and how
 *   POST /api/handles/:handle/hold     this session is answering as this agent
 *   POST /api/handles/:handle/beat     this session is still there
 *   POST /api/handles/:handle/release  this session has stopped answering as this agent
 *   POST /api/handles/:handle/took     this session has been given a message addressed to this agent
 *   POST /api/handles/:handle/process  this session's own claude process, checked and written down
 *   GET  /api/handles/:handle/knows    what this agent already knows, for a run that is about to answer as it
 *   GET  /api/handles/:handle/running-workers  which agents this one started still have a run running
 *
 * WHAT THESE ARE FOR. Criteria H1 to H4 of design/messages/ACCEPTANCE.md section 10: a message to an
 * agent that is open in a terminal is answered by that session, not by a fresh run started beside
 * it. `for-agents/hold-the-handle.mjs` is the caller: a session
 * starts it once and it holds, beats and lets go.
 *
 * NOTHING HERE SIGNALS A PROCESS. A refused claim does not touch the session that holds the handle,
 * and releasing a hold that went quiet does not touch it either. The rules are in
 * src/server/lib/handles.ts, beside the refusals that name them.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { refuseAnActWithNoKey, type ADoorThatAsksForAKey } from '../lib/keyheader.ts'
import { route } from '../lib/route.ts'
import { sendTheHeldDraftsOfThisRequestsRun } from '../lib/turn-drafts.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { theProjectOfTheAgentRecord } from '../lib/participants.ts'
import { PanelError } from '../lib/panel-error.ts'
import {
  beatTheHold,
  everyHold,
  everythingWaitingFor,
  holdTheHandle,
  theAgentAHandleDoorNames,
  theAgentKeyAnActorHolds,
  letTheHandleGo,
  whyACredentialMayNotActOnThisHandle,
} from '../lib/handles.ts'
import { credentialTokenOn } from '../lib/visitorgate.ts'
import { credentialForToken } from '../lib/visitors.ts'
import { recordTheSessionsProcess } from '../lib/held-process.ts'
import { theRunningWorkersOf } from '../lib/running-workers.ts'
import { registerAWaiter } from '../lib/waiting-hold.ts'
import { THE_REMINDER_IS_HANDED_OVER_TOO, theOpenSleepOf } from '../lib/resident-sleep.ts'
import { thisCallIsHeld } from '../lib/usage.ts'
import { theLiveSessionTookIt, whoIsAnsweringAs, whoIsAnsweringAsAsksAboutAProcess } from '../lib/worker.ts'
import { everyMessageHiddenFrom, readMessageWhereverItIs, refuseAMessageThisReaderMayNotRead, theMessageReader, theMessagesThisReaderMayRead } from '../lib/messages.ts'
import { theCommentsAReviewIsHolding, whatAReviewKeptBack } from '../lib/reviews.ts'
import { theGroupForAHandOver, theSenderForAHandOver } from '../lib/who-sent-it.ts'
import { theBundleAsText, whatTheAgentKnows } from '../lib/agentmemory.ts'
import { handleBeatSeconds, handleLapsesAfterSeconds } from '../lib/env.ts'
import { addressForOtherMachines } from '../lib/runtime.ts'
import { thisMachine } from '../lib/machines.ts'
import { readEveryProcessFirst } from '../../config/session-process.mjs'
import { HOLD_STATES, whatTheWaiterSaysAboutTheAddress, type HoldState } from '@shared/handles.ts'
import { REPO_ROOT, THE_FOR_AGENTS_FOLDER, THE_INSTALL, gatePosition, settings } from '../../config/settings.mjs'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { join } from 'node:path'

/**
 * THE WAITER AS ONE FILE. Criterion M92.
 *
 * The script imports six modules of this checkout (where-is-the-api, three settings modules, the
 * events and the waking words), and a machine with no checkout has none of them. Measured on
 * 8 September 2026: the raw file served to the owner's other machine exited 1 with
 * ERR_MODULE_NOT_FOUND for tools/where-is-the-api.mjs, and the agent there, trying to fetch the
 * modules, went as far as attempting to log into this machine. So what is served is the script
 * and its imports built into one file, from the file on disk at the moment of the call, which is
 * still what this installation runs rather than a copy that can drift.
 */
async function theWaiterAsOneFile(path: string): Promise<string> {
  // AN INSTALLED OFFICE SERVES THE FILE ITS BUNDLE ALREADY BUILT. scripts/bundle.mjs builds
  // for-agents/hold-the-handle.mjs into one file at the same path, and an installed office carries no
  // esbuild to build it again (wave 13t, round 16).
  if (THE_INSTALL.from === 'bundle') {
    try {
      return await readFile(path, 'utf8')
    } catch (err) {
      throw new PanelError(
        `The waiter could not be read from ${path}, where this installed office keeps it: ${(err as Error).message}. Nothing was served.`,
        503,
      )
    }
  }
  let built: Awaited<ReturnType<typeof build>>
  try {
    built = await build({
      entryPoints: [path],
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      write: false,
      logLevel: 'silent',
      absWorkingDir: REPO_ROOT,
    })
  } catch (err) {
    throw new PanelError(
      `The waiter could not be built from ${path} on the machine this office runs on: ${(err as Error).message}. ` +
        'Nothing was served. This office is running from a checkout that does not hold it, or the build failed.',
      503,
    )
  }
  const out = built.outputFiles?.[0]
  if (out === undefined) throw new PanelError('The build of the waiter produced no file, so nothing was served.', 503)
  return out.text
}

// ============================================================================ the sentences

const LIST_NOTE =
  'EVERY TIME A SESSION HAS ANSWERED AS A DURABLE AGENT, newest first. A hold says that one session — a terminal ' +
  'somebody opened — is answering as one agent, so a message to that agent goes to it and Mole Office starts no ' +
  'run. `state` is `fresh` when the session said it was there recently, `lapsed` when it went quiet for longer ' +
  'than it was allowed, and `released` when it is over. READING THIS RELEASES A HOLD THAT WENT QUIET, with the ' +
  'reason written on it: there is no sweeper, because a hold only matters when somebody asks who is answering. ' +
  'Nothing is ever signalled — a session whose hold was released may still be running.'

const ONE_NOTE =
  'WHO IS ANSWERING AS ONE AGENT RIGHT NOW, in one of three answers: a live session somebody has open, a run ' +
  'Mole Office started, or nobody. `says` is the sentence a person reads. This is what the chat panel puts at the ' +
  'top of a conversation, so a reader can tell the agent they left open from a fresh run started to answer them. ' +
  '`quietFor` on the hold, against `beatEvery` beside it, is how a caller tells a hold something is still ' +
  'beating from one whose waiter has stopped without letting go.'

/**
 * THE FOUR DOORS HERE THAT TAKE AN ACT ONLY WITH A KEY, as piece 7 of the keys wave made them, are
 * hold, took, process and release. The waiter sends the agent's own key, or the
 * office's key where the agent holds none. A request a listener carried with no key this office knows is refused by
 * `refuseAnActWithNoKey` in lib/keyheader.ts, before anything else is read. beat, waiting and knows
 * do not ask yet.
 */
const WITH_A_KEY = ' A request a listener carried comes with a key this office knows, and one with none is refused.'
const A_HOLD: ADoorThatAsksForAKey = { act: 'This hold on a handle', nothingWasDone: 'Nothing was written.' }
const A_HAND_OVER: ADoorThatAsksForAKey = { act: 'This hand-over of a message', nothingWasDone: 'Nothing was marked.' }
const A_PROCESS: ADoorThatAsksForAKey = { act: "This record of a session's process", nothingWasDone: 'Nothing was written.' }
const A_RELEASE: ADoorThatAsksForAKey = { act: 'This release of a handle', nothingWasDone: 'Nothing was written.' }

const HOLD_NOTE =
  'SAY THIS SESSION IS ANSWERING AS THIS AGENT. It takes the session record this run is filed under, the computer ' +
  'it is on and which tool it is a session of. While the hold is fresh, a message to this agent goes to this ' +
  'session and no run is started for it. A SECOND SESSION IS REFUSED 409 NAMING THE ONE THAT HOLDS IT, and that ' +
  'refusal signals nothing: the other session is not touched. Claiming again from the same session is not a ' +
  'second claim — it says the session is still there, which is what happens every time the waiter is restarted. ' +
  'A HANDLE WHOSE HOLDER HAS BEEN QUIET for longer than it was allowed may be taken over by anybody, and the reply ' +
  'then carries `tookOverFrom`: the hold that was ended, with the row saying it went quiet and who has the handle ' +
  'now. Nothing is signalled by a takeover either — the first session is not touched and may still be running.' +
  WITH_A_KEY

const BEAT_NOTE =
  'SAY THE SESSION HOLDING THIS HANDLE IS STILL THERE. Only the session named on the hold may send this; a beat ' +
  'from anybody else would keep another process’s hold alive after it had gone. A handle nothing holds ' +
  'answers 409 saying so rather than writing a hold nobody claimed.'

const RELEASE_NOTE =
  'SAY THIS SESSION HAS STOPPED ANSWERING AS THIS AGENT, with one plain sentence saying why. The hold is kept and ' +
  'marked as over; nothing is deleted and nothing is signalled. Only the session that holds a handle may let it ' +
  'go. The next message to this agent starts a run, as it did before anybody held it.' + WITH_A_KEY

const WAITING_NOTE =
  'EVERYTHING STILL WAITING FOR ONE AGENT, IN EVERY PROJECT, oldest first with emergencies in front. It is what a ' +
  'session holding the handle asks when it starts and when its connection comes back, so a message written while ' +
  'it was away is handed over instead of sitting under a clock. ADD ?wait=<seconds> AND THE SERVER HOLDS THE ' +
  'ANSWER open until a delivery row is written for this agent or that many seconds pass. The seconds are yours: ' +
  'ask for ten if your own request gives up at twelve. The cap is thirty; a larger number is clamped to it and ' +
  'the reply says so in `capped`. WITHOUT ?wait THE ANSWER IS IMMEDIATE, which is what the waiters already ' +
  'running on other machines rely on, and a ?wait this door cannot read as a whole number of seconds from one ' +
  'upwards is answered immediately too rather than refused, so a bad value costs you a held answer and never ' +
  'your reply. A hold that times out answers ' +
  'the same empty shape the immediate call does. A hold is only started for an empty answer: if something is ' +
  'already waiting it is answered at once. SOME NOTICES MOLE OFFICE AND THE INSPECTOR WRITE ASK NOTHING OF ' +
  'THE AGENT, for example a run ended, a run sealed, a group opened or the idle reminder; the kinds are listed, ' +
  'each with whether it wakes, in src/server/lib/notices.ts. A message from a person or from any other agent ' +
  'always wakes. Each quiet notice carries ' +
  '`wakesNoWaiter`, and such a notice is handed over only beside a message that is not one. When only such ' +
  'notices are waiting, the answer is empty, the note says how many are waiting, and a hold is started as for ' +
  'an empty answer. IT IS NOT THE WORKER QUEUE: that is one project\'s queue by design, ' +
  'and this session answers for an agent the whole chat writes to. Each row says which project the message is ' +
  'filed in, because an answer is filed where the message it answers was filed. A queued letter from before ' +
  'its addressee\'s dead-letter handoff carries `swept`, with the time, group, claim and a line describing ' +
  'the handoff; office messages and messages already routed elsewhere do not. WHILE A PERMANENT RESIDENT SLEEPS ' +
  '(POST /api/residents/:agentId/sleep, or its sleep time), only urgent messages are handed over, and the one ' +
  'reminder Mole Office sent when a sleep at its sleep time began; every other one is kept back, ' +
  'unchanged and unread, and does not end a hold. The reply then also carries `asleepSince` and `keptBack`, the ' +
  'number kept back, and the note says why. When it wakes, the kept messages are handed over at the next read, in ' +
  'order. A COMMENT A REVIEW THAT HAS NOT BEEN SENT HOLDS is left out, as the message worker holds it, and does not ' +
  'end a hold; the reply then carries `keptBackByAReview`, with how many and why. The person\u2019s send gives you the ' +
  'comments in one message. Criteria M74, M76 and U7.'

const RUNNING_WORKERS_NOTE =
  'WHICH OF THE AGENTS ONE AGENT STARTED STILL HAVE A RUN IN STATE running, AND THE CHILD RUNS FILED UNDER ONE ' +
  'SESSION. It is what the Stop hook asks at the end of a supervisor’s turn, read in a few statements whatever ' +
  'the number of workers: the registry rows it started, each one’s record in this project, and this project’s ' +
  'running session rows, read through the partial index records_session_running_idx and never by reading every ' +
  'session record. A worker is named when a running row is bound to its record by `ranAs`; a child is named when ' +
  'its `parentAttachment` is the session asked about and nothing has closed it. Each handle appears once, the ' +
  'list is sorted by handle, and `runs` names the running session ids that put it there, newest first. ADD ' +
  '?session=<id> AND CHILD RUNS ARE LOOKED AT TOO; an id that is no session of this project is refused with ' +
  'the children door’s own words. WITHOUT IT child runs are not looked at, and the note says so instead of ' +
  'saying there are none.'

const TOOK_NOTE =
  'SAY THIS SESSION HAS BEEN GIVEN A MESSAGE ADDRESSED TO THE AGENT IT IS ANSWERING AS. The message is marked ' +
  "delivered for that agent. Read is the recipient's own act: POST /api/messages/<id>/mark {\"mark\":\"seen\"} " +
  'once the session has read it. Older waiters may still send {"seen":true}; it is accepted but never writes ' +
  'seen, and the answer explains this in seenNotWritten. Any other value of seen is refused and nothing ' +
  'is written. A mark already further on stays. The row says which session was waiting for it, so a reader of ' +
  'the conversation can tell a message a live session took from one a run was started for. The mark, that ' +
  'sentence and the time are written together in one write, and when the row already says all of it nothing ' +
  'is written. NO RUN IS NAMED ON THE ROW, because nobody started one. Only the session that holds the handle ' +
  'may send this, and that is read from the hold rather than taken from the caller: otherwise anything could ' +
  'mark any message delivered with nothing behind it. The answer carries whoSentIt: who sent the message, read ' +
  'from the registries, in the words every hand-over prints; and howToAddressTheSender: how that sender asks to ' +
  'be addressed, in the words of the hand-over line, or null when the sender set no part; and fromGroup: the group ' +
  'the message was sent to, as its id and its title now, or null when it was sent to no group.' + WITH_A_KEY

const PROCESS_NOTE =
  "WRITE DOWN THE CLAUDE PROCESS THIS SESSION IS, on the record it holds this handle for. A session waiting in " +
  'its terminal writes nothing to its transcript, so its own process is what says it can still take a message. ' +
  'The start hook writes that process for the record IT filed, which is not always the record a waiter holds ' +
  'for, and a waiter started with setsid cannot walk up to its session — so this is how it says which process it ' +
  'is. THE OFFICE READS THE PROCESS ITSELF: it must be running, be the claude program, and have begun at the ' +
  'moment sent. IT MUST ALSO BE TIED TO THIS RECORD\u2019S CONVERSATION, by one of three things in this order — ' +
  'the conversation on the process\u2019s own command line, a record the start hook stamped with this same ' +
  'process, or `conversation`, which is what the shell this waiter runs in was told and is a claim rather than a ' +
  'reading. The reply says which one held. A process another record already has, and a record that already names ' +
  'a different live process, are both refused. ONLY THE AGENT ITSELF MAY SEND THIS, and only the session holding ' +
  'the handle, on the machine the hold is on. Nothing is written until every check has passed, so a refusal ' +
  'really did write nothing. It never writes which conversation a record is: one record is one run.' + WITH_A_KEY

const KNOWS_NOTE =
  'WHAT THIS AGENT ALREADY KNOWS, for a run that is about to answer a message as it. A run is a fresh process ' +
  'that has never heard of the work, so this is the rest: the agent’s own notes, read from the folder the ' +
  '`notes` field of its agent record names, and the records it has written lately. `text` is the same thing as ' +
  'one markdown page, which is what the worker writes beside the run and names in its prompt. EVERY FILE NOT ' +
  'CARRIED IS NAMED with the reason, because a bundle that stopped quietly at a limit would hand a run half of ' +
  'what an agent knows while looking complete. Nothing is ever written into the notes folder.'

// ============================================================================ what a caller sends

const whichHandle = z.object({ handle: z.string().min(1) })

/**
 * THE ONE QUERY PARAMETER THE WAITING DOOR TAKES, and what it means.
 *
 * `wait` is how many seconds THE CALLER asks the server to hold the answer, and the number is the
 * caller's: a bridge whose own request times out at twelve seconds asks for ten and is answered at
 * ten. The cap is the server's and it is thirty. A number above it is not refused, it is clamped,
 * and the reply's `capped` field says so, because a caller asking for a longer hold is asking for a
 * stronger version of a thing this door already does.
 *
 * ANYTHING THAT IS NOT A WHOLE NUMBER OF SECONDS FROM ONE UPWARDS IS NOT AN ASK TO HOLD, and the
 * door then answers exactly as it always has: the same three fields, and a row that says nothing
 * special. Absent, empty, zero, negative, fractional and a word all mean the same thing here, which
 * is "this caller is not asking me to hold". None of them is refused. Two callers depend on that.
 * The waiters already running on other machines send no parameter at all and must keep working
 * untouched. The bridges that will start sending one are other people's programs, and a bad value
 * there should cost the caller a held answer, never its whole reply: a 400 would stop a waiter dead
 * over a query string, which is the opposite of what criterion U7 is for.
 *
 * That is also why there is no zero branch in the handler: zero cannot reach it as a number.
 */
const waitingQuery = z.object({
  wait: z.preprocess((sent) => {
    const asked = typeof sent === 'string' || typeof sent === 'number' ? Number(sent) : Number.NaN
    return Number.isInteger(asked) && asked >= 1 ? asked : undefined
  }, z.number().int().min(1).optional()),
})

/** The cap on a hold, in seconds. Criterion U7: hold the request until a message arrives or this passes. */
const LONGEST_HOLD_SECONDS = 30

/**
 * THE ONE QUERY PARAMETER THE RUNNING-WORKERS DOOR TAKES: the session whose child runs are asked
 * about, or none at all.
 *
 * A session is an id and nothing else, so an empty string is refused by the schema rather than read
 * as absent. Absent is a real answer — child runs were not looked at — and the note says so.
 */
const runningWorkersQuery = z.object({
  session: z.string().min(1).optional(),
})

/**
 * WHAT THE RUNNING-WORKERS DOOR ANSWERS IN PLAIN WORDS: how many of the agents this handle started
 * have a run still running, and whether child runs under a session were looked at.
 *
 * WITH NO SESSION THE SENTENCE SAYS THEY WERE NOT LOOKED AT, and it does not say there are none:
 * "not asked about" and "none" are different facts, and only one of them is known here.
 */
function whatTheRunningWorkersAre(workers: number, runningWorkers: number, session: string | null): string {
  const children =
    session === null
      ? 'Runs filed under a session were not looked at.'
      : 'Runs filed under the session asked about were looked at too.'
  if (workers === 0) return `This handle started no agent. ${children}`
  if (runningWorkers === 0) {
    return workers === 1
      ? `The one agent this handle started has no run in state running. ${children}`
      : `None of the ${String(workers)} agents this handle started has a run in state running. ${children}`
  }
  if (workers === 1) return `The one agent this handle started has a run in state running. ${children}`
  return `${String(runningWorkers)} of the ${String(workers)} agents this handle started have a run in state running. ${children}`
}

/** The note every answer to this door carries, so the held and instant answers cannot drift apart. */
function whatTheWaiterIsTold(handle: string, waiting: readonly { messageId: string }[], keptBack = 0, asleepSince: string | null = null, reminder: string | null = null): string {
  if (asleepSince !== null) {
    const kept =
      keptBack === 0
        ? 'Nothing else is waiting.'
        : `${String(keptBack)} other message${keptBack === 1 ? ' is' : 's are'} kept back until it wakes, unchanged and unread.`
    // THE REMINDER THAT BEGAN THE SLEEP is named apart from the urgent ones, and only when it is handed.
    const reminded = waiting.some((one) => one.messageId === reminder)
    const urgent = waiting.length - (reminded ? 1 : 0)
    const handed =
      (urgent === 0
        ? 'No urgent message is waiting.'
        : `${String(urgent)} urgent message${urgent === 1 ? ' is' : 's are'} handed over.`) +
      (reminded ? ` ${THE_REMINDER_IS_HANDED_OVER_TOO}` : '')
    return `"${handle}" is asleep since ${asleepSince}, so only urgent messages are handed over. ${handed} ${kept}`
  }
  const said =
    waiting.length === 0
      ? `Nothing is waiting for "${handle}" in any project.`
      : `${String(waiting.length)} message${waiting.length === 1 ? '' : 's'} waiting for "${handle}", in every ` +
        'project, emergencies first.'
  if (keptBack === 0) return said
  return (
    `Nothing that wakes a waiter is waiting for "${handle}". ${String(keptBack)} notice${keptBack === 1 ? '' : 's'} ` +
    'Mole Office or the inspector wrote, which ask nothing of you, ' + (keptBack === 1 ? 'is' : 'are') + ' waiting too. They are ' +
    'handed over with the next message that wakes you, and they do not wake you on their own.'
  )
}

/**
 * WHAT THE WAITER IS HANDED, from everything this caller may see (problems `tXltdrCOfxsO` and
 * `rxxoHZ1MXpGY`). A notice that wakes no waiter (`whyThisWakesNoWaiter` in ../lib/notices.ts) is
 * handed over only beside a row that does wake it. When only such notices are waiting, the answer is
 * empty and `keptBack` says how many there are, so a waiter that stops for any row does not stop.
 * THIS IS THE ONE PLACE THE RULE IS APPLIED; the immediate answer, the answer at once and the held
 * answer all go through it.
 */
function whatTheWaiterIsHanded<T extends { wakesNoWaiter?: string; urgent: boolean; messageId: string }>(
  every: readonly T[],
  sleep: { beganAt: string; reminderId: string | null } | null,
): { waiting: T[]; keptBack: number; asleepSince: string | null; reminder: string | null } {
  // WHILE A RESIDENT SLEEPS, ONLY AN URGENT MESSAGE IS A CANDIDATE: the rest are kept back,
  // unchanged and unread, and counted, so the waiter is told how many and nothing is dropped. The notice rule below
  // then applies to the urgent ones as it does to every row when the resident is awake. At off, nothing is kept back.
  // THE ONE EXCEPTION is the reminder the office sent when it began this sleep at the resident's sleep time, which the
  // person decided each secretary sets for itself: it asks the resident to put its memory, notes and handover in order
  // now, so it is handed over.
  const asleepSince = sleep?.beganAt ?? null
  const reminder = sleep?.reminderId ?? null
  const rows = asleepSince === null || gatePosition('held-while-a-resident-sleeps') !== 'block' ? every : every.filter((one) => one.urgent || one.messageId === reminder)
  const asleep = every.length - rows.length
  if (rows.some((one) => one.wakesNoWaiter === undefined)) return { waiting: [...rows], keptBack: asleep, asleepSince, reminder }
  return { waiting: [], keptBack: asleep + rows.length, asleepSince, reminder }
}

/** The fields a reply adds while the resident sleeps, and none while it is awake, so an awake reply is unchanged. */
function whileAsleep(handed: { keptBack: number; asleepSince: string | null }): { asleepSince: string; keptBack: number } | Record<string, never> {
  return handed.asleepSince === null ? {} : { asleepSince: handed.asleepSince, keptBack: handed.keptBack }
}

/** The field a reply adds when a review not yet sent holds a comment for this agent, and none otherwise. */
function whatAReviewHolds(handed: { keptBackByAReview: ReturnType<typeof whatAReviewKeptBack> }): { keptBackByAReview: NonNullable<ReturnType<typeof whatAReviewKeptBack>> } | Record<string, never> {
  return handed.keptBackByAReview === null ? {} : { keptBackByAReview: handed.keptBackByAReview }
}

/** A cap that can be cancelled, so a hold that is woken does not leave a timer behind. */
function aCapAt(ms: number): { passed: Promise<'the cap passed'>; stop: () => void } {
  let resolve: ((what: 'the cap passed') => void) | null = null
  const passed = new Promise<'the cap passed'>((go) => {
    resolve = go
  })
  const timer = setTimeout(() => {
    const go = resolve
    resolve = null
    if (go !== null) go('the cap passed')
  }, ms)
  return {
    passed,
    stop() {
      clearTimeout(timer)
      resolve = null
    },
  }
}

/**
 * A CALLER THAT GOES AWAY DEREGISTERS ITS OWN HOLD.
 *
 * A registry that leaked one held request per dropped connection is the defect this piece would be
 * famous for. The socket's own `close` and `aborted` events are the only honest signs that nobody
 * is waiting for the answer, so the hold is tied to them and nothing else. The route stops listening
 * in a `finally`, so an answered request leaves no listener behind.
 */
function whenTheCallerLeaves(req: { raw: import('node:http').IncomingMessage }): {
  left: Promise<'the caller left'>
  stop: () => void
} {
  let resolve: ((what: 'the caller left') => void) | null = null
  const left = new Promise<'the caller left'>((go) => {
    resolve = go
  })
  const onClose = (): void => {
    const go = resolve
    resolve = null
    if (go !== null) go('the caller left')
  }
  req.raw.once('close', onClose)
  req.raw.once('aborted', onClose)
  return {
    left,
    stop() {
      req.raw.removeListener('close', onClose)
      req.raw.removeListener('aborted', onClose)
      resolve = null
    },
  }
}

const holdBody = z.object({
  session: z.string().min(1),
  /**
   * WHICH COMPUTER THE SESSION IS ON, in its own words, or left out.
   *
   * A waiter on another machine knows its own name and sends it. A run Mole Office started does
   * not and may not find out: asking this machine its name is asking the machine, and one
   * interface in this product does that — `OsProbe` in lib/resources.ts. Left out means the machine this
   * office is running on, which is where the office started that run, and the office is the
   * honest answer to a question it can answer itself.
   */
  machine: z.string().min(1).max(200).optional(),
  runtime: z.string().min(1).max(40),
})

const beatBody = z.object({ session: z.string().min(1) })

const releaseBody = z.object({ session: z.string().min(1), because: z.string().default('') })

/**
 * `seen: true` IS STILL ACCEPTED FOR WAITERS STARTED BEFORE THE CHANGE. A decision
 * replaces M127: the take writes delivered, and only the recipient's own act marks read.
 * Any other value is refused before anything is written.
 */
const tookBody = z.object({
  batchTurn: z.string().optional(),
  prepareOnly: z.boolean().optional(),
  session: z.string().min(1),
  message: z.string().min(1),
  seen: z
    .literal(true, { error: 'is accepted only as true for older waiters, or left out. Hand-over marks delivered. Nothing was written.' })
    .optional(),
})

/**
 * WHAT A WAITER SENDS ABOUT ITS OWN PROCESS.
 *
 * `pid` and `pidStartedAt` are what it read; the office reads them again and refuses them where they
 * do not hold. `conversation` is what the shell this waiter runs in was told it is, and it is left
 * out when the waiter's own environment did not name both a conversation and this same process —
 * because a conversation sent beside somebody else's process would tie nothing.
 */
const processBody = z.object({
  session: z.string().min(1),
  pid: z.number().int().min(1),
  pidStartedAt: z.string().min(1),
  conversation: z.string().min(1).optional(),
})

const WAITER_NOTE =
  'THE WAITER, AS A FILE, SO AN AGENT ON ANOTHER MACHINE CAN RUN IT. Criterion M77: how an agent on another ' +
  'machine mounts the listener that makes it reachable. It answers with the text of for-agents/hold-the-handle.mjs, ' +
  'as this installation is running it, and the ' +
  'sentence saying how to run it against this office. It is a READ and it changes nothing. Save it and run it with ' +
  '--api naming this office, --agent naming the handle you were registered with, and --session naming your own ' +
  'session record filed here. The script is the office\u2019s own copy, so a remote agent never runs a version ' +
  'older than the office it is holding a handle with. Reply: {"path":\u2026,"text":\u2026,"howToRunIt":\u2026,"node":\u2026}.'

// ============================================================================ the routes

/**
 * A REQUEST THAT CARRIES A CREDENTIAL MAY NAME ONLY THAT CREDENTIAL'S OWN HANDLE.
 *
 * The rule itself and the sentence it answers with live in lib/handles.ts, one function for every
 * door that names a handle in its path. This is the reading of the request: which credential it
 * carries, if any. A request with no credential returns without a word, which is what keeps every
 * local waiter working.
 */
function refuseACredentialActingOnAnotherHandle(req: FastifyRequest, handle: string): void {
  const token = credentialTokenOn(req)
  if (token === null) return
  // A blank token never reaches a handler: the credential gate refuses it first. Read as absent here
  // too, so this function says nothing about a request the gate has already answered.
  const credential = token === '' ? null : credentialForToken(token)
  if (credential === null) return
  const no = whyACredentialMayNotActOnThisHandle(credential, handle)
  if (no !== null) throw new PanelError(no, 403)
}

/**
 * THE AGENT THIS REQUEST'S OWN KEY PROVED, or null because it carried no agent key.
 *
 * Every door below that names a handle in its path resolves that handle with this in the resolver's
 * step 1 (`theAgentAHandleDoorNames` in lib/handles.ts says why). The waiter sends its agent key
 * when MOLE_AGENT_KEY is set, and then a handle a retired legacy agent's id shares is settled by the
 * key. Read off the actor `actorFrom` builds, which is where the key is worked out once.
 */
function theKeyOn(req: FastifyRequest): string | null {
  return theAgentKeyAnActorHolds(actorFrom(req))
}

/**
 * THE WORDS THAT NARROW THE HOLD LIST. A caller that names no word gets every hold, exactly as
 * before. `session` and `state` are comma lists; `shape=hold` keeps only the three fields the two
 * session-hook readers use. A word this office does not know, an empty word or a state it does not
 * have is a 400 and no hold is released or read.
 */
const listHandlesQuery = z.strictObject({
  session: z.string().optional(),
  state: z.string().optional(),
  shape: z.enum(['hold']).optional(),
})

interface TheHoldsAQueryAsks {
  sessions: ReadonlySet<string> | null
  states: ReadonlySet<HoldState> | null
}

function theWordsOfAHoldQuery(value: string, what: string): string[] {
  const words = value.split(',').map((word) => word.trim())
  if (words.some((word) => word === '')) {
    throw new PanelError(`The query's ${what} has an empty word in it. Nothing was read.`, 400)
  }
  return words
}

function theHoldsAQueryAsks(query: z.infer<typeof listHandlesQuery>): TheHoldsAQueryAsks {
  let states: ReadonlySet<HoldState> | null = null
  if (query.state !== undefined) {
    const named = theWordsOfAHoldQuery(query.state, 'state')
    const unknown = named.filter((word) => !(HOLD_STATES as readonly string[]).includes(word))
    if (unknown.length > 0) {
      throw new PanelError(
        `The query names a hold state this office does not have: ${unknown.map((one) => `"${one}"`).join(', ')}. ` +
          `The states are: ${HOLD_STATES.join(', ')}. Nothing was read.`,
        400,
      )
    }
    states = new Set(named as HoldState[])
  }
  return {
    sessions: query.session === undefined ? null : new Set(theWordsOfAHoldQuery(query.session, 'session')),
    states,
  }
}

/** The three fields the session hook reads, and nothing else. */
function theHoldAsItsShapeAnswers(hold: { session: string; handle: string; state: HoldState }) {
  return { session: hold.session, handle: hold.handle, state: hold.state }
}

export async function handleRoutes(app: FastifyInstance): Promise<void> {
  app.get('/handles', route('handle.list', 'remote', LIST_NOTE), async (req) => {
    // CHECKED BEFORE everyHold(): a bad word must not release lapsed holds on its way to a 400.
    const asked = parse(listHandlesQuery, req.query ?? {}, 'The query string is not usable:')
    const filter = theHoldsAQueryAsks(asked)
    const holds = everyHold().filter((hold) =>
      (filter.sessions === null || filter.sessions.has(hold.session)) &&
      (filter.states === null || filter.states.has(hold.state)),
    )
    return {
      holds: asked.shape === 'hold' ? holds.map(theHoldAsItsShapeAnswers) : holds,
      beatEvery: handleBeatSeconds(),
      lapsesAfter: handleLapsesAfterSeconds(),
    }
  })

  app.get('/handles/:handle', route('handle.one', 'remote', ONE_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const asked = parse(whichHandle, req.params, 'The handle asked about')
    refuseACredentialActingOnAnotherHandle(req, asked.handle)
    // THE AGENT IS READ FIRST, so a handle nobody registered is refused by name rather than answered
    // with "nobody is answering". Those are different facts and only one of them is about an agent.
    const agent = theAgentAHandleDoorNames(asked.handle, theKeyOn(req))
    if (agent === null) {
      throw new PanelError(
        `No durable agent in this installation has the handle "${asked.handle}". GET /api/participants lists ` +
          'every agent that is registered.',
        404,
      )
    }
    // THE TWO NUMBERS COME WITH THE ANSWER, because every reader has to compare the hold's silence
    // against them: the session hook, to tell a hold something is still beating from one whose
    // waiter has stopped without letting go, and anybody asking how long a quiet one has left.
    // WHO ANSWERS IS READ ON ONE READING OF EVERY PROCESS, made without holding the thread (Windows;
    // `readEveryProcessFirst` in src/config/session-process.mjs), and only when that reading will ask about a process.
    const answering = whoIsAnsweringAsAsksAboutAProcess(agent.id, workspaceId)
      ? await readEveryProcessFirst(() => whoIsAnsweringAs(agent.id, workspaceId))
      : whoIsAnsweringAs(agent.id, workspaceId)
    return {
      handle: agent.handle,
      answering,
      beatEvery: handleBeatSeconds(),
      lapsesAfter: handleLapsesAfterSeconds(),
      workspaceId,
      // WHICH PROJECT THIS AGENT'S OWN RECORD IS IN. F15 point 1; problem `kXXiGKoVoGQN`. A waiter
      // whose session record answers nothing needs a second place to learn the project from, and the
      // registry row is the installation's, so this is answered without a project header. Null is a
      // real answer: an agent with no record here falls back to the checkout's `.env`.
      agentRecordProject: theProjectOfTheAgentRecord(agent.id),
    }
  })

  /**
   * THE WAITER ITSELF, SERVED AS TEXT. Criterion M77.
   *
   * ---------------------------------------------------------------------------------------
   * WHY THE OFFICE SERVES ITS OWN SCRIPT
   * ---------------------------------------------------------------------------------------
   *
   * An agent on another machine can already hold a handle here: `for-agents/hold-the-handle.mjs --api
   * <this office>` works from any directory, all six handle routes are declared `remote`, and it was
   * measured doing exactly that on 7 September 2026. What it could not do is GET the script. Copying
   * it into the skill would be a second copy of a file that changes, and a remote agent running an
   * old copy against a new office is the failure nobody would see.
   *
   * IT IS READ OFF DISK ON EVERY CALL, from this checkout, so what is served is what this
   * installation is running rather than what it was running when it started.
   */
  app.get('/handles/waiter', route('handle.waiter', 'remote', WAITER_NOTE), async (req) => {
    const path = join(REPO_ROOT, THE_FOR_AGENTS_FOLDER, 'hold-the-handle.mjs')
    const reachable = addressForOtherMachines(settings())
    const text = await theWaiterAsOneFile(path)
    return {
      path,
      text,
      bundled:
        'One file, built from the script this installation runs with everything it imports, so it runs with nothing ' +
        'but Node in an empty folder. Save it and run it; do not look for the modules it names.',
      ...whatTheWaiterSaysAboutTheAddress(reachable),
      node: 'Node 22 or later. The waiter uses fetch and the open connection this office keeps for waiting agents.',
      workspaceId: workspaceOf(req),
    }
  })

  app.get('/handles/:handle/knows', route('handle.knows', 'remote', KNOWS_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const asked = parse(whichHandle, req.params, 'The handle asked about')
    refuseACredentialActingOnAnotherHandle(req, asked.handle)
    // NO MESSAGE THE CALLER MAY NOT READ is among the records it is shown. The
    // message worker, which reads this for the run it starts, reads every message.
    const known = whatTheAgentKnows(asked.handle, workspaceId, everyMessageHiddenFrom(theMessageReader(actorFrom(req)), workspaceId))
    return { ...known, text: theBundleAsText(known), workspaceId }
  })

  app.post('/handles/:handle/hold', route('handle.hold', 'remote', HOLD_NOTE), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const asked = parse(whichHandle, req.params, 'The handle to hold')
    refuseAnActWithNoKey(req, A_HOLD)
    refuseACredentialActingOnAnotherHandle(req, asked.handle)
    const body = parse(holdBody, req.body, 'The session that is answering')
    // A CALLER THAT NAMED NO MACHINE IS ON THIS ONE, read through `thisMachine`, which is the one
    // reader in this product of what the machine calls itself. A name nothing could read is
    // refused rather than stored empty: a hold says which computer is answering as an agent, and
    // one that cannot say which is not one.
    const machine = body.machine ?? thisMachine()
    if (machine === null || machine.trim() === '') {
      throw new PanelError(
        'This request named no machine and this one could not say what it is called, so nothing was written. A ' +
          'hold says which computer is answering as an agent, and a hold that cannot say which is not one. Send ' +
          '{"machine": "…"} naming the computer this session is on.',
        400,
      )
    }
    const claimed = holdTheHandle({ handle: asked.handle, workspaceId, ...body, machine, keyHolder: theKeyOn(req) })
    reply.code(201)
    return {
      ...claimed,
      beatEvery: handleBeatSeconds(),
      lapsesAfter: handleLapsesAfterSeconds(),
      workspaceId,
    }
  })

  app.post('/handles/:handle/beat', route('handle.beat', 'remote', BEAT_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const asked = parse(whichHandle, req.params, 'The handle being held')
    refuseACredentialActingOnAnotherHandle(req, asked.handle)
    const body = parse(beatBody, req.body, 'Which session is saying it is there')
    return { hold: beatTheHold(asked.handle, body.session, theKeyOn(req)), lapsesAfter: handleLapsesAfterSeconds(), workspaceId }
  })

  app.get('/handles/:handle/waiting', route('handle.waiting', 'remote', WAITING_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const asked = parse(whichHandle, req.params, 'The handle being held')
    refuseACredentialActingOnAnotherHandle(req, asked.handle)
    const agent = theAgentAHandleDoorNames(asked.handle, theKeyOn(req))
    if (agent === null) {
      throw new PanelError(`No durable agent in this installation has the handle "${asked.handle}".`, 404)
    }
    const query = parse(waitingQuery, req.query ?? {}, 'How long to hold this answer')
    // THE CALLER'S OWN RUN'S HELD MESSAGES GO FIRST, so it never reads an answer to words it has not sent (lib/turn-drafts.ts).
    sendTheHeldDraftsOfThisRequestsRun(req)
    // ONLY THE MESSAGES THE CALLER MAY READ. An agent's own waiter reads its own
    // queue whole; another agent asking about this handle is shown only what it is a party to, and
    // nothing, not even a count, of the rest. Every read of the queue below goes through this.
    const reader = theMessageReader(actorFrom(req))
    const whatThisCallerMaySee = (): ReturnType<typeof everythingWaitingFor> => {
      const every = everythingWaitingFor(agent.id)
      const kept = theMessagesThisReaderMayRead(reader, every.map((one) => one.messageId))
      return every.filter((one) => kept.has(one.messageId))
    }
    // WHAT IS HANDED NOW, with the resident's sleep read at the same moment, so a wake between two reads is seen.
    // NOT A COMMENT A REVIEW NOT YET SENT HOLDS, the way the worker holds it. It does not end a
    // hold, and the answer says how many were left out in `keptBackByAReview`. The send wakes the waiter with the
    // review's one message, which carries the words.
    const handedNow = () => {
      const mayRead = whatThisCallerMaySee()
      const held = theCommentsAReviewIsHolding(mayRead.map((one) => one.messageId))
      const handed = {
        ...whatTheWaiterIsHanded(mayRead.filter((one) => !held.has(one.messageId)), theOpenSleepOf(agent.id)),
        keptBackByAReview: whatAReviewKeptBack(held.size),
      }
      const trigger = handed.waiting.find((one) => one.wakesNoWaiter === undefined && !one.heldForBatch && one.batchTurn === undefined)
      if (trigger === undefined) return { ...handed, waiting: handed.waiting.filter((one) => !one.heldForBatch) }
      if (!handed.waiting.some((one) => one.heldForBatch)) return handed
      const batch = prepareNoticeBatch({ kind: 'agent', id: agent.id }, 'handover:' + trigger.messageId)
      const ids = new Set(batch.messages.map((one) => one.messageId))
      return {
        ...handed,
        waiting: handed.waiting.filter((one) => !one.heldForBatch || ids.has(one.messageId)).map((one) => ({
          ...one,
          ...(ids.has(one.messageId) ? { batchTurn: batch.turn } : {}),
        })),
      }
    }

    // NOBODY ASKED ME TO HOLD, SO ANSWER AT ONCE, EXACTLY AS THIS DOOR ALWAYS HAS. The waiters
    // already running on other machines send no parameter and will not be updated when this merges;
    // a door that started holding them would stop their work. A caller that sent a value this door
    // cannot read as a number of seconds arrives here too, by the rule on `waitingQuery`, and gets
    // the same answer rather than a refusal. This is the same three fields, byte for byte.
    if (query.wait === undefined) {
      const handed = handedNow()
      return { waiting: handed.waiting, workspaceId, note: whatTheWaiterIsTold(asked.handle, handed.waiting, handed.keptBack, handed.asleepSince, handed.reminder), ...whileAsleep(handed), ...whatAReviewHolds(handed) }
    }

    // THE NUMBER OF SECONDS IS THE CALLER'S AND THE CAP IS THE SERVER'S. A bridge whose own request
    // times out at twelve seconds asks for ten and is answered at ten, not at thirty.
    const askedForSeconds = query.wait
    const capped = askedForSeconds > LONGEST_HOLD_SECONDS
    const holdForSeconds = Math.min(askedForSeconds, LONGEST_HOLD_SECONDS)

    // REGISTER BEFORE THE READ. A delivery written in the gap between the two is either seen by the
    // read or wakes the registration; the other order loses it until the cap. This ordering is the
    // one thing the wake depends on.
    let hold = registerAWaiter(agent.id)
    // A NOTICE THAT WAKES NO WAITER DOES NOT BEAT THE HOLD EITHER. Otherwise one queued notice would
    // answer every call at once, which is the shape of problem FQWy7ra9lhTx.
    const first = handedNow()
    const already = first.waiting
    if (already.length > 0) {
      hold.stop()
      return {
        waiting: already,
        workspaceId,
        note: whatTheWaiterIsTold(asked.handle, already, first.keptBack, first.asleepSince, first.reminder),
        ...whileAsleep(first),
        ...whatAReviewHolds(first),
        held: false,
        heldForSeconds: 0,
        endedBecause: 'something was already waiting',
        capped,
        askedForSeconds,
      }
    }

    // IT REALLY HELD. Mark this one request a long poll. The route declares no `waits`, on purpose:
    // the mark is for the requests this door really held and not for the ones it answered at once.
    // Since criterion U6 this operation is counted by the hour, so an answered call of either kind
    // writes no row for the mark to sit on; `thisCallIsHeld` says so in its own header.
    thisCallIsHeld(req)
    const startedAt = Date.now()
    const cap = aCapAt(holdForSeconds * 1000)
    const leaving = whenTheCallerLeaves(req)
    let endedBecause: 'a message arrived' | 'the cap passed' | 'the caller left'
    try {
      for (;;) {
        endedBecause = await Promise.race([
          hold.woken.then(() => 'a message arrived' as const),
          cap.passed,
          leaving.left,
        ])
        if (endedBecause !== 'a message arrived') break
        // A MESSAGE THIS CALLER MAY NOT READ DOES NOT END THE WAIT. The queue is
        // read again; when something is waiting on it and the caller may read none of it, the wait goes
        // on until the cap, so when the answer comes says nothing about a message the caller may not read.
        // A caller who may read what arrived, and a wake that finds the queue empty, end the wait as before.
        // A NOTICE THAT WAKES NO WAITER does not end it either (problems tXltdrCOfxsO and rxxoHZ1MXpGY).
        if (everythingWaitingFor(agent.id).length === 0 || handedNow().waiting.length > 0) break
        hold.stop()
        // REGISTERED AGAIN BEFORE THE NEXT READ, for the reason the first registration is: a delivery in
        // the gap is either seen by the read or wakes the new registration.
        hold = registerAWaiter(agent.id)
        if (handedNow().waiting.length > 0) break
      }
    } finally {
      cap.stop()
      leaving.stop()
      hold.stop()
    }
    const handed = handedNow()
    const waiting = handed.waiting
    return {
      waiting,
      workspaceId,
      note: whatTheWaiterIsTold(asked.handle, waiting, handed.keptBack, handed.asleepSince, handed.reminder),
      ...whileAsleep(handed),
      ...whatAReviewHolds(handed),
      held: true,
      heldForSeconds: Math.round((Date.now() - startedAt) / 1000),
      endedBecause,
      capped,
      askedForSeconds,
    }
  })

  app.get('/handles/:handle/running-workers', route('handle.running-workers', 'remote', RUNNING_WORKERS_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const asked = parse(whichHandle, req.params, 'The handle asked about')
    refuseACredentialActingOnAnotherHandle(req, asked.handle)
    const agent = theAgentAHandleDoorNames(asked.handle, theKeyOn(req))
    if (agent === null) {
      throw new PanelError(`No durable agent in this installation has the handle "${asked.handle}".`, 404)
    }
    const query = parse(runningWorkersQuery, req.query ?? {}, 'The session whose child runs are asked about')
    const session = query.session ?? null
    const read = theRunningWorkersOf(agent, workspaceId, session)
    return {
      handle: asked.handle,
      agent: agent.id,
      workers: read.workers,
      running: read.running,
      session,
      note: whatTheRunningWorkersAre(read.workers, read.runningWorkers, session),
      workspaceId,
    }
  })

  app.post('/handles/:handle/took', route('handle.took', 'remote', TOOK_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const asked = parse(whichHandle, req.params, 'The handle being held')
    refuseAnActWithNoKey(req, A_HAND_OVER)
    refuseACredentialActingOnAnotherHandle(req, asked.handle)
    const body = parse(tookBody, req.body, 'Which session was given which message')
    // THE REPLY CARRIES THE MESSAGE'S WORDS, and this door does not ask whether the caller is the agent
    // the handle names. So a caller who may not read the message is refused before anything is written
    // . A waiter taking a message addressed to its own agent is a party to it.
    refuseAMessageThisReaderMayNotRead(theMessageReader(actorFrom(req)), body.message, 'refuse')
    const agent = theAgentAHandleDoorNames(asked.handle, theKeyOn(req))
    if (agent === null) {
      throw new PanelError(
        `No durable agent in this installation has the handle "${asked.handle}". Nothing was written.`,
        404,
      )
    }
    const moved = theLiveSessionTookIt(body.message, { kind: 'agent', id: agent.id }, body.session, workspaceId, body.batchTurn, body.prepareOnly)
    // WHERE THE MESSAGE WAS WRITTEN IS IN THE REPLY, as `writtenIn`. A message belongs to no
    // project, so an answer joins the conversation wherever it is written, and the waiter says where the words were said,
    // not where to answer. `workspaceId` stays and is the project the waiter asked from, which is not the same fact.
    const message = readMessageWhereverItIs(body.message).message
    // WHO SENT IT, in the words every hand-over prints (problem ynGL0myEnAbi), AND HOW THAT SENDER ASKS
    // TO BE ADDRESSED, null when there is no line to print. The waiter passes
    // both to the envelope unchanged; it has no registry to read them from.
    // AND THE GROUP IT WAS SENT TO, or null for a direct message, as item 5 of
    // a decision says. The envelope's first line names it and asks for the answer there.
    return {
      message, ...theSenderForAHandOver(message.sentBy), fromGroup: theGroupForAHandOver(message.toGroup), ...moved, workspaceId,
      ...(body.seen === true ? {
        seenNotWritten: "Handing a message over marks it delivered. Read is the recipient's own mark: " +
          `POST /api/messages/${body.message}/mark {"mark":"seen"} once the session has read it.`,
      } : {}),
    }
  })

  /**
   * THIS SESSION'S OWN PROCESS, WRITTEN DOWN AFTER THE OFFICE HAS READ IT.
   *
   * KEPT ON THIS MACHINE, and that is the whole reason it is a door of its own rather than a field
   * on the hold: the hold door is `remote`, a waiter on another computer holds handles through it,
   * and a process number from another computer names a process in the wrong table. The refusal is
   * published by GET /api/access, so nothing draws a control for it from elsewhere.
   *
   * The checks, the refusals and the one write are in src/server/lib/held-process.ts, beside the
   * sentences that name them.
   */
  app.post(
    '/handles/:handle/process',
    route(
      'handle.process',
      'local',
      {
        because: 'acts-on-this-machine',
        act: "Recording the process of a session",
      },
      PROCESS_NOTE,
    ),
    async (req) => {
      const workspaceId = workspaceOf(req)
      const asked = parse(whichHandle, req.params, 'The handle being held')
      refuseAnActWithNoKey(req, A_PROCESS)
      refuseACredentialActingOnAnotherHandle(req, asked.handle)
      const body = parse(processBody, req.body, "The session's own process")
      // THE PROCESS IS READ ON ONE READING OF EVERY PROCESS, made without holding the thread (Windows;
      // `readEveryProcessFirst` in src/config/session-process.mjs).
      const done = await readEveryProcessFirst(() =>
        recordTheSessionsProcess({
          handle: asked.handle,
          session: body.session,
          pid: body.pid,
          pidStartedAt: body.pidStartedAt,
          conversation: body.conversation ?? null,
          workspaceId,
          actor: actorFrom(req),
        }),
      )
      return { ...done, workspaceId }
    },
  )

  app.post('/handles/:handle/release', route('handle.release', 'remote', RELEASE_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const asked = parse(whichHandle, req.params, 'The handle to let go')
    refuseAnActWithNoKey(req, A_RELEASE)
    refuseACredentialActingOnAnotherHandle(req, asked.handle)
    const body = parse(releaseBody, req.body, 'Which session is letting go, and why')
    return { hold: letTheHandleGo(asked.handle, body.session, body.because, theKeyOn(req)), workspaceId }
  })
}
