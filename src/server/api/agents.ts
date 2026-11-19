// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The agent routes: point at real work, say what you want, and say who it is for.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS
 * ---------------------------------------------------------------------------------------
 *
 * The door, and nothing else. Every rule about what may be written, who a comment is for, when a
 * run is created and what a worker is given lives in src/server/lib/agents.ts. Three steps per
 * handler, the same order as api/records.ts and api/sessions.ts: work out who is asking, check the
 * input, call one function in the library.
 *
 * ---------------------------------------------------------------------------------------
 * THE ROUTES ARE THE WHOLE CONTRACT, AND THE BROWSER AND A WORKER SHARE THEM
 * ---------------------------------------------------------------------------------------
 *
 *   POST   /api/agent/threads                start a conversation. `mode` is direct or review
 *   GET    /api/agent/threads                list, narrowed by state and mode
 *   GET    /api/agent/threads/:id            one conversation, its messages and its runs
 *   PATCH  /api/agent/threads/:id            title, or abandon it
 *   POST   /api/agent/threads/:id/messages   say something, about something, to somebody
 *   PATCH  /api/agent/messages/:id           change a comment — only while it is still waiting
 *   DELETE /api/agent/messages/:id           remove one — only while it is still waiting
 *   POST   /api/agent/threads/:id/dispatch   Send, or Finish review. THE ONLY DOOR THAT MAKES A RUN
 *   GET    /api/agent/runs                   ?state=queued is what a worker asks
 *   POST   /api/agent/runs/:id/claim         a worker takes one and gets the assembled context
 *   POST   /api/agent/runs/:id/result        the answer, the failure, or a decline
 *   GET    /api/agent/marks                  which objects have a comment waiting
 *
 * A worker is an HTTP client and nothing else. `tools/agent-worker.mjs` calls four of these and
 * touches no table and no file of this server, which is what makes a worker on another machine the
 * same case as one here.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH ROUTES TAKE A PROJECT AND WHICH DO NOT, AND WHY THAT IS NOT A HOLE
 * ---------------------------------------------------------------------------------------
 *
 * A conversation is about one project's work, so every thread, message and mark route reads
 * `x-mole-office-workspace` and refuses an id from another project by name.
 *
 * THE THREE RUN ROUTES TAKE NO PROJECT HEADER. A worker serves a MACHINE: it has no idea which
 * projects exist and cannot poll one queue per project, and a queue that answered about whichever
 * project a header happened to name would silently show it nothing. This is the same decision
 * `GET /api/work` and the whole planning layer took — see the header of api/work.ts — and it is
 * bounded the same way: the list offers no filter and no search by project, every row says which
 * project its conversation is about, and none of the three can reach a record. Their parameter is
 * a run id, not a record id.
 *
 * ---------------------------------------------------------------------------------------
 * NO NEW PERMISSION SYSTEM, DELIBERATELY
 * ---------------------------------------------------------------------------------------
 *
 * A run writes to Mole Office through the ordinary API with agent headers, so the change log names it
 * and the existing gate refuses it a `decision` with 403. Nothing here adds a scope, a token or a
 * role, and nothing here lets a run write as the person. The owner's rule, kept by doing less:
 * context scope is not action scope.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  MESSAGE_INTENTS,
  RECIPIENT_KINDS,
  RUN_STATES,
  THREAD_MODES,
  THREAD_STATES,
  addMessage,
  claimRun,
  createThread,
  dispatchThread,
  finishRun,
  listRuns,
  listThreads,
  marksIn,
  patchMessage,
  patchThread,
  readThread,
  removeMessage,
  type AgentMessageView,
  type AgentThreadView,
  type ClaimedRun,
  type DispatchOutcome,
  type MarksReply,
  type MessageContext,
  type MessageRemoved,
  type RunFinished,
  type RunListReply,
  type ThreadDetail,
  type ThreadListReply,
  mayReadTheInboxOf,
  onlyItsOwnInbox,
} from '../lib/agents.ts'
import { actorFrom, explain, takesNoInput } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { theMessageReader } from '../lib/messages.ts'
// WHO A DURABLE AGENT IS AND WHAT IS WAITING FOR IT. The route is the door; every rule about
// resolution, about which words count as waiting, and about the inbox being a query rather than a
// table lives in lib/inbox.ts.
import { agentByHandle, handlesInUse, inboxOf, type InboxReading } from '../lib/inbox.ts'
import { theLoginsWeekForASecretary } from '../lib/logins-week.ts'
import { isMessageState, MESSAGE_STATES, type MessageState } from '../lib/dispatch.ts'
import { PanelError } from '../lib/panel-error.ts'
import { workspaceOf } from '../lib/workspaces.ts'
// THE ONE DECLARATION OF WHAT A PERSON CAN POINT AT. The shape that validates a write below is
// built from it; see the comment above `targetArms`.
import { PICTURE_SETTINGS, TARGET_KINDS, TARGET_SPECS_BY_KIND, TEXT_SIZES } from '@shared/targets.ts'
// THE SIX POSITIONS OF THE DETAIL LADDER, from where they are declared. `view` below checks a
// stored rung against this list rather than against a copy of it typed here.
import { RUNGS } from '@shared/detail.ts'
import { route } from '../lib/route.ts'
// WHICH MACHINE A CLAIM CAME FROM, criterion P23. Measured off the connection, never sent in.
import { writtenFrom } from '../lib/machines.ts'

// ---------------------------------------------------------------------------- input shapes

const threadIdParams = z.object({
  id: z.string().min(1, { error: 'the URL must contain a conversation id — GET /api/agent/threads lists them' }),
})

const messageIdParams = z.object({
  id: z.string().min(1, { error: 'the URL must contain a comment id — GET /api/agent/threads/:id lists them' }),
})

const runIdParams = z.object({
  id: z.string().min(1, { error: 'the URL must contain a run id — GET /api/agent/runs lists them' }),
})

