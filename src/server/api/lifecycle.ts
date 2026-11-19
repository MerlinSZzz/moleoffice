// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DOORS ONTO AN AGENT'S LIFECYCLE: OPEN AND CLOSE AN ATTACHMENT, READ PRESENCE, READ AND MOVE
 * WORK STATE.
 *
 * ---------------------------------------------------------------------------------------
 * NOT ONE OF THESE STARTS A PROCESS, AND THAT IS STRUCTURAL RATHER THAN A PROMISE
 * ---------------------------------------------------------------------------------------
 *
 * The owner's principle: Mole Office owns an agent's semantic lifecycle, and providers own their
 * processes. This file starts no process, signals none, and reads no kernel filesystem — so there is no
 * architecture in which a route
 * here could spawn anything, and there is no flag that would let it. What starts a provider is the
 * Agent Host, in `tools/`, outside `src/` where spawning is allowed.
 *
 * So there is no `POST /api/agents/:id/start` and no `POST /api/agents/:id/resume` and there will
 * not be one. **Opening an attachment records that a run is participating; it does not create the
 * run.** The run already exists — something started it, and that something was not Mole Office.
 *
 * ---------------------------------------------------------------------------------------
 * CLOSING AN ATTACHMENT IS NOT KILLING A RUNTIME, AND THE CLOSE REPLY SAYS SO EVERY TIME
 * ---------------------------------------------------------------------------------------
 *
 * Section 14 of the round-eleven brief: closing an attachment does not stop the provider runtime,
 * and stopping the runtime is a separate, explicit act. That other act lives on the resource ledger,
 * beside the process it is about, needs a typed phrase, and is never adjacent to this one. The
 * close reply carries one sentence saying what it did not do, because the person reading it may
 * have been about to press the other thing.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO DIMENSIONS ARE TWO ROUTES AND THERE IS NO ROUTE THAT RETURNS BOTH AS ONE WORD
 * ---------------------------------------------------------------------------------------
 *
 * Presence answers *can this agent be reached now*. Work state answers *what is it supposed to be
 * doing*. All fifteen pairs occur, including Offline and Working, which is what an API death looks
 * like. A single `status` route would have to pick one word for both and would call every one of
 * those a success.
 *
 * ---------------------------------------------------------------------------------------
 * THE WORK-STATE ROUTES ANSWER 503 UNTIL THE MIGRATION WINDOW, AND SAY WHICH FILE
 * ---------------------------------------------------------------------------------------
 *
 * The transition store's two tables are written, proved and deliberately not registered: this
 * campaign has one announced migration window and the owner opens it. Until the owner does,
 * `moveWorkStateTo` and `workStateOf` refuse with a sentence naming the held file rather than
 * failing with a SQLite error about a missing table. **That refusal reaches the caller unchanged.**
 * A route that caught it and answered 200 with an empty reading would be the first engineering rule
 * broken — a 200 with nothing in it is a lie when the truth is that this cannot be answered yet.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { CLOSED_HOW, PRESENCE_WORDS, WORK_STATES, type ClosedHow, type WorkState } from '@shared/lifecycle.ts'
import {
  childrenOf,
  closeAttachment,
  listAttachments,
  openAttachment,
  sweepQuietChildren,
  type AttachmentView,
} from '../lib/attachments.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { moveWorkStateTo, workStateHistory, workStateOf } from '../lib/lifecycle.ts'
import { presenceOf } from '../lib/presence.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'

// ============================================================================ what a body may say

const openBody = z.object({
  title: z.string().min(1, 'Say what to call this run; a person reads it in a list of runs.'),
  agentId: z.string().min(1).optional(),
  providerSession: z.string().min(1).optional(),
  machine: z.string().min(1).optional(),
  workingDirectory: z.string().min(1).optional(),
  terminal: z.string().min(1).optional(),
  parentAttachment: z.string().min(1).optional(),
  runtime: z.string().min(1).optional(),
  // CHECKED BY THE RECORD DOOR against the session kind's list, so the refusal is written in one place.
  adaptedTool: z.string().min(1).optional(),
  doing: z.string().min(1).optional(),
})

