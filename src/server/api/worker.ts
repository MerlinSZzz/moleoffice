// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { prepareNoticeBatch } from '../../holder/notice-batches.ts'
import { fixedOnMain, noteTakeBackNeedsAPerson, submitATakeBack } from '../lib/take-back.ts'
import { sayInEnglish } from '../../shared/i18n.ts'
import { recordInWorkspace } from '../lib/records.ts'
/**
 * THE DOORS FOR THE MESSAGE WORKER, AND THE WORKER IS A SEPARATE PROCESS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE WORKER COMES IN THROUGH HTTP LIKE EVERYBODY ELSE
 * ---------------------------------------------------------------------------------------
 *
 * Agents write through the API. The message worker is a process Mole Office starts. If it opened
 * the database itself, it would be a writer whose rows nothing validated. So it reads the queue
 * here, says what it did here, and holds no database path at all.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EACH DOOR IS FOR
 * ---------------------------------------------------------------------------------------
 *
 *   GET  /api/worker/queue                    every message still waiting for a run
 *   GET  /api/worker/runs                     every run already going, so a restarted worker finds them
 *   GET  /api/worker/waits                    every run holding its conversation open for the next message
 *   GET  /api/worker/merges                   the merge entries the office wants its merge tool for, and its runs
 *   POST /api/worker/gates/run-out            ended gate choices are removed and the office records each fallback
 *   POST /api/worker/merges/:entry/hour-over  a resolving merge entry's time to resolve is over: the queue bounces it
 *   POST /api/worker/waits/:session/over      that wait ran out: say so in the conversation
 *   POST /api/worker/runs/:session/cut-off    a restart cut this run off: end it and say so
 *   POST /api/worker/messages/:id/taken       a run has taken it: the clock becomes a tick
 *   POST /api/worker/messages/:id/needs-no-run  a line Mole Office wrote: delivered, and no run started
 *   POST /api/worker/messages/:id/held        nothing could be started, and why, in one sentence
 *   POST /api/worker/messages/:id/answered    what the run said, filed as the agent's reply
 *
 * ---------------------------------------------------------------------------------------
 * WHAT STOPS SOMETHING ELSE CALLING THESE
 * ---------------------------------------------------------------------------------------
 *
 * Not the actor name. An actor header is a claim, and this product's standing answer to an actor
 * nobody registered is to name it and let the write through (criterion F1's pattern). What actually
 * guards the one dangerous door — `answered`, which files words under an agent's name — is that the
 * run has to exist, be in this project, and have been serving that agent. `whyThisReplyIsRefused`
 * in lib/worker.ts is that check, and a caller that cannot show such a run is refused.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { gateNumber } from '../../config/settings.mjs'
import { MESSAGE_HOLDS, type MessageHold } from '../../config/gates.mjs'
import { gateMet } from '../lib/gate-counts.ts'

import { PARTICIPANT_KINDS } from '@shared/participants.ts'
// Shared interface assumption: the polling worker exports this marker from this module.
import { MERGE_QUEUE_SNAPSHOT_CHANGING } from '@shared/merge-queue-snapshot.ts'

import { actorFrom, takesNoBody } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { itChangesSomething, route } from '../lib/route.ts'
import { theMergeEntry } from '../lib/merge-queue.ts'
import { aWaitingStarterChangeSays } from '../lib/agent-starter.ts'
import { sqlite } from '../db/client.ts'
import { theFiledAliasesReadOnce } from '../lib/registry-aliases/runs.ts'
import { theHourIsOver } from '../lib/merge-state-machine.ts'
import { runOutGateChoices } from './runtime-settings.ts'
import { readMessage, refuseAMessageThisReaderMayNotRead, theMessageReader, theMessagesThisReaderMayRead, type AMessageReader } from '../lib/messages.ts'
import {
  A_HELD_SENTENCE_AT_MOST,
  QUEUE_DECISION_FIELDS,
  QUEUE_PAGE_SIZE,
  theNextQueueCandidates,
  countReadableDeadLetters,
  type QueueCandidate,
  type QueueCursor,
  aRunTookIt,
  deadLettersInTheQueue,
  deliveryIdsInheritedFromTheCopy,
  fileTheReply,
  howLongARunWaits,
  mergesForTheWorker,
  noRunIsNeeded,
  markSettledAsksDelivered,
  type QueueFailure,
  type SettledAskDelivery,
  runsToPickUp,
  runsWaitingForTheNextMessage,
  sayWhereItStands,
  tellTheGroupTheAgentsAreWaiting,
  tellTheStarterTheCapStopped,
  theQueueWithoutHoldingTheServer,
  theProcessesThePickUpReads,
  theRunWasCutOff,
  theWaitIsOver,
  whereAnAnswerGoes,
} from '../lib/worker.ts'
import { THE_WORKER } from '@shared/the-worker-actor.ts'
import { theSenderForAHandOver, theSendersReadOncePerAnswer } from '../lib/who-sent-it.ts'
import { getRecord } from '../lib/records.ts'
import { PanelError } from '../lib/panel-error.ts'
import { tellTheSecretaryACheckWaitsItsTurn } from '../lib/checks-an-hour.ts'
import { answeringOfTheAgentsTheseRunsServeMayHaveChanged } from '../lib/answering-told.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { readFirst } from '../lib/resources.ts'

// ============================================================================ what a body may say

const whichParticipant = z.object({ kind: z.enum(PARTICIPANT_KINDS), id: z.string().min(1) })

const takenBody = z
  .object({
    prepareOnly: z.boolean().optional(),
    to: whichParticipant,
    session: z.string().min(1),
    runtime: z.string().min(1),
    because: z.string().min(1).max(500),
    /** The holds whose gate is off and which would have held this message at block. */
    wouldHaveHeld: z.array(z.enum(MESSAGE_HOLDS)).optional(),
  })
  .strict()