const newThread = z.strictObject({
  title: z.string().min(1, { error: 'a conversation needs a title — it is what a person reads on the list of them' }),
  mode: z.enum(THREAD_MODES, {
    error:
      'mode must be "direct" or "review". A direct conversation sends each comment when it is written; a review ' +
      'collects them and sends them together when you finish.',
  }),
})

const threadQuery = z.strictObject({
  state: z.enum(THREAD_STATES, { error: `state must be one of: ${THREAD_STATES.join(', ')}` }).optional(),
  mode: z.enum(THREAD_MODES, { error: `mode must be one of: ${THREAD_MODES.join(', ')}` }).optional(),
})

const threadPatch = z
  .strictObject({
    title: z.string().min(1, { error: 'a title must not be empty' }).optional(),
    state: z.enum(THREAD_STATES, { error: `state must be one of: ${THREAD_STATES.join(', ')}` }).optional(),
  })
  .refine((b) => b.title !== undefined || b.state !== undefined, {
    error: 'send a title, a state, or both. An empty patch changes nothing and says nothing.',
  })

/**
 * WHAT A COMMENT POINTS AT, BUILT FROM THE ONE DECLARATION AND NOT TYPED OUT HERE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS GENERATED
 * ---------------------------------------------------------------------------------------
 *
 * Round seven wrote out four shapes here by hand. `TARGET_SPECS` in src/shared/targets.ts already
 * says what identifies each thing a person can point at, and a hand-written copy of that beside it
 * is the defect this repository names as its own: a field added to the declaration and forgotten
 * here is a field the schema advertises and the write path refuses, and nothing fails.
 *
 * So the union below has one arm per declared target, each arm's fields are the declared
 * identifiers, and each field's refusal quotes the declaration's own sentence about what goes in it.
 * Adding a fourteenth thing a person can point at changes nothing in this file.
 *
 * A target carries IDS ONLY. What the thing SAYS is read from the thing itself over the API — a
 * copy taken now is stale by the time an agent reads it, and a copy nothing keeps in step with the
 * original is the same defect again.
 */
const targetArms = TARGET_KINDS.map((kind) => {
  const spec = TARGET_SPECS_BY_KIND[kind]
  const fields: Record<string, z.ZodType> = { kind: z.literal(kind) }
  for (const field of spec.identifies) {
    const value = z.string().min(1, { error: `${field.key} must not be empty: it is ${field.what}` })
    // AN IDENTIFIER THE DECLARATION MARKS OPTIONAL IS OPTIONAL HERE TOO, and it is still refused
    // when it is sent EMPTY. Absence and a blank string are different answers: one says nothing was
    // claimed, the other claims something and names nothing.
    fields[field.key] = field.optional === true ? value.optional() : value
  }
  return z.strictObject(fields)
})

const target = z.discriminatedUnion('kind', targetArms as [z.ZodObject, ...z.ZodObject[]], {
  error: `a target says what kind of thing it is. The kinds are: ${TARGET_KINDS.join(', ')}.`,
})

/**
 * THE WORDS, WHERE THEY WERE, AND WHICH STORED STRING THEY WERE IN.
 *
 * The quote is required and that is the point of the shape: without the words a comment cannot say
 * what it referred to once the text has changed, which is the one question this whole design exists
 * to answer honestly.
 */
const span = z.strictObject({
  quote: z.string().min(1, {
    error:
      'a quoted span stores the words it was about. Without them a comment cannot say what it referred to once ' +
      'the text has changed, which is the whole reason this shape exists.',
  }),
  from: z.number().int().min(0, { error: 'from is where the words started, counted from 0' }),
  to: z.number().int().min(0, { error: 'to is where the words ended, counted from 0' }),
  field: z.string().min(1).optional(),
})

/** Which revision this was written against. Both halves, and Mole Office checks the pair against the ledger. */
const revision = z.strictObject({
  seq: z.number().int().min(1, { error: 'seq is the revision number, 1 being the oldest' }),
  contentHash: z.string().min(1, {
    error: 'contentHash is the content hash of that same revision, from the same entry of the same list',
  }),
})

/**
 * EXPORTED, so the review routes validate an entry with the shape a comment is validated with.
 *
 * A review's entry is "the context it was started from" — the same three separable facts, checked
 * the same way. A second zod object saying the same thing in src/server/api/reviews.ts would be the
 * defect this repository names as its own: the two would drift the first time a target gained a
 * field, and the drift would show up as a review that refuses an entry a comment accepts.
 */
/**
 * WHERE SOMEBODY WAS INSIDE THE THING THEY POINTED AT, in the five shapes `Place` declares.
 *
 * It is a second declaration of a union that already exists in src/shared/targets.ts, and that is
 * the defect this repository keeps finding — so it is bound to the first one rather than trusted to
 * match it: `PLACES` is imported, and `tests/where-a-comment-was-made.ts` fails when a member is
 * added there and not here. A copy nothing checks would be free to accept what the other refuses.
 */
const place = z.discriminatedUnion('at', [
  z.strictObject({ at: z.literal('words'), span, cut: z.literal(true).optional() }),
  z.strictObject({
    at: z.literal('across'),
    from: span,
    to: span,
    parts: z.number().int().min(1, { error: 'parts counts the things the selection crossed, so it is at least 1' }),
    partWord: z.string().min(1, { error: 'partWord is the plural noun for whatever was crossed — blocks, rows, lines' }),
    cut: z.literal(true).optional(),
  }),
  z.strictObject({
    at: z.literal('quote'),
    words: z.string().min(1, {
      error:
        'a quote place keeps the words that were on screen, because no stored string can be shown to hold them. ' +
        'Without them nothing is kept at all.',
    }),
    cut: z.literal(true).optional(),
  }),
  z.strictObject({
    at: z.literal('run'),
    field: z.string().min(1),
    offset: z.number().int().min(0, { error: 'offset is where the run starts, counted from 0' }),
  }),
  z.strictObject({ at: z.literal('surface') }),
])