const closeBody = z.object({
  how: z.enum(CLOSED_HOW as unknown as [ClosedHow, ...ClosedHow[]]),
  because: z.string().min(1, 'Say why this period of participation ended, in one plain sentence.'),
})

const moveBody = z.object({
  to: z.enum(WORK_STATES as unknown as [WorkState, ...WorkState[]]),
  because: z.string().min(1, 'Say why the work state moved, in one plain sentence.'),
  attachmentId: z.string().min(1).optional(),
  evidence: z.unknown().optional(),
  relatedKind: z.string().min(1).optional(),
  relatedId: z.string().min(1).optional(),
})

// ============================================================================ the sentences

const OPEN_NOTE =
  'Opens one attachment: one period in which one provider session participates as one durable agent. IT STARTS ' +
  'NOTHING. The run already exists and something else started it; this records that it is taking part, and that ' +
  'is the whole of what it does. Every field but the title is optional and an absent one is stored as absent — ' +
  'a run that does not know its terminal says nothing rather than guessing. A NEW ATTACHMENT EVERY TIME: a ' +
  'closed attachment is never reopened, because pretending an old one stayed alive is how a run that died gets ' +
  'reported as one that carried on. If other attachments are already open for the same agent or the same ' +
  'provider session, the reply SAYS SO and does not refuse — three live processes on this machine share one ' +
  'provider session id, so one open attachment per provider session is a rule the world already breaks.'

const CLOSE_NOTE =
  'Closes one attachment: this period of participation is over. IT TOUCHES NO PROCESS. Closing an attachment is ' +
  'not killing the provider runtime, and the reply says that in a sentence on every call, because the person ' +
  'reading it may have been about to press the other thing. Stopping a runtime is a different act on a ' +
  'different surface — the “Running on this machine” list, beside the process it is about — and it needs a typed phrase. Three ' +
  'things are written together: when it ended, why in one plain sentence, and HOW, one of agent-said, ' +
  'provider-event, parent-said, went-stale, person-said, starter-said. Only the starter of the agent the run served ' +
  'may say starter-said. How is not decoration: a child that ended and a child ' +
  'we stopped hearing from are different facts and only the second one hides a failure. Closing moves no work ' +
  'state, empties no inbox, closes no open loop and retires nobody.'

const LIST_NOTE =
  'The attachments in this project, newest first, each with what it recorded about itself and whether it is ' +
  'still open. `agentId` narrows it to the periods that served one durable agent; `openOnly` to the ones that ' +
  'have not ended. Open means one thing here — nobody wrote down a closing moment — and it is the same reading ' +
  'the presence door takes, so no two surfaces can disagree about who is attached. History is what an ' +
  'attachment is for, so ended ones come back by default.'

const PRESENCE_NOTE =
  'Whether this agent can be reached right now: Online, Stale or Offline. IT IS NEVER STORED and this is a ' +
  'reading taken at the moment you ask. THE REPLY NAMES THE INPUT IT USED, because the three inputs are of very ' +
  'unequal strength and drawing them under one word would hide which fact you have. `listen` — a request the ' +
  'server holds open — would be the strongest and DOES NOT EXIST, so it always reports a reader nobody built, ' +
  'which is a different answer from a reader that found nothing. `request` is the newest call carrying one of ' +
  'this agent\'s open attachments as its session. `attachment-opened` is the moment the attachment opened, used ' +
  'when nothing else answers, and it is the weakest. Offline names no input at all: no attachment is open, so ' +
  'nothing had to arrive. The reply carries the stale threshold and the sentence saying nobody has measured ' +
  'what it should be. PRESENCE IS NOT A WORK STATE and this route returns none: an agent can be Offline and ' +
  'Working, and that is what an API death looks like.'