const needsNoRunBody = z
  .object({
    to: whichParticipant,
    /** The holds whose gate is off and which would have held this message at block. */
    wouldHaveHeld: z.array(z.enum(MESSAGE_HOLDS)).optional(),
  })
  .strict()

/**
 * EACH HOLD WHOSE GATE IS OFF AND WHICH WOULD HAVE HELD THE MESSAGE AT BLOCK is counted as one that would have stopped
 * work: at the taken door when the run it let through takes the message, and at the needs-no-run door when a line
 * Mole Office wrote is delivered without a run. Each gate is named on its own line, so the gate list's test finds
 * where each one is counted.
 */
function countTheHoldsItWentPast(wouldHaveHeld: readonly MessageHold[] | undefined): void {
  if (wouldHaveHeld?.includes('held-by-a-notice-rule')) gateMet('held-by-a-notice-rule', 'off')
  if (wouldHaveHeld?.includes('held-while-a-resident-sleeps')) gateMet('held-while-a-resident-sleeps', 'off')
  if (wouldHaveHeld?.includes('held-by-an-unsent-review')) gateMet('held-by-an-unsent-review', 'off')
  if (wouldHaveHeld?.includes('wait-for-the-persons-start')) gateMet('wait-for-the-persons-start', 'off')
}

const heldBody = z
  .object({
    to: whichParticipant,
    because: z.string().min(1).max(A_HELD_SENTENCE_AT_MOST),
    gate: z.enum(['worker-runs', 'agent-hops', ...MESSAGE_HOLDS]).optional(),
    /**
     * The sentence the caller last wrote on this row, when it is writing over its own words.
     *
     * Where the row says something else, somebody wrote it since and their sentence is kept: the
     * write is skipped and the reply says `written: false` with what the row does say. Leave it out
     * to write whatever is there. See `sayWhereItStands` in lib/worker.ts for the measurement.
     */
    replacing: z.string().max(500).optional(),
  })
  .strict()

const answeredBody = z
  .object({
    to: whichParticipant,
    agent: whichParticipant,
    fromRun: z.string().min(1),
    body: z.string().min(1),
    because: z.string().min(1).max(500),
  })
  .strict()

// ============================================================================ the sentences

const QUEUE_NOTE =
  'Every message in this project still waiting for a run, oldest first. A message is here when its delivery row ' +
  'for an agent is still marked queued. A plain call answers each message id and title with its recipient and ' +
  'the fields the worker needs to decide whether to start it. ?full=1 answers the whole entry: who sent it, as ' +
  'the stored participant and as whoSentIt, the words every hand-over prints, read from the registries, and ' +
  'howToAddressTheSender, how that sender asks to be addressed or null when it set no part, and fromGroup, ' +
  'the group it was sent to as its id and its title now, or null when it was sent to no group; the agent it is ' +
  'for with the runtime word on its registry row, the newest conversation that agent had here with the runtime ' +
  'word that made it, how many agents have answered each other since a person last said anything, and whether ' +
  'a run is already serving that agent. ?full=1 with messageId and recipientId together reads that delivery ' +
  'even if its mark has changed. Reading the queue starts no run. Only ?only=checks&markDelivered=1 moves marks: ' +
  'it marks settled asks the caller may read delivered, with their reason, once, and lists them in ' +
  'markedDelivered instead of queue. Other readings write nothing. A DELIVERY THAT COULD NOT BE WORKED OUT, ' +
  'because a read for it failed, is not in queue: failed gives its messageId, to and because, the sentence that ' +
  'says why, with the error cut where it is too long for a delivery and said cut. ?full=1 adds its handle, ' +
  'workspaceId and error, the error’s whole words. The other deliveries are answered as usual. Such a delivery ' +
  'stays queued, and the message worker writes the sentence on it. Dead letters are counted with a note; ' +
  '?full=1 also lists their rows. Ask ?only=checks for only entries carrying inspection or askOfASettledRun: ' +
  'true, with the same fields and order as the whole reading. That reading omits unrelated queued deliveries ' +
  'and dead letters. THE BODIES ARE NOT HERE BY DEFAULT: a polling reader mostly starts no run, and the words ' +
  'of every message it did not start were bytes on the wire for nothing. Ask ?full=1 to have every entry carry ' +
  'its message’s words too, as this door answered before; a caller start that needs the words needs them from ' +
  'one message record, which GET /api/records/:messageId carries.'

const RUNS_NOTE =
  'Every run of this project that was going when a worker stopped, with everything a worker needs to pick it back ' +
  'up: the session record it filed, the message it is delivering, the agent it serves, the tool it is a run of, the ' +
  'conversation id it said, the process and its group, what the delivery row says now, and whoSentIt: who sent the ' +
  'message, read from the registries, in the words every hand-over prints, and howToAddressTheSender: how that ' +
  'sender asks to be addressed, or null when it set no part, and fromGroup: the group the message was sent to, as ' +
  'its id and its title now, or null when it was sent to no group, and intent: the person\'s mark on the message, ' +
  'absent when it has none. A worker keeps the runs ' +
  'it is watching in memory and the API server restarts on every merge, so without this the answer of a run in ' +
  'flight is never filed. A run whose process has already ended is here too, and that is the case that matters: the ' +
  'worker reads its output and files the answer that was sitting on disk. IT ACTS ON NOTHING: reading this starts ' +
  'no run, stops none and moves no mark.'