/**
 * WHICH DRAWING OF THE RECORD THE WRITER WAS LOOKING AT.
 *
 * A SECOND DECLARATION OF A SHAPE THAT ALREADY EXISTS, and that is this repository's own named
 * defect — so, like `place` above, it is bound to the first rather than trusted to match it: the
 * three closed lists are IMPORTED from where they are declared, not retyped. A seventh rung on the
 * ladder is accepted here the day it is declared there, and cannot be accepted here alone.
 *
 * IT DOES NOT DECIDE WHO MAY SEND ONE. This says the key exists and what may be in it. `checkView`
 * in src/server/lib/targets.ts is what refuses an agent, because that is a question about the
 * WRITER and a schema cannot see one. Both are needed and neither is the other.
 */
const view = z.strictObject({
  detail: z.enum(RUNGS, {
    error: `view.detail must be one of: ${RUNGS.join(', ')}. It is how much of the record was being drawn.`,
  }),
  pictures: z.enum(PICTURE_SETTINGS).optional(),
  size: z.enum(TEXT_SIZES).optional(),
})

/**
 * THE DOOR HAS TO DECLARE EVERY FIELD THE SHAPE DECLARES, and this is a strict object, so a key
 * missing here is a key the product's OWN browser cannot send. That is not a theoretical risk: it
 * is how `view` was found. The browser began writing one, the annotation route took it — its body
 * is `unknown` and read where the rules are — and this route answered
 * *Unrecognized key: "view"* for the same stored context, so a comment Mole Office had written itself
 * could not be handed to an agent. `tests/seven-surfaces.test.ts` is what caught it, by taking the
 * seven contexts the browser really wrote and posting each one back through here.
 */
/**
 * WHAT THE SCREEN SHOWED, when the thing pointed at holds no stored text of its own.
 *
 * ---------------------------------------------------------------------------------------
 * IT WAS MISSING HERE, AND THE COMPOSER SAID SOMETHING FALSE BECAUSE OF IT
 * ---------------------------------------------------------------------------------------
 *
 * `seenRuleFor` in src/shared/targets.ts REQUIRES this key for a target kind that holds no stored
 * text, which every part of Mole Office's own screen is. So the browser had to send it, and this
 * strict object refused it: one grammar, two doors, and they disagreed.
 *
 * WHAT THE OWNER SAW. They right-clicked the reading-length control on a report, wrote words, chose
 * an agent and pressed Send. The comment was written, was addressed to the agent they chose, was in
 * that conversation, and the agent answered it — and the composer said *Nothing was written. The
 * request body is not usable: context: Unrecognized key: "seen".* Invariant 1 of USER.md broken on
 * a screen: a reply saying a thing did not happen while it had. Problem `wgUEBO2o4AlI`.
 *
 * IT IS BOUND TO THE FIRST DECLARATION, not retyped, for the reason `place` and `view` above are:
 * a second spelling of one shape is this repository's own named defect. What may be inside a `seen`
 * is checked by `checkSeen` in src/server/lib/targets.ts, which is where the rule about WHEN it is
 * required and when it is refused lives; this only says the key exists.
 */
const seen = z.strictObject({
  route: z.string(),
  quote: z.string().optional(),
  cut: z.literal(true).optional(),
  build: z.string(),
})

export const anyContext = z.strictObject({
  target,
  span: span.optional(),
  place: place.optional(),
  seen: seen.optional(),
  revision: revision.optional(),
  view: view.optional(),
})

/**
 * Who a comment is for, in the three layers the eighth rule asks for: what was said, what Mole Office
 * made of it, and what was settled.
 *
 * `unresolved` is a real value and it is stored rather than refused: words that named more than one
 * agent are a fact about what somebody typed, and keeping them is what lets the screen show the
 * refusal beside the comment. It stops the dispatch; it does not stop the writing.
 *
 * EXPORTED FOR THE SAME REASON `anyContext` IS. Sending a review takes a choice of agent per
 * comment, and that choice is this same three-layer shape — checked by this object rather than by a
 * copy of it in api/reviews.ts, which would be free to accept something this one refuses.
 */
export const anyRecipient = z.strictObject({
  kind: z.enum(RECIPIENT_KINDS, {
    error:
      'recipient.kind must be "agent" (a durable agent named by recipient.agentId), "session" (a run named by ' +
      'recipient.sessionId), "new" (deliberately a fresh agent) or "unresolved" (words that named more than one ' +
      'agent or none).',
  }),
  /**
   * WHICH DURABLE AGENT, when the kind is "agent".
   *
   * It is a separate key from `sessionId` because they name different things and a reader of a
   * stored request has to be able to tell which was meant. A run ends; an agent does not.
   */
  agentId: z.string().min(1).nullish(),
  sessionId: z.string().min(1).nullish(),
  said: z.string().nullish(),
  why: z.string().nullish(),
})

const newMessage = z.strictObject({
  intent: z.enum(MESSAGE_INTENTS, {
    error: `intent must be one of: ${MESSAGE_INTENTS.join(', ')}. It is what you mean by writing this.`,
  }),
  body: z.string().min(1, { error: 'write what you want. A comment with no words says nothing.' }),
  context: anyContext.nullish(),
  // WHO IT IS FOR IS READ, NOT REQUIRED. `whoItIsFor` below says why this one field is `unknown`
  // here while every other field on this shape is checked. `.optional()` is not decoration: zod
  // treats a bare `unknown` inside a strict object as a key that must be PRESENT, so without it a
  // request that names no recipient at all — the ordinary case — is refused.
  recipient: z.unknown().optional(),
  // WHICH COMMENT THESE WORDS CAME FROM, when they came from one.
  //
  // ---------------------------------------------------------------------------------------
  // IT USED NOT TO BE ON ANY ROUTE, AND THE REASON IT IS NOW IS WORTH READING
  // ---------------------------------------------------------------------------------------
  //
  // The old note here said a caller must not be able to claim its words came from somebody else's
  // comment, so only `sendReview` — which makes the copy — could set it. That left the composer
  // path, which sends ONE comment, writing a message with no idea which comment it carried. The
  // link back to the record existed for a review send and not for the ordinary case.
  //
  // That mattered once `hasGoneOut` replaced the record's own `state` field: the gate that fixes
  // somebody's words asks whether a message carrying them has gone out, and a message that does not
  // say which comment it carried answers for nothing. A comment sent through the composer would
  // have become rewritable — the protection removed by the change that was meant to strengthen it.
  //
  // THE OLD WORRY IS ANSWERED RATHER THAN IGNORED. A message is written `queued`, and `hasGoneOut`
  // counts only messages past `queued`. So claiming a comment freezes nothing; what freezes it is
  // SENDING those words to somebody, which is what the gate is about. `addMessage` checks that the
  // id names a live comment in this project and refuses anything else by name, so the claim cannot
  // point at a record of another kind or another project's work.
  fromAnnotationId: z.string().min(1).nullish(),
})