const WORK_STATE_NOTE =
  'What this agent is supposed to be doing: Working, Reporting, Standing by, Blocked or Finished, with when it ' +
  'became that, why, and who said so. NOTHING CACHES IT — the answer is the newest transition row, read now, so ' +
  'there is no stored current value for a screen to disagree with. An agent with no transition at all reads ' +
  '"nobody has said what this agent is doing", which is a real answer and not a blank: Standing by is a claim ' +
  'that availability is intentional, and defaulting to it would put a sentence on the screen nobody said. ' +
  '`history` carries the moves behind the current one, which is what durations are worked out from — no ' +
  'duration is stored anywhere, because that would be the same fact in two places.'

const MOVE_NOTE =
  'Moves this agent\'s work state and records why. A WORK STATE IS WRITTEN BY AN AGENT ABOUT ITSELF, OR BY A ' +
  'PERSON, AND BY NOTHING ELSE: a process ending is not a decision about the work, and a system-written one is ' +
  'refused by name. An agent saying it is finished is a claim, and Mole Office takes it and records who made it — ' +
  'refusing it would mean deciding from a change log whether somebody else\'s responsibility has ended. Every ' +
  'move between two DIFFERENT words is legal, including Reporting back to Working; a move to the word already ' +
  'held is refused, because it records nothing and could be used as a heartbeat; a move with no reason is ' +
  'refused, because the reason is the whole point of keeping this history. An agent must say which attachment ' +
  'it is moving from — that is what says which durable agent the run is working as — and may move only its own. ' +
  'A person may move anybody\'s. The moment is the server\'s clock and never the caller\'s: a caller-supplied ' +
  'time would be a historical observation nobody made. THIS STARTS NOTHING AND WAKES NOBODY.'

const CHILDREN_NOTE =
  'The child runs one attachment started, newest first, open ones and ended ones. A child is a run the provider ' +
  'started inside another run, and its parent is recorded on it. IT IS NOT A DURABLE AGENT: it names none, it ' +
  'cannot be sent a message, it cannot move a work state, and it never holds an agent online by itself. Mole Office ' +
  'observes a provider\'s subagents and does not replace the provider\'s scheduler — nothing here decides when a ' +
  'child runs, gives one work, or restarts one. Its history is kept under its parent, which is where a child\'s ' +
  'findings survive the run that produced them. Each ended child says HOW it ended: parent-said, provider-event ' +
  'or went-stale, and those are three different facts.'

const SWEEP_NOTE =
  'Closes the child runs Mole Office has stopped hearing from, and says which it closed and which it left alone with ' +
  'how long each has been quiet. THIS IS THE THIRD OF THE THREE WAYS A CHILD ENDS and the reason each close ' +
  'records which one it was: a child that ended, a child its parent ended, and a child nobody heard from again ' +
  'are three facts, and only the third one hides a failure — a parent waiting on a workflow that had already ' +
  'died is the failure this exists to make visible. A child closed here says "went-stale", which means Mole Office ' +
  'stopped hearing from it and does not know what happened; it does NOT mean the child finished. IT TOUCHES NO ' +
  'PROCESS and starts nothing: it writes three keys on a record. It sweeps children only — a top-level ' +
  'attachment going quiet reads as Stale on the presence door, and closing one by itself would be the system ' +
  'deciding a run had ended, which is not a decision it gets to make.'

// ============================================================================ the replies

export interface AttachmentsReply {
  attachments: AttachmentView[]
  note: string
}

/** What a list of attachments says about itself, counted from the rows in it. */
export function attachmentsNote(rows: AttachmentView[], agentId: string | undefined): string {
  const open = rows.filter((one) => one.open).length
  const who = agentId === undefined ? 'this project' : `the agent ${agentId}`
  if (rows.length === 0) {
    return `No run has ever been recorded as an attachment in ${who}. That is nothing there, not nobody looked.`
  }
  return (
    `${rows.length} attachment${rows.length === 1 ? '' : 's'} in ${who}, ${open} still open. An open one has ` +
    'no closing moment written on it; a closed one keeps its moment, its reason and how it ended, for ever.'
  )
}

// ============================================================================ the routes