const WAITS_NOTE =
  'Every run of this project that has answered and is holding its conversation open for the next message. A run ' +
  'answers and its process ends, but the tool can pick that conversation up again by its own id, so for ' +
  'MOLE_OFFICE_RUN_WAITS_MINUTES minutes the next message to that agent is answered inside it. Each entry says ' +
  'when the wait ends, how many minutes are left, and whether the moment has passed with nothing having said so ' +
  'yet. IT ACTS ON NOTHING: reading this ends no wait and writes nothing.'

const MERGES_NOTE =
  'What the office wants its merge tool for, and which merge tool runs are going. Sandbox v1: the message worker ' +
  'starts tools/the-merger.mjs, which runs no model, for a merge entry the office has marked — one whose next move ' +
  'is the merge tool\'s: pinning a submitted entry, and integrating, testing and landing one that holds its lane. ' +
  '"wanted" is those entries that no tool run holds, oldest submission first; the worker starts one at a time, in ' +
  'a slot of its own beside the agent runs. "going" is every merge tool run that has not ended, with the process ' +
  'its ledger row names, "stop" when the office wants it stopped because its entry was withdrawn or superseded, ' +
  'and "startupFailed" when its worker ended before the process was registered. ' +
  '"hourOver" is every resolving entry whose own supervisor\'s time to resolve is over, and "hourCannotBeRead" names every ' +
  'resolving entry whose time to resolve cannot be read, with the sentence that says so. IT ACTS ON NOTHING: reading this ' +
  'starts no tool, stops none and writes nothing; the worker asks for a bounce at POST /api/worker/merges/:entry/hour-over.'

const HOUR_OVER_NOTE =
  'A resolving merge entry has used the time set for resolving a conflict on the Gates panel, and this asks the queue to bounce it. The worker asks this for an entry ' +
  'GET /api/worker/merges listed under "hourOver". THE QUEUE DECIDES FROM WHAT IT STORES, so the caller proves ' +
  'nothing: the entry is re-read here, and its end is read from the start, zone and minutes fixed at its first conflict. An entry stored without minutes was given 60 minutes when it started. The bounce keeps ' +
  'the reason "conflict" and one of two closed words: "the hour ran out" when no resolution was handed over in that ' +
  'time, and "could not be read" when the merge tool\'s check refused the last resolution. An entry handed on for tests ' +
  'red only with it keeps the reason "red" and the closed word "not fixed in the hour", whether no fix was handed over ' +
  'or the check refused the last one. A resolution handed over ' +
  'within that time that waits for the check is never bounced by its end. IT IS REFUSED, IN THIS ORDER, FOR: an ' +
  'entry that is not in this project (404); a caller that is not the office\'s message worker (403); a body that ' +
  'is not empty or absent (400); an entry that is not resolving, a time to resolve that has not ended yet, and a resolution ' +
  'that waits for its check (409 each); and an entry whose end cannot be read (500, in words). NOTHING IS WRITTEN ' +
  'on any refusal.'

const WAIT_OVER_NOTE =
  'This run waited for the next message, none came, and this says so in the conversation it was serving. The words ' +
  'are written here and not sent in, so nothing can put a sentence in Mole Office\'s mouth. IT IS REFUSED FOR A RUN ' +
  'THAT IS NOT WAITING, including one whose wait has not run out yet: everything it needs is stored, so the caller ' +
  'proves nothing and decides nothing. It is refused a second time for the same run, because the line it wrote is ' +
  'what says the wait is over.'

const CUT_OFF_NOTE =
  'A restart of this API cut this run off before it answered, and this ends it and says so. The run is marked ' +
  'crashed with the reason, and the delivery row says what happened. Where a newer run of the same agent has ' +
  'picked the same conversation up, the row says the answer is still coming and nothing is written into the ' +
  'conversation; where there is none, one line naming the restart goes into the conversation, because a person ' +
  'waiting for an answer that is never coming has to be told. IT IS REFUSED FOR ANY OTHER RUN: Mole Office must ' +
  'have started it to deliver a message, its record must still say running, nothing may be alive holding it, and ' +
  'it must have been filed before this server process loaded. A run a person stopped fails the third of those, ' +
  'because stopping it ended its record.'

const TAKEN_NOTE =
  'A run has taken this message, so the clock beside it becomes a tick. The caller says which run, by the session ' +
  'record it filed, and why in one sentence a person reads on the row. The mark only ever moves forward; sending ' +
  'this twice for one message writes the sentence again and moves nothing.'

const NEEDS_NO_RUN_NOTE =
  'This message is a line Mole Office wrote — a group was opened, a member was added, two claims are in conflict — ' +
  'and a line like that is for people to read. The mark moves to delivered with a sentence saying so, and no run is ' +
  'started, so nothing is spent answering the product. IT IS REFUSED FOR ANY OTHER MESSAGE: the sender on the ' +
  'stored message has to be Mole Office itself. A message that could have a run is either taken by one or held with ' +
  'the reason why.'

const HELD_NOTE =
  'Nothing could be started for this message, and this is why. The mark stays queued and the clock stays, which is ' +
  'the honest answer: the tool is not installed, too many runs are already going, or the agents have said as much ' +
  'as they may without a person. The sentence is drawn beside the clock, so a person is never left looking ' +
  'at a clock that means nothing. Send "replacing" with the sentence you last wrote here and the write is skipped ' +
  'if the row says something else, because somebody wrote that since and knew something you do not. The reply says ' +
  'whether it was written and what the row says now. Send the optional gate field as worker-runs or agent-hops ' +
  'to count a changed delivery held by that number. An unchanged row and an omitted gate add no count. ' +
  'When the message is a check that waits its turn under its ' +
  "lane's hourly cap, the secretary is told once, and the reply's secretary field says how."