/**
 * WHO A COMMENT IS FOR, WHATEVER SHAPE IT ARRIVED IN — because refusing the shape threw the words
 * away.
 *
 * Phase 8's whole invariant is that message durability must not depend on who the message is for.
 * `addMessage` was made to obey it — a recipient that names nobody, names the wrong kind of thing,
 * or names a run whose transcript is gone is stored, and dispatch is where it is refused. This
 * route's own note promises it in capitals. **And the promise was broken one layer above the
 * function that keeps it**: `recipient` was checked by zod before `addMessage` ever saw the body,
 * so a recipient of the wrong SHAPE refused the whole write with 400 and nothing was stored.
 * Measured 19 August 2026 on seven shapes, and the words were lost every time.
 *
 * So the shape is READ here rather than demanded. What was sent is kept exactly, as text, and
 * `unresolved` is the answer Mole Office already has for "who this is for is not settled" — it stops a
 * dispatch, it is drawn beside the comment, and it is corrected with PATCH /api/agent/messages/:id.
 * That is the eighth rule doing its ordinary job: loose input, strict storage, visible reading.
 *
 * THE CORRECTION ROUTE STAYS STRICT, and that is not an inconsistency. A patch that is refused
 * loses nothing, because what it would have changed is already stored.
 */
function whoItIsFor(sent: unknown): {
  kind: (typeof RECIPIENT_KINDS)[number]
  agentId?: string | null
  sessionId?: string | null
  said?: string | null
  why?: string | null
} | null {
  if (sent === undefined || sent === null) return null
  // READ INSIDE A WRAPPER SO THE COMPLAINT NAMES THE FIELD THE CALLER SENT. Given the bare value,
  // zod's path is `kind` and `explain` prefixes it to a message that already begins "recipient.kind
  // must be…", which reads as a stutter on a screen. One field deeper, the path IS the start of the
  // message and `explain` leaves it alone.
  const read = z.object({ recipient: anyRecipient }).safeParse({ recipient: sent })
  if (read.success) return read.data.recipient
  // WHAT WAS SENT IS KEPT, AS TEXT, AND IT GOES IN `why` RATHER THAN IN `said`. `said` is the words
  // a person typed about who they meant, and a structure a caller posted is not that — putting one
  // there would make the screen print "The words …" over a piece of JSON nobody wrote. `why` is
  // what Mole Office made of who this is for, which is exactly what this is. It is cut only if it is
  // long, and that length is a screen's limit rather than a judgement about the content.
  const asSent = JSON.stringify(sent) ?? String(sent)
  const kept = asSent.length > 300 ? `${asSent.slice(0, 300)}…` : asSent
  return {
    kind: 'unresolved',
    agentId: null,
    sessionId: null,
    said: null,
    why: `what was sent could not be read: ${kept}. ${explain(read.error)}`,
  }
}