export async function lifecycleRoutes(app: FastifyInstance): Promise<void> {
  app.get('/attachments', route('attachment.list', 'remote', LIST_NOTE), async (req): Promise<AttachmentsReply> => {
    const workspaceId = workspaceOf(req)
    const query = req.query as { agentId?: string; openOnly?: string }
    const agentId = query.agentId === undefined || query.agentId === '' ? undefined : query.agentId
    const rows = listAttachments({
      workspaceId,
      ...(agentId === undefined ? {} : { agentId }),
      ...(query.openOnly === 'true' ? { openOnly: true } : {}),
    })
    return { attachments: rows, note: attachmentsNote(rows, agentId) }
  })

  app.post('/attachments', route('attachment.open', 'remote', OPEN_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const body = parse(openBody, req.body ?? {}, 'This attachment was not opened:')
    return openAttachment({
      workspaceId,
      actor: actorFrom(req),
      title: body.title,
      ...(body.agentId === undefined ? {} : { agentId: body.agentId }),
      ...(body.providerSession === undefined ? {} : { providerSession: body.providerSession }),
      ...(body.machine === undefined ? {} : { machine: body.machine }),
      ...(body.workingDirectory === undefined ? {} : { workingDirectory: body.workingDirectory }),
      ...(body.terminal === undefined ? {} : { terminal: body.terminal }),
      ...(body.parentAttachment === undefined ? {} : { parentAttachment: body.parentAttachment }),
      ...(body.runtime === undefined ? {} : { runtime: body.runtime }),
      ...(body.adaptedTool === undefined ? {} : { adaptedTool: body.adaptedTool }),
      ...(body.doing === undefined ? {} : { doing: body.doing }),
    })
  })

  app.get('/attachments/:id/children', route('attachment.children', 'remote', CHILDREN_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = req.params as { id: string }
    const children = childrenOf(id, workspaceId)
    return {
      parentAttachment: id,
      children,
      note:
        children.length === 0
          ? 'This attachment started no child runs that Mole Office observed. That is nothing there, not nobody looked.'
          : `${children.length} child run${children.length === 1 ? '' : 's'} started under this attachment, ` +
            `${children.filter((one) => one.open).length} still open. None of them is a durable agent and none ` +
            'of them can be sent a message.',
    }
  })

  app.post('/attachments/sweep-children', route('attachment.sweep-children', 'remote', SWEEP_NOTE), async (req) => {
    return sweepQuietChildren({ workspaceId: workspaceOf(req), actor: actorFrom(req) })
  })

  app.post('/attachments/:id/close', route('attachment.close', 'remote', CLOSE_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = req.params as { id: string }
    const body = parse(closeBody, req.body ?? {}, 'This attachment was not closed:')
    return closeAttachment(id, { workspaceId, actor: actorFrom(req), how: body.how, because: body.because })
  })

  app.get('/agents/:id/presence', route('agent.presence', 'remote', PRESENCE_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = req.params as { id: string }
    const reading = presenceOf(id, workspaceId)
    // The three words are published beside the reading so a caller never has to know them, and so
    // that a word added to the vocabulary reaches every caller without anybody restating the list.
    return { ...reading, words: PRESENCE_WORDS }
  })

  app.get('/agents/:id/work-state', route('agent.work-state', 'remote', WORK_STATE_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = req.params as { id: string }
    const query = req.query as { history?: string }
    const now = workStateOf(id, workspaceId)
    const history = query.history === 'true' ? workStateHistory(id, workspaceId) : undefined
    return { ...now, words: WORK_STATES, ...(history === undefined ? {} : { history }) }
  })

  app.post('/agents/:id/work-state', route('agent.work-state-move', 'remote', MOVE_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = req.params as { id: string }
    const body = parse(moveBody, req.body ?? {}, 'This work state was not moved:')
    return moveWorkStateTo(id, body.to, {
      workspaceId,
      actor: actorFrom(req),
      because: body.because,
      ...(body.attachmentId === undefined ? {} : { attachmentId: body.attachmentId }),
      ...(body.evidence === undefined ? {} : { evidence: body.evidence }),
      ...(body.relatedKind === undefined ? {} : { relatedKind: body.relatedKind }),
      ...(body.relatedId === undefined ? {} : { relatedId: body.relatedId }),
    })
  })
}