const ANSWERED_NOTE =
  'What a run said, filed as a message from the agent that run was serving. An answer to a message written into a ' +
  'group goes to that group, so every member reads it where the question was asked; an answer to a message between ' +
  'two participants goes back to whoever sent it. The reply carries the run it came out of, so a reader can open ' +
  'the run and see what it was given. IT IS REFUSED WHEN THE RUN CANNOT BE SHOWN: the run must exist, be a session record in this project, and ' +
  'have been started to serve that agent. An agent never has words put in its mouth by a caller that cannot point ' +
  'at the run they came from.'

/** HOW THE QUEUE IS ASKED FULL. Nothing but the value 1 narrows to a body by accident, and anything
 * else is refused rather than read as its absence: a `?full=0` that carried bodies would make two
 * spellings of "full" and the truthful one is the one the caller can see was asked for. */
const fullQuery = z.strictObject({
  page: z.literal('1').optional(),
  cursor: z.string().min(1).optional(),
  only: z.literal('checks').optional(),
  messageId: z.string().min(1).optional(),
  recipientId: z.string().min(1).optional(),
  markDelivered: z.literal('1', { error: 'markDelivered must be exactly 1: ?only=checks&markDelivered=1 marks settled asks delivered' }).optional(),
  full: z
    .literal('1', { error: 'full must be exactly 1: ?full=1 asks every entry to carry its message\'s words' })
    .optional(),
}).refine(q => (q.page === '1' || q.cursor === undefined) && (q.page === undefined || (q.only === undefined && q.full === undefined && q.messageId === undefined && q.recipientId === undefined && q.markDelivered === undefined)), { message: 'Pages are a narrow queue reading and the cursor needs page=1.' })
  .refine(q => q.markDelivered === undefined || q.only === 'checks', { message: 'markDelivered=1 goes with only=checks. Nothing was read or marked.' })
  .refine(q => (q.messageId === undefined && q.recipientId === undefined) || (q.full === '1' && q.messageId !== undefined && q.recipientId !== undefined && q.markDelivered === undefined), { message: 'messageId and recipientId go together with full=1 and no marking. Nothing was read.' })

// ============================================================================ the routes

/** Refuse, inside the function that works out a run's message, a message the caller may not read. */
function theCallerMayRead(reader: AMessageReader): (messageId: string) => void {
  return (messageId) => refuseAMessageThisReaderMayNotRead(reader, messageId, 'refuse')
}