const messagePatch = z
  .strictObject({
    intent: z.enum(MESSAGE_INTENTS, { error: `intent must be one of: ${MESSAGE_INTENTS.join(', ')}` }).optional(),
    body: z.string().min(1, { error: 'a comment must not be empty' }).optional(),
    context: anyContext.nullable().optional(),
    recipient: anyRecipient.nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, {
    error: 'send intent, body, context or recipient. An empty patch changes nothing.',
  })

const inboxQuery = z.strictObject({
  // OPTIONAL, because an agent's plain call answers its own inbox: the actor header already names
  // it. Problem `nIZnViByUerv` — the supervisor procedure says to call the door plainly, and the
  // door refused with "handle: expected string" unless ?handle= was given.
  handle: z
    .string()
    .min(1, {
      error: 'handle is the short name a person types to address an agent, like "round-ten".',
    })
    .optional(),
  state: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

const runQuery = z.strictObject({
  state: z.enum(RUN_STATES, { error: `state must be one of: ${RUN_STATES.join(', ')}` }).optional(),
})

const claimBody = z.strictObject({
  worker: z.string().min(1, {
    error:
      'say which worker this is. A run held by nobody-in-particular cannot be reported to a person who wants to ' +
      'know where their work went.',
  }),
})

const resultBody = z.strictObject({
  result: z.unknown().optional(),
  error: z.string().optional(),
  declined: z.boolean().optional(),
  tookMs: z.number().optional(),
})

// ---------------------------------------------------------------------------- routes

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  /** Start a conversation about this project's work. */
  app.post(
    '/agent/threads',
    route(
      'agent.thread-write',
      'remote',
      'Start a conversation with an agent about this project\'s work. Takes {title, mode}, where mode is "direct" ' +
        '(each comment is sent when you send it) or "review" (comments collect until you finish the review). ' +
        'Creates NO run: only POST /api/agent/threads/<id>/dispatch does that, which is what makes "nothing was ' +
        'sent before I finished" a property of the code. Answers 201 with the conversation.',
    ),
    async (req, reply): Promise<{ thread: AgentThreadView }> => {
      const actor = actorFrom(req)
      const body = parse(newThread, req.body, 'The request body is not usable:')
      reply.status(201)
      return { thread: createThread({ workspaceId: workspaceOf(req), title: body.title, mode: body.mode }, actor) }
    },
  )

  /** Every conversation about this project, newest movement first. */
  app.get(
    '/agent/threads',
    route(
      'agent.threads',
      'remote',
      'Every conversation about this project, most recently touched first. ?state=open|dispatched|answered|' +
        'abandoned and ?mode=direct|review narrow it. `counts` says how many are in each state so the interesting ' +
        'number needs no walk of the list. Each listed conversation also says whether the last word was an agent’s, ' +
        'whether it needs the person’s attention, the newest run state and the run count. Writes nothing.',
    ),
    async (req): Promise<ThreadListReply> => {
      const q = parse(threadQuery, req.query, 'The query string is not usable:')
      // ONLY THE CONVERSATIONS THE CALLER MAY READ are listed or counted.
      return listThreads({ workspaceId: workspaceOf(req), state: q.state, mode: q.mode, reader: theMessageReader(actorFrom(req)) })
    },
  )

  /**
   * One conversation: what was said, what each comment points at, and the runs it produced.
   *
   * Every comment carries a READING of its context — whether what it points at is still there,
   * whether the quoted words have moved, or whether the thing is gone. Computed on this request and
   * never stored, because a stored answer to "is this still there" is only ever right by accident.
   */
  app.get(
    '/agent/threads/:id',
    route(
      'agent.threads',
      'remote',
      'One conversation: every comment in order with what it points at, who it is for and how it was routed, and ' +
        'every run it produced with what came back. Each comment carries a reading of its context — "there", ' +
        '"changed" (the object is there and the quoted words moved or went) or "gone" — computed on this request, ' +
        'never stored. A run that nobody has claimed says so in words rather than showing a spinner. Writes nothing.',
    ),
    async (req): Promise<ThreadDetail> => {
      const { id } = parse(threadIdParams, req.params, 'The URL is not usable:')
      // A CONVERSATION THE CALLER MAY NOT READ IS REFUSED.
      return readThread(id, workspaceOf(req), theMessageReader(actorFrom(req)))
    },
  )

  /** Rename a conversation, or abandon it. */
  app.patch(
    '/agent/threads/:id',
    route(
      'agent.thread-write',
      'remote',
      'Change a conversation\'s title, or abandon it. Takes {title?, state?}. "dispatched" and "answered" are ' +
        'REFUSED here with 409: a dispatched conversation is one the dispatch route wrote and an answered one is ' +
        'one a result answered, so setting either by hand would make a conversation look sent when nothing was. ' +
        'Only an abandoned conversation may be reopened.',
    ),
    async (req): Promise<{ thread: AgentThreadView }> => {
      // READ AND NOT PASSED ON, deliberately. `agent_threads` has `created_by` and no `updated_by`,
      // so there is nowhere to record who renamed a conversation — that is a gap in the columns and
      // not a decision made here. Reading the headers still refuses a broken identity, the way it
      // does on every other write, so this route does not become the one with looser rules.
      const changer = actorFrom(req)
      const { id } = parse(threadIdParams, req.params, 'The URL is not usable:')
      const body = parse(threadPatch, req.body, 'The request body is not usable:')
      // A CONVERSATION THE CALLER MAY NOT READ IS REFUSED as one that is not there, as the reads refuse it
      // .
      return { thread: patchThread(id, workspaceOf(req), body, theMessageReader(changer)) }
    },
  )

  /**
   * Say something, about something, to somebody.
   *
   * WRITES NO RUN, in either mode. A direct conversation dispatches immediately afterwards and a
   * review waits; both go through the same door, which is why there are not two systems here.
   */
  app.post(
    '/agent/threads/:id/messages',
    route(
      'agent.thread-write',
      'remote',
      'Say something, about something, to somebody. Takes {intent, body, context?, recipient?}. `intent` is one ' +
        'of ask, discuss, review, change, start — what you mean by writing it. `context` is what it points at, and ' +
        'it is THREE SEPARABLE FACTS: {target:{kind,…}} says what thing, {span:{quote,from,to,field?}} narrows it ' +
        `to the exact words, and {revision:{seq,contentHash}} says which version it was written against. The ` +
        `things you can point at are: ${TARGET_KINDS.join(', ')} — GET /api/kinds serves the Target shape and ` +
        'says what identifies each. THE QUOTED WORDS ARE STORED, so the comment still says what it was about ' +
        'after the text changes: `from` and `to` are hints and are never repaired, and a read answers there, ' +
        'changed, gone, or unknown when Mole Office cannot look that kind of thing up yet. A `revision` is CHECKED ' +
        'against the ledger — send the seq and the contentHash from one entry of ' +
        'GET /api/records/<id>/revisions — and is never filled in for you, because stamping the newest revision ' +
        'would claim you had read it. Leaving it out means nobody recorded which version was on screen. ' +
        '`recipient` is {kind:"session",sessionId} ' +
        'for an agent already working on this, {kind:"new"} for a fresh one, or {kind:"unresolved",said} for words ' +
        'that named more than one. WHO IT IS FOR NEVER STOPS THE WORDS BEING STORED: a recipient that names ' +
        'nobody, names the wrong kind of thing, or names a run whose transcript is not on this machine is stored ' +
        'as it was sent, and the reply carries `delivery`, which says whether it can be sent and, when it cannot, ' +
        'why in one sentence. That is the same sentence dispatch acts on. AND A RECIPIENT IN A SHAPE THIS ROUTE ' +
        'CANNOT READ AT ALL IS THE SAME CASE: the comment is stored, `recipient.kind` is "unresolved", and ' +
        '`recipient.why` holds what was sent along with what was wrong with it. Fix it with PATCH ' +
        '/api/agent/messages/<id>, which does check the shape — a refused correction loses nothing, because what ' +
        'it would have changed is already stored. ' +
        'The role is your own actor type and is not taken from the body. CREATES NO RUN. Answers 201.',
    ),
    async (req, reply): Promise<{ message: AgentMessageView }> => {
      const actor = actorFrom(req)
      const { id } = parse(threadIdParams, req.params, 'The URL is not usable:')
      const body = parse(newMessage, req.body, 'The request body is not usable:')
      reply.status(201)
      return {
        message: addMessage(
          id,
          workspaceOf(req),
          {
            intent: body.intent,
            body: body.body,
            context: (body.context ?? null) as MessageContext | null,
            recipient: whoItIsFor(body.recipient),
            fromAnnotationId: body.fromAnnotationId ?? null,
          },
          actor,
          // A CONVERSATION THE CALLER MAY NOT READ IS REFUSED as one that is not there.
          theMessageReader(actor),
        ),
      }
    },
  )

  /** Change a comment, while it is still waiting. */
  app.patch(
    '/agent/messages/:id',
    route(
      'agent.thread-write',
      'remote',
      'Change a comment WHILE IT IS STILL WAITING. Takes {intent?, body?, context?, recipient?} — the same shapes ' +
        'POST /api/agent/threads/<id>/messages takes, and recipient:null takes the address off again. This is how ' +
        'a comment dispatch could not send is corrected, so a new recipient is stored without being checked and ' +
        'the reply says what Mole Office makes of it. A comment that has already been sent is refused with 409 naming ' +
        'what it went out with: changing the question after the answer was given would leave an answer nobody can ' +
        'check. An agent\'s answer is refused too, in any state: nothing may rewrite what an agent said. ' +
        'A comment somebody else wrote is refused with 403, because only its writer may change it.',
    ),
    async (req): Promise<{ message: AgentMessageView }> => {
      // ONLY A COMMENT'S WRITER MAY CHANGE IT: it goes out under that writer's name, and
      // `patchMessage` refuses anybody else. The actor's type also decides whether a context may
      // store `view`: it says what was on a screen and an agent has none. `checkView` in lib/targets.ts.
      const changer = actorFrom(req)
      const { id } = parse(messageIdParams, req.params, 'The URL is not usable:')
      const body = parse(messagePatch, req.body, 'The request body is not usable:')
      return {
        message: patchMessage(
          id,
          workspaceOf(req),
          {
            intent: body.intent,
            body: body.body,
            context: body.context === undefined ? undefined : ((body.context ?? null) as MessageContext | null),
            recipient: body.recipient,
          },
          changer,
          // A COMMENT IN A CONVERSATION THE CALLER MAY NOT READ IS REFUSED as one that is not there.
          theMessageReader(changer),
        ),
      }
    },
  )

  /** Take a comment out of a review, while it is still waiting. */
  app.delete(
    '/agent/messages/:id',
    route(
      'agent.thread-write',
      'remote',
      'Take a comment out of a review WHILE IT IS STILL WAITING. Answers with the comment that was removed and how ' +
        'many are still waiting in that conversation. A comment that has already been sent is refused with 409 for ' +
        'the same reason PATCH refuses one. ' +
        'A comment somebody else wrote is refused with 403, because only its writer may remove it.',
    ),
    async (req): Promise<MessageRemoved> => {
      const remover = actorFrom(req)
      const { id } = parse(messageIdParams, req.params, 'The URL is not usable:')
      // A COMMENT IN A CONVERSATION THE CALLER MAY NOT READ IS REFUSED as one that is not there.
      return removeMessage(id, workspaceOf(req), remover, theMessageReader(remover))
    },
  )

  /**
   * Send, or Finish review. THE ONLY DOOR THAT CREATES A RUN.
   *
   * `tests/one-run-door.test.ts` walks the source and fails if a second place inserts into
   * `agent_runs`, so "nothing was sent before I pressed this" is a property of the code rather than
   * a promise somebody made.
   */
  app.post(
    '/agent/threads/:id/dispatch',
    route(
      'agent.dispatch',
      'local',
      // THE ONE ROUTE WHERE A REQUEST CAN START A PROCESS HERE. It writes the `agent_runs` rows
      // tools/agent-worker.mjs polls and executes, so it is the only place in the whole route table
      // where a caller elsewhere could reach a process on this host. H.7 forbids that by name.
      { because: 'starts-work-on-this-machine', act: 'Sending a thread to an agent' },
      'Send, or Finish review. THE ONLY PLACE A RUN IS EVER CREATED — a test walks the source and fails if a ' +
        'second one appears, so "nothing was sent before I finished the review" is a property of the code. Takes ' +
        'no body. Every dispatch needs the person\'s proved press or a proved key carrying their authority, and each ' +
        'run it writes gets a key minted on that proof. A new agent is registered with the person as starter and ' +
        'a unique handle. A comment for a retired agent is not sent; it stays queued, and the chat offers Start a ' +
        'new agent. Groups every waiting comment by who it is for and writes ONE RUN PER RECIPIENT, all naming this ' +
        'one conversation, so a review may be partitioned between agents while staying one human act; the reply ' +
        'says which agent got which comments. IT SENDS WHAT IT CAN AND SAYS WHAT IT COULD NOT: a comment that ' +
        'names nobody, or names a run Mole Office has no resume id for, STAYS BEHIND rather than stopping the rest — ' +
        '`held` names each one with the sentence saying why, it is still queued, still editable and still marked ' +
        'on its page, and pressing this again after one correction sends it. The conversation is only moved to ' +
        '"dispatched" when nothing is left waiting in it. When NOT ONE comment can be sent there is no half to ' +
        'send, so it answers 409, writes nothing, and names them all.',
    ),
    async (req, reply): Promise<DispatchOutcome> => {
      const actor = actorFrom(req)
      const { id } = parse(threadIdParams, req.params, 'The URL is not usable:')
      // IT SAYS "Takes no body" AND MUST MEAN IT. There is nothing to configure here: what is sent
      // is every comment still waiting, and who each one is for is on the comment. A key this route
      // read from the body — a recipient for the lot, a subset of comments — would be a second way
      // to decide what a dispatch does, next to the comments themselves.
      takesNoInput(
        req,
        `POST /api/agent/threads/${id}/dispatch`,
        'It sends every comment still waiting in this conversation, and who each one is for is on the comment. ' +
          'Change a comment with PATCH /api/agent/messages/<id> before you send.',
      )
      reply.status(201)
      return dispatchThread(id, workspaceOf(req), actor)
    },
  )

  /**
   * What a worker may pick up.
   *
   * TAKES NO PROJECT HEADER, for the reason in this file's header: a worker serves a machine and
   * cannot know which projects exist. Every row says which project its conversation is about.
   */
  app.get(
    '/agent/runs',
    route(
      'agent.runs',
      // IT IS REMOTE, AND AN ANSWER SETTLED IT. Proposal `Mk1VfP8L31Uz` was held local because
      // agent-coordination.md 10.3 declared the three run routes local and remote-access.md 6.8
      // argued them remote, both citing the same source, and the fallback was the one that forbade more. Answer
      // 3 settles it — a worker on another machine may do these things —
      // and criterion P21 names the three: reading the queue, claiming a run
      // and returning its result. The read goes with the other two, which the draft could not assume
      // and the answer does.
      //
      // STARTING A RUN DID NOT MOVE. `POST /api/agent/threads/:id/dispatch` is still `local`,
      // because creating a run is what starts work on this machine; criterion P22.
      'remote',
      'The runs, across every project — a worker serves this machine and not one project, so this takes NO ' +
        'workspace header, offers no filter by project, and every row says which project its conversation is ' +
        'about. ?state=queued is what a worker polls for. It does NOT carry the assembled request: that comes ' +
        'back from the claim, to the worker that took it, so polling the queue is cheap and reading it is not the ' +
        'same act as taking the work. A run nobody has claimed says so in words. A "declined" run is still ' +
        'waiting: a worker looked at it and could not serve it, and another worker may claim it. Writes nothing.',
    ),
    async (req): Promise<RunListReply> => {
      const q = parse(runQuery, req.query, 'The query string is not usable:')
      return listRuns({ state: q.state })
    },
  )

  /**
   * A worker takes a run and gets the context.
   *
   * Compare and set: two workers racing cannot both get it, and the second is refused by name.
   */
  app.post(
    '/agent/runs/:id/claim',
    route(
      'agent.run-claim',
      // Remote on answer 3, with agent.runs above. Criterion P21.
      'remote',
      'A worker takes one run and gets the assembled context. THE MACHINE THAT TOOK IT IS RECORDED ON THE RUN, ' +
        'measured from the connection and never sent in — a worker naming its own machine could name anybody\'s — ' +
        'and the conversation says which machine answered. Takes {worker}, the worker session id so the office ' +
        'can check its registered local process after it disappears. Older labels remain readable but cannot ' +
        'be checked for a gone process. COMPARE AND SET: the state is ' +
        'checked and written in one statement, so two workers racing cannot both get it — the second is refused ' +
        'with 409 naming who has it. The reply carries the request EXACTLY AS IT WAS WRITTEN AT DISPATCH and never ' +
        'rewritten, so an answer can be read against the question that produced it: the project, the conversation, ' +
        'each comment with its intent and what it points at, and what to resume. It carries ids and a sentence ' +
        'about each one, not copies of records — the agent reads Mole Office over the API. A declined run may be ' +
        'claimed, because it is still waiting. For a newly registered agent, the caller must send the office\'s ' +
        'key or the person\'s key; only the successful claim carries runKey, for the child\'s environment.',
    ),
    async (req): Promise<ClaimedRun> => {
      const { id } = parse(runIdParams, req.params, 'The URL is not usable:')
      const body = parse(claimBody, req.body, 'The request body is not usable:')
      // WHICH MACHINE TOOK IT, MEASURED. Criterion P23 asks for this. `writtenFrom`
      // reads the socket, or the forwarded header for the door a private network daemon passes
      // requests through, and says which of the three it is. The claim body has no field for it:
      // this is the one thing about a claim that a worker must not be able to say for itself.
      return claimRun(id, body.worker, writtenFrom(req).machine, actorFrom(req))
    },
  )

  /** The answer, the failure, or a decline. */
  app.post(
    '/agent/runs/:id/result',
    route(
      'agent.run-result',
      // Remote on answer 3, with agent.runs above. Criterion P21.
      'remote',
      'The answer, the failure, or a decline. Takes {result} for an answer, {error} for a failure, or ' +
        '{error, declined:true} for "this worker cannot serve this run" — which is NOT a failure: the run stays ' +
        'waiting for a worker that can, rather than a fresh agent that has never heard of the work being started ' +
        'in its place. A result may carry {answer, wrote:[…], focus:{record}|{plan,line}}; the focus is STORED AS ' +
        'SENT and checked on every read, so one naming a record nobody has is reported as such rather than shown ' +
        'as a working link. THE `answer` BECOMES A MESSAGE IN THE CONVERSATION, with role "agent" and the id of ' +
        'this run on it, so a person can reply to it and can point at part of it and carry on from those words; ' +
        'the reply carries it as `answer`. A result with no `answer` string adds no message and says so, because ' +
        'a message saying "this run finished" would be words the agent never wrote. A run that has already ended ' +
        'is refused with 409 rather than overwritten.',
    ),
    async (req): Promise<RunFinished> => {
      const { id } = parse(runIdParams, req.params, 'The URL is not usable:')
      const body = parse(resultBody, req.body, 'The request body is not usable:')
      return finishRun(id, body)
    },
  )

  /** Which objects on this project's pages have a comment waiting. */
  app.get(
    '/agent/marks',
    route(
      'agent.inbox',
      'remote',
      'Which things have a comment waiting, so a page can mark all of them in one request. One entry per thing ' +
        'with how many comments are waiting on it, the conversations they are in, and the words any of them ' +
        'quoted. A comment on a span of text marks the thing the words are in. `key` is the same string an ' +
        'addressable element on screen carries as its `data-target` attribute — the kind, then the values that ' +
        'identify it, separated by "/" — so a page compares what it drew with what came back and there is one ' +
        'spelling of a key in the product. `spans` carries the quoted words WITH where they were and which ' +
        'stored string they came from, which is what lets a page light the exact characters rather than search ' +
        'the page for the words. `covers` says what this answer ' +
        'includes: comments still waiting in an OPEN conversation about this project, and nothing else. It does ' +
        'not say whether the object is still there — GET /api/agent/threads/<id> says that. Writes nothing.',
    ),
    // ONLY THE CONVERSATIONS THE CALLER MAY READ are marked, as the reads list them.
    async (req): Promise<MarksReply> => marksIn(workspaceOf(req), theMessageReader(actorFrom(req))),
  )

  /**
   * THE CONVERSATION MESSAGES FOR ONE DURABLE AGENT.
   *
   * IT DOES NOT LIST A MESSAGE RECORD. A message filed through POST /api/records, which is how a
   * supervisor writes to its worker, is read at GET /api/handles/<handle>/waiting and
   * GET /api/messages?only=waiting-for-me, and the reply's `says` names both. Measured in
   * tests/a-worker-reads-its-messages-at-the-waiting-door.test.ts.
   *
   * It changes no state, and that is a rule rather than an omission: reading an inbox is not
   * receiving it. A route that quietly moved a message on because somebody looked at a screen would
   * report that an agent had been given the words when what happened was that a person opened a
   * page.
   */
  app.get(
    '/agent/inbox',
    route(
      'agent.inbox',
      'remote',
      'The messages in conversations for one durable agent: the conversations a person, a comment or a run ' +
        'starts. IT DOES NOT LIST A MESSAGE FILED AS A RECORD OF KIND message, which is how one agent writes to ' +
        'another through POST /api/records. Those are at GET /api/handles/<handle>/waiting (the ones still ' +
        'queued for that agent, in every project, by id) and GET /api/messages?only=waiting-for-me&full=1 (asked as ' +
        'that agent: the ones in this project not yet marked seen, with their words). `handle` is the short ' +
        'name a person types to address ' +
        'it; leave it off and send the agent’s own identity as x-mole-office-actor-type: agent with ' +
        'x-mole-office-actor-id: <handle>, and this answers that agent’s own inbox. ANY HANDLE THAT AGENT ' +
        'HAS EVER HAD resolves — a rename does not strand mail, and the reply says ' +
        '`resolvedThrough` when the name you asked by is not the current one. An unknown handle answers 404 and ' +
        'names the handles that do exist, because a mistyped handle that silently opened a second inbox would ' +
        'receive nothing for ever. `state` narrows to some of the six words a message may hold, and defaults to ' +
        'the three that mean somebody is still waiting: sent, delivered, picked_up. IT CHANGES NOTHING — reading ' +
        'an inbox is not receiving it. The inbox is a query over the messages themselves, so it survives this ' +
        'server being stopped and started: an agent is a durable identity and a run is not. A SECRETARY\'S inbox ' +
        'also carries `loginsWeek`: what the sandboxes\' Claude login last said of its own use, and each other ' +
        'login\'s use over the last seven days from the runs\' receipts, with what could not be counted.',
    ),
    async (req): Promise<InboxReading> => {
      const workspaceId = workspaceOf(req)
      const query = parse(inboxQuery, req.query, 'The query string is not usable:')
      // THE HANDLE COMES FROM `?handle=` OR FROM THE ACTOR HEADER. An agent that calls this door
      // plainly is asking for its own inbox — problem `nIZnViByUerv`, where the supervisor procedure
      // said to call it plainly and the door refused unless the query was there.
      const actor = actorFrom(req)
      const handle = query.handle ?? (actor.type === 'agent' ? actor.id : undefined)
      if (handle === undefined) {
        throw new PanelError(
          'This call named no agent. Send ?handle=<handle>, or send the agent’s own identity as ' +
            'x-mole-office-actor-type: agent with x-mole-office-actor-id: <handle>, and this answers that ' +
            'agent’s inbox.',
          400,
        )
      }
      const agent = agentByHandle(handle, workspaceId)
      if (agent === null) {
        const known = [...handlesInUse(workspaceId).keys()].sort()
        throw new PanelError(
          `No agent in this project has the handle "${handle}", and none ever has. ` +
            (known.length === 0
              ? 'No agent has been created in this project yet: POST /api/records {"kind":"agent","title":"…",' +
                '"data":{"handle":"…","state":"active"}}.'
              : `The handles that exist here are: ${known.join(', ')}.`),
          404,
        )
      }
      // AN AGENT READS ITS OWN INBOX AND NO OTHER: the messages in it are addressed
      // to that agent. The owner, a secretary and the message worker may read any agent's (`mayReadTheInboxOf`).
      if (!mayReadTheInboxOf(theMessageReader(actor), agent.id)) {
        throw new PanelError(onlyItsOwnInbox(handle), 403)
      }
      const states =
        query.state === undefined
          ? undefined
          : query.state.split(',').map((word) => word.trim()).filter((word) => word !== '')
      for (const word of states ?? []) {
        if (!isMessageState(word)) {
          throw new PanelError(
            `"${word}" is not one of the words a message may hold. They are: ${MESSAGE_STATES.join(', ')}.`,
            400,
          )
        }
      }
      const reading = inboxOf(agent, workspaceId, {
        states: states as readonly MessageState[] | undefined,
        limit: query.limit,
      })
      // A SECRETARY'S INBOX CARRIES EACH LOGIN'S WEEK (lib/logins-week.ts), the figures its 50% and 80% notices are about.
      const loginsWeek = theLoginsWeekForASecretary(agent.handle)
      // THE READING'S SENTENCE NAMES NO REQUEST, because a copy carries it too (criterion B19). This
      // reply's reader has an API, so it is told where the message records are.
      return {
        ...reading,
        ...(loginsWeek === null ? {} : { loginsWeek }),
        says:
          `${reading.says} Messages filed as records to ${agent.handle} are at ` +
          `GET /api/handles/${agent.handle}/waiting and, asked as ${agent.handle}, ` +
          'GET /api/messages?only=waiting-for-me&full=1.',
      }
    },
  )
}