export async function workerRoutes(app: FastifyInstance): Promise<void> {
  // The tool writes this list into the copy before the server starts. Keeping the IDs in the
  // world's directory makes the boundary survive an API restart.
  const inheritedDeliveryIds = deliveryIdsInheritedFromTheCopy()

  app.get(
    '/worker/queue',
    itChangesSomething(
      route('worker.queue', 'local', { because: 'starts-work-on-this-machine', act: 'Reading the work waiting for a run here' }, QUEUE_NOTE),
      (query) => query.markDelivered === '1',
    ),
    async (req) => {
      const workspaceId = workspaceOf(req)
      const q = parse(fullQuery, req.query, 'The query string is not usable:')
      let pageCursor: QueueCursor | null = null
      if (q.cursor !== undefined) {
        try {
          const cursor = JSON.parse(Buffer.from(q.cursor, 'base64url').toString('utf8')) as Record<string, unknown>
          if ((cursor['priority'] !== 0 && cursor['priority'] !== 1) || typeof cursor['createdAt'] !== 'string' ||
              typeof cursor['messageRow'] !== 'number' || !Number.isSafeInteger(cursor['messageRow']) ||
              typeof cursor['deliveryRow'] !== 'number' || !Number.isSafeInteger(cursor['deliveryRow'])) throw new Error('invalid cursor')
          pageCursor = cursor as unknown as QueueCursor
        } catch { throw new PanelError('The queue cursor is not usable.', 400) }
      }
      // WHO SENT EACH ONE, in the words every hand-over prints (problem ynGL0myEnAbi), AND HOW THAT
      // SENDER ASKS TO BE ADDRESSED. The run prompt passes both to the
      // envelope unchanged.
      // ONLY THE MESSAGES THE CALLER MAY READ are listed or counted. The message
      // worker, this door's caller, reads every message.
      const reader = theMessageReader(actorFrom(req))
      const settledAsks: SettledAskDelivery[] | undefined = q.markDelivered === '1' ? [] : undefined
      // A DELIVERY WHOSE READING THREW is named apart, with why, and the rest are answered (item 49 of wave 13y, round 115).
      let everyFailed: QueueFailure[] = []
      // THE FILED ALIASES, READ ONCE FOR THIS REQUEST: the queue's reading below and the starter waits here both use it.
      const aliases = theFiledAliasesReadOnce(sqlite)
      let next: string | null = null
      let everyQueued: Awaited<ReturnType<typeof theQueueWithoutHoldingTheServer>>
      if (q.page === '1') {
        const found: { candidate: QueueCandidate; row?: (typeof everyQueued)[number]; failed?: QueueFailure }[] = []
        for (;;) {
          const candidates = await theNextQueueCandidates(workspaceId, pageCursor)
          if (candidates.length === 0) break
          const failures: QueueFailure[] = []
          const rows = await theQueueWithoutHoldingTheServer(workspaceId, { selectedQueued: candidates, inheritedDeliveryIds, failed: failures, aliases })
          const maySee = theMessagesThisReaderMayRead(reader, [...rows, ...failures].map((one) => one.messageId))
          for (const candidate of candidates) {
            if (!maySee.has(candidate.messageId)) continue
            const row = rows.find((one) => one.messageId === candidate.messageId && one.to.id === candidate.recipientId)
            const failed = failures.find((one) => one.messageId === candidate.messageId && one.to.id === candidate.recipientId)
            if (row !== undefined) found.push({ candidate, row })
            else if (failed !== undefined) found.push({ candidate, failed })
          }
          pageCursor = candidates[candidates.length - 1]!
          if (found.length > QUEUE_PAGE_SIZE) break
          await new Promise<void>((resolve) => setImmediate(resolve))
        }
        const selected = found.slice(0, QUEUE_PAGE_SIZE)
        everyQueued = selected.flatMap((one) => one.row === undefined ? [] : [one.row])
        everyFailed = selected.flatMap((one) => one.failed === undefined ? [] : [one.failed])
        if (found.length > QUEUE_PAGE_SIZE) {
          const { priority, createdAt, messageRow, deliveryRow } = selected[selected.length - 1]!.candidate
          const cursor = Buffer.from(JSON.stringify({ priority, createdAt, messageRow, deliveryRow })).toString('base64url')
          next = `/api/worker/queue?page=1&cursor=${encodeURIComponent(cursor)}`
        }
      } else {
        everyQueued = await theQueueWithoutHoldingTheServer(workspaceId, { full: q.full === '1', only: q.only, messageId: q.messageId, recipientId: q.recipientId, inheritedDeliveryIds, settledAsks, failed: everyFailed, aliases })
      }
      const mayRead = theMessagesThisReaderMayRead(reader, [...everyQueued, ...(settledAsks ?? []), ...everyFailed].map((one) => one.messageId))
      // Only asks this reader may read reach the transaction; inherited deliveries stayed in the queue.
      const markedDelivered = settledAsks === undefined ? undefined : markSettledAsksDelivered(settledAsks.filter(one => mayRead.has(one.messageId)), workspaceId)
      // EACH STORED SENDER IS READ ONCE FOR THE WHOLE ANSWER (wave 13y round 48): on a made-up office,
      // 4,685 rows had 943 senders.
      const senderWords = theSendersReadOncePerAnswer()
      const starterWaits = new Map<string, string | null>()
      const queue = everyQueued.filter((one) => mayRead.has(one.messageId)).map((one) => {
        const agent = aliases.canonicalOf(one.to.id)
        if (one.needsNoRun === null && !starterWaits.has(agent)) starterWaits.set(agent, aWaitingStarterChangeSays(agent))
        const waiting = one.needsNoRun === null ? starterWaits.get(agent) ?? null : null
        const complete = { ...one, ...senderWords(one.sentBy), ...(waiting === null ? {} : { heldByStarterChange: waiting }) }
        if (q.full === '1') return complete
        return Object.fromEntries(Object.entries(complete).filter(([key]) => (QUEUE_DECISION_FIELDS as readonly string[]).includes(key)))
      })
      const failed = everyFailed.filter((one) => mayRead.has(one.messageId))
      const everyDeadLetter = q.only === 'checks' || q.page === '1' ? [] : deadLettersInTheQueue(workspaceId)
      const mayReadDead = theMessagesThisReaderMayRead(reader, everyDeadLetter.map((one) => one.messageId))
      const deadLetters = everyDeadLetter.filter((one) => mayReadDead.has(one.messageId))
      // A LATER PAGE is one asked with a cursor. The first page counts the dead letters and a later page leaves them out,
      // so a walk of every page counts them once.
      const laterPage = q.page === '1' && q.cursor !== undefined
      const deadLetterCount = laterPage ? null : q.page === '1' ? countReadableDeadLetters(workspaceId, (ids) => theMessagesThisReaderMayRead(reader, ids)) : deadLetters.length
      return {
        workspaceId,
        queue,
        ...(q.page === '1' ? { next } : {}),
        ...(markedDelivered === undefined ? {} : { markedDelivered }),
        failed: q.full === '1' ? failed : failed.map(({ messageId, to, because }) => ({ messageId, to, because })),
        note:
          (queue.length === 0
            ? laterPage ? 'Nothing more is waiting for a run in this project.' : 'Nothing is waiting for a run in this project.'
            : `${String(queue.length)} message${queue.length === 1 ? '' : 's'} waiting for a run${q.page === '1' ? ' on this page' : ''}.`) +
          (failed.length === 0
            ? ''
            : ` ${String(failed.length)} more could not be worked out, and failed says why for each one.`),
        deadLetters: deadLetterCount === null
          ? { note: 'The first page counts the messages queued for an agent whose message has been deleted. This page does not count them again.' }
          : {
              count: deadLetterCount,
              ...(q.full === '1' ? { rows: deadLetters } : {}),
              note:
                deadLetterCount === 0
                  ? 'Nothing here is queued for a message that no longer exists.'
                  : `${String(deadLetterCount)} message${deadLetterCount === 1 ? ' is' : 's are'} queued for an ` +
                    'agent, but the message itself has been deleted. Nothing will ever deliver a deleted message, so ' +
                    'these stay queued for ever unless somebody acts on the delivery row by hand. This counts only ' +
                    `${workspaceId}; the same count across every project can be a different number.`,
            },
      }
    },
  )

  app.get(
    '/worker/runs',
    route('worker.runs', 'local', { because: 'starts-work-on-this-machine', act: 'Reading the work already running here' }, RUNS_NOTE),
    async (req) => {
      const workspaceId = workspaceOf(req)
      // ONLY THE RUNS FOR MESSAGES THE CALLER MAY READ.
      const everyRun = await readFirst(() => theProcessesThePickUpReads(workspaceId), () => runsToPickUp(workspaceId))
      const mayRead = theMessagesThisReaderMayRead(theMessageReader(actorFrom(req)), everyRun.map((one) => one.messageId))
      const runs = everyRun.filter((one) => mayRead.has(one.messageId)).map((one) => ({ ...one, ...theSenderForAHandOver(one.sentBy) }))
      return {
        workspaceId,
        runs,
        note:
          runs.length === 0
            ? 'No run of this project is going.'
            : `${String(runs.length)} run${runs.length === 1 ? ' is' : 's are'} going.`,
      }
    },
  )

  app.get(
    '/worker/waits',
    route('worker.waits', 'local', { because: 'starts-work-on-this-machine', act: 'Reading the runs waiting for the next message' }, WAITS_NOTE),
    async (req) => {
      const workspaceId = workspaceOf(req)
      const waits = runsWaitingForTheNextMessage(workspaceId)
      return {
        workspaceId,
        minutes: howLongARunWaits(),
        waits,
        note:
          waits.length === 0
            ? 'No run of this project is waiting for the next message.'
            : `${String(waits.length)} run${waits.length === 1 ? ' is' : 's are'} waiting for the next message.`,
      }
    },
  )

  app.get(
    '/worker/merges',
    route('worker.merges', 'local', { because: 'starts-work-on-this-machine', act: 'Reading the jobs for the merge tool here' }, MERGES_NOTE),
    async (req, reply) => {
      const workspaceId = workspaceOf(req)
      const result = await mergesForTheWorker(workspaceId)
      if (result.kind === 'stale') {
        return reply.header('Retry-After', '3').code(503).send({
          error: 'The merge queue changed while it was being read, and nothing was started or stopped.',
          code: MERGE_QUEUE_SNAPSHOT_CHANGING,
        })
      }
      const { wanted, going, hourOver, hourCannotBeRead, takeBacksDue, takeBacksForAPerson, takeBacksCannotBeRead } = result
      return {
        workspaceId,
        wanted,
        going,
        hourOver,
        hourCannotBeRead,
        takeBacksDue, takeBacksForAPerson, takeBacksCannotBeRead,
        note:
          (wanted.length === 0
            ? 'The office wants its merge tool for no entry in this project.'
            : `The office wants its merge tool for ${String(wanted.length)} ${wanted.length === 1 ? 'entry' : 'entries'}.`) +
          (going.length === 0 ? ' No merge tool run is going.' : ` ${String(going.length)} merge tool ${going.length === 1 ? 'run is' : 'runs are'} going.`) +
          (hourOver.length === 0
            ? ''
            : ` ${String(hourOver.length)} resolving ${hourOver.length === 1 ? "entry's time to resolve is" : "entries' times to resolve are"} over, and the office is asked to bounce ${hourOver.length === 1 ? 'it' : 'each'}.`) +
          (takeBacksDue.length === 0 ? '' : ` ${takeBacksDue.length} ${takeBacksDue.length === 1 ? 'hand-back is' : 'hand-backs are'} due for take-back.`) +
          (takeBacksForAPerson.length === 0 ? '' : ` ${takeBacksForAPerson.length} ${takeBacksForAPerson.length === 1 ? 'hand-back needs' : 'hand-backs need'} a person.`) +
          (takeBacksCannotBeRead.length === 0 ? '' : ` ${takeBacksCannotBeRead.length} ${takeBacksCannotBeRead.length === 1 ? "hand-back's deadline or git facts cannot" : 'hand-backs have deadlines or git facts that cannot'} be read.`),
      }
    },
  )

  app.post(
    '/worker/gates/run-out',
    route('worker.gates-run-out', 'local', {because: 'starts-work-on-this-machine', act: 'Removing gate choices past their end'}, 'Remove every ended gate choice and record each fallback as an office change, in one transaction. Only the message worker may ask. Send no body.'),
    async (req) => {
      const actor = actorFrom(req)
      if (actor.type !== THE_WORKER.type || actor.id !== THE_WORKER.id) {
        const reason = "Only the office's message worker may remove gate choices whose end has come."
        throw new PanelError(`${reason} Nothing was changed.`, 403, undefined, undefined, undefined, {code: 'runtimeSettingsNotAllowed', values: {reason}})
      }
      parse(takesNoBody('POST /api/worker/gates/run-out', 'The office reads each saved end, so the caller sends nothing.'), req.body, 'The request body is not usable:')
      return runOutGateChoices()
    },
  )

  app.post(
    '/worker/merges/:entry/hour-over',
    route('worker.merge-hour-over', 'local', { because: 'starts-work-on-this-machine', act: "Recording the end of a resolving merge entry's time to resolve" }, HOUR_OVER_NOTE),
    async (req) => {
      const workspaceId = workspaceOf(req)
      const { entry } = req.params as { entry: string }
      // THE ORDER EVERY DOOR OF THE QUEUE KEEPS: the entry in this project first, so an id from another project is a
      // 404 whoever asks; then who is knocking; then the shape of what they sent; and then the queue's own reading.
      theMergeEntry(entry, workspaceId)
      const actor = actorFrom(req)
      if (actor.type !== THE_WORKER.type || actor.id !== THE_WORKER.id) {
        throw new PanelError(`Only the office's message worker says that a resolving merge entry's time to resolve is over. Nothing was written.`, 403)
      }
      parse(takesNoBody('POST /api/worker/merges/:entry/hour-over', 'The queue decides the end of the time to resolve from what the entry stores, so the caller sends nothing.'), req.body, 'The request body is not usable:')
      const over = theHourIsOver({ workspaceId, id: entry, actor })
      return { entry: over.entry, says: over.says, workspaceId }
    },
  )

  app.post(
    '/worker/merges/hand-backs/:problem/a-person-must-look',
    route('worker.take-back-needs-person', 'local', { because: 'starts-work-on-this-machine', act: 'Recording an overdue hand-back as needing a person' }, 'The message worker asks the office to re-read one hand-back; no body. The office records a person-must-look note and tells the secretary once.'),
    async req => {
      const workspaceId = workspaceOf(req), { problem } = req.params as { problem: string }
      recordInWorkspace(problem, workspaceId)
      const actor = actorFrom(req)
      if (actor.type !== THE_WORKER.type || actor.id !== THE_WORKER.id) throw new PanelError("Only the office's message worker says a hand-back needs a person. Nothing was written.", 403)
      parse(takesNoBody('POST /api/worker/merges/hand-backs/:problem/a-person-must-look', 'The office reads its own facts, so the caller sends nothing.'), req.body, 'The request body is not usable:')
      return { ...noteTakeBackNeedsAPerson(workspaceId, problem), workspaceId }
    },
  )
  app.post(
    '/worker/merges/hand-backs/:problem/take-back',
    route('worker.take-back', 'local', { because: 'starts-work-on-this-machine', act: 'Submitting an exact take-back of an overdue hand-back' }, 'Only the message worker submits {workingDirectory, branch, stillRed:{mainAt,files:[{file,result,log}]}}. The office reads its clock, records and exact inverse tree before filing a finished run, sealing it and submitting in one transaction.'),
    async req => {
      const workspaceId = workspaceOf(req), { problem } = req.params as { problem: string }
      recordInWorkspace(problem, workspaceId)
      const actor = actorFrom(req)
      if (actor.type !== THE_WORKER.type || actor.id !== THE_WORKER.id) throw new PanelError("Only the office's message worker asks for a take-back. Nothing was written.", 403)
      const body = parse(z.object({ workingDirectory: z.string().min(1), branch: z.string().min(1), stillRed: z.unknown().optional() }).strict(), req.body, 'The request body is not usable:')
      return { ...submitATakeBack({ ...body, problem, workspaceId, actor }), workspaceId }
    },
  )

  app.post(
    '/worker/merges/hand-backs/:problem/fixed-on-main',
    route('worker.take-back', 'local', { because: 'starts-work-on-this-machine', act: 'Recording an overdue hand-back as fixed on main' }, sayInEnglish('takeBackMain.door')),
    async req => {
      const workspaceId = workspaceOf(req), { problem } = req.params as { problem: string }
      recordInWorkspace(problem, workspaceId)
      return { ...fixedOnMain({ workspaceId, problem, body: req.body, actor: actorFrom(req) }), workspaceId }
    },
  )

  app.post(
    '/worker/waits/:session/over',
    route('worker.wait-over', 'local', { because: 'starts-work-on-this-machine', act: 'Recording a run\'s unanswered wait for the next message' }, WAIT_OVER_NOTE),
    async (req) => {
      const workspaceId = workspaceOf(req)
      const { session } = req.params as { session: string }
      // THE REPLY CARRIES THE MESSAGE THE RUN WAS DELIVERING, so a caller who may not read it is refused,
      // inside `theWaitIsOver` on the message it works out, before anything is written.
      const ended = theWaitIsOver(session, workspaceId, theCallerMayRead(theMessageReader(actorFrom(req))))
      // THE WAIT RAN OUT BY TIME, AND THIS IS THE FIRST WRITE TO SAY SO, so the pages are told now rather than at the
      // server's next look (lib/answering-told.ts).
      answeringOfTheAgentsTheseRunsServeMayHaveChanged(getRecord(session)?.data ?? null)
      return { session, ...ended, message: readMessage(ended.messageId, workspaceId) }
    },
  )

  app.post(
    '/worker/runs/:session/cut-off',
    route('worker.cut-off', 'local', { because: 'starts-work-on-this-machine', act: 'Ending a run cut off here by a restart' }, CUT_OFF_NOTE),
    async (req) => {
      const workspaceId = workspaceOf(req)
      const { session } = req.params as { session: string }
      // THE REPLY CARRIES THE MESSAGE THE RUN WAS DELIVERING, so a caller who may not read it is refused,
      // inside `theRunWasCutOff` on the message it works out, before anything is written.
      const ended = theRunWasCutOff(session, workspaceId, theCallerMayRead(theMessageReader(actorFrom(req))))
      return { session, ...ended, message: readMessage(ended.messageId, workspaceId) }
    },
  )

  app.post(
    '/worker/messages/:id/taken',
    route('worker.taken', 'local', { because: 'starts-work-on-this-machine', act: 'Marking a message taken by a run here' }, TAKEN_NOTE),
    async (req) => {
      const workspaceId = workspaceOf(req)
      const { id } = req.params as { id: string }
      const body = parse(takenBody, req.body, 'This is not usable:')
      // THE REPLY CARRIES THE MESSAGE, so a caller who may not read it is refused before anything is
      // written. The message worker, this door's caller, reads every message.
      refuseAMessageThisReaderMayNotRead(theMessageReader(actorFrom(req)), id, 'refuse')
      if (body.prepareOnly === true) {
        const batch = prepareNoticeBatch(body.to, 'run:' + body.session, true)
        for (const one of batch.messages) refuseAMessageThisReaderMayNotRead(theMessageReader(actorFrom(req)), one.messageId, 'refuse')
        return batch
      }
      const moved = aRunTookIt(id, body.to, { session: body.session, runtime: body.runtime, because: body.because }, workspaceId)
      countTheHoldsItWentPast(body.wouldHaveHeld)
      // A RUN TOOK A MESSAGE, and a waiting run that takes one is a run again (lib/answering-told.ts).
      answeringOfTheAgentsTheseRunsServeMayHaveChanged(getRecord(body.session)?.data ?? null)
      return { message: readMessage(id, workspaceId), ...moved }
    },
  )

  app.post(
    '/worker/messages/:id/needs-no-run',
    route(
      'worker.needs-no-run',
      'local',
      { because: 'starts-work-on-this-machine', act: 'Delivering a line from Mole Office without starting a run' },
      NEEDS_NO_RUN_NOTE,
    ),
    async (req) => {
      const workspaceId = workspaceOf(req)
      const { id } = req.params as { id: string }
      const body = parse(needsNoRunBody, req.body, 'This is not usable:')
      // THE REPLY CARRIES THE MESSAGE, so a caller who may not read it is refused before anything is
      // written. The message worker, this door's caller, reads every message.
      refuseAMessageThisReaderMayNotRead(theMessageReader(actorFrom(req)), id, 'refuse')
      const done = noRunIsNeeded(id, body.to, workspaceId)
      countTheHoldsItWentPast(body.wouldHaveHeld)
      return { message: readMessage(id, workspaceId), ...done }
    },
  )

  app.post(
    '/worker/messages/:id/held',
    route('worker.held', 'local', { because: 'starts-work-on-this-machine', act: 'Writing down the reason for a message still waiting' }, HELD_NOTE),
    async (req) => {
      const workspaceId = workspaceOf(req)
      const { id } = req.params as { id: string }
      const body = parse(heldBody, req.body, 'This is not usable:')
      // THE REPLY CARRIES THE MESSAGE, so a caller who may not read it is refused before anything is
      // written. The message worker, this door's caller, reads every message.
      refuseAMessageThisReaderMayNotRead(theMessageReader(actorFrom(req)), id, 'refuse')
      const held = sayWhereItStands(id, body.to, body.because, workspaceId, body.replacing)
      // Only a changed delivery begins another hold. The worker names the gate; the sentence is for readers.
      if (held.written && body.gate === 'worker-runs') gateMet('worker-runs', String(gateNumber('worker-runs')))
      if (held.written && body.gate === 'agent-hops') gateMet('agent-hops', String(gateNumber('agent-hops')))
      if (held.written && body.gate === 'held-by-a-notice-rule') gateMet('held-by-a-notice-rule', 'block')
      if (held.written && body.gate === 'held-while-a-resident-sleeps') gateMet('held-while-a-resident-sleeps', 'block')
      if (held.written && body.gate === 'held-by-an-unsent-review') gateMet('held-by-an-unsent-review', 'block')
      if (held.written && body.gate === 'wait-for-the-persons-start') gateMet('wait-for-the-persons-start', 'block')
      /**
       * AND THE GROUP IS TOLD, ONCE, WHEN ITS AGENTS HAVE GONE AS FAR AS THEY MAY WITHOUT A PERSON.
       *
       * The sentence above is on the delivery row, which is read by whoever opens that message. A
       * group that has stopped needs saying in the group. Whether it has stopped is asked here of
       * the stored conversation rather than taken from the caller's sentence, so this is the same
       * fact the queue read, answered by the same function in the same process.
       */
      const group = tellTheGroupTheAgentsAreWaiting(id, body.to, workspaceId, THE_WORKER)
      /**
       * AND THE STARTER IS TOLD, because whoever has to move may not be in the group.
       *
       * Criterion M82, problem `S5ouUa6A0rrL`: the inspector's second refusal of a worker's run sat
       * queued with the cap's sentence on it, and nothing told the starter that the fix loop had
       * stopped — it was found only by reading the delivery row by hand. Both halves are written from
       * the same reading of the same stored conversation, in the same process, so the group and
       * the starter can never be told different things.
       */
      const starter = tellTheStarterTheCapStopped(id, body.to, workspaceId, THE_WORKER)
      /**
       * AND THE SECRETARY IS TOLD, ONCE, WHEN THE MESSAGE IS A CHECK THAT WAITS ITS TURN under its lane's hourly cap.
       * This is part 2 of a decision, and the answer on it says the cap "only paces with one sentence to
       * the secretary".
       * The office reads the pace again here rather than taking the worker's sentence. Null when the message is not that.
       */
      const secretary = tellTheSecretaryACheckWaitsItsTurn(id, workspaceId)
      return { message: readMessage(id, workspaceId), ...held, group, starter, secretary }
    },
  )

  app.post(
    '/worker/messages/:id/answered',
    route('worker.answered', 'local', { because: 'starts-work-on-this-machine', act: 'Filing a run\'s words' }, ANSWERED_NOTE),
    async (req) => {
      const workspaceId = workspaceOf(req)
      const { id } = req.params as { id: string }
      const body = parse(answeredBody, req.body, 'This is not usable:')
      // THE REPLY CARRIES THE MESSAGE, so a caller who may not read it is refused before anything is
      // written. The message worker, this door's caller, reads every message.
      refuseAMessageThisReaderMayNotRead(theMessageReader(actorFrom(req)), id, 'refuse')
      const answered = readMessage(id, workspaceId)
      /**
       * WHO THE REPLY GOES TO IS WORKED OUT IN lib/worker.ts AND NOT SENT IN. An answer to a message
       * written into a group goes to that group; an answer to a message between two participants
       * goes back to whoever sent it. `whereAnAnswerGoes` is that rule, in one place, and the whole
       * account of what it used to do is in its own comment.
       */
      const back = whereAnAnswerGoes(answered)
      const filed = fileTheReply(
        { inReplyTo: id, agent: body.agent, fromRun: body.fromRun, body: body.body, ...back },
        workspaceId,
      )
      // AND THE ORIGINAL MESSAGE'S ROW SAYS THE RUN ANSWERED, so a reader of the conversation sees
      // that the run this message started has finished with it rather than only that it started.
      const stands = sayWhereItStands(id, body.to, body.because, workspaceId)
      // WHO IT REACHED IS WHAT THE FILED MESSAGE SAYS, not what was asked for. For a group those are
      // the members it was delivered to, which only the write knows.
      return { reply: filed, inReplyTo: id, to: filed.to, toGroup: filed.toGroup, mark: stands.mark, because: body.because }
    },
  )
}
