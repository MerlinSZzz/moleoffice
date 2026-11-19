// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The review routes: start collecting here, see what is in it, and finish collecting.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS
 * ---------------------------------------------------------------------------------------
 *
 * The door, and nothing else. What counts as inside a review, which remarks are in one, and what
 * happens at the boundary all live in src/server/lib/reviews.ts. Three steps per handler, the same
 * order as api/records.ts and api/agents.ts: work out who is asking, check the input, call one
 * function in the library.
 *
 * ---------------------------------------------------------------------------------------
 * THE ROUTES ARE THE WHOLE CONTRACT
 * ---------------------------------------------------------------------------------------
 *
 *   POST /api/reviews                        start collecting here, or come back to the one that is
 *   GET  /api/reviews                        this project's reviews; ?covers= asks about one thing
 *   GET  /api/reviews/:id                    one review: what is in it, and what each remark is on
 *   GET  /api/reviews/:id/not-in-it          the comments it did not take, each with why
 *   POST /api/reviews/:id/finish-collecting  write the membership down. SENDS NOTHING
 *   POST /api/reviews/:id/abandon            end it. SENDS NOTHING, and the comments are untouched
 *   POST /api/reviews/:id/recipient          say who the whole review goes to. SENDS NOTHING
 *   POST /api/reviews/:id/discard            delete the comments a collecting review holds. SENDS NOTHING
 *   GET  /api/reviews/:id/organise           what an interpreter is asked about these comments
 *   POST /api/reviews/:id/organise           the reading that came back, checked and kept
 *   GET  /api/reviews/:id/send               where every comment would go. WRITES NOTHING
 *   POST /api/reviews/:id/send               it goes: one message to each recipient. WRITES NO RUN
 *
 * FINISHING COLLECTING AND SENDING ARE TWO ACTS WITH A GAP BETWEEN THEM, and the gap is the two
 * organise routes: the person reads what Mole Office made of their words and fixes it before anybody
 * acts on it. The send does not require that they did — see `sendReview` for the argument, which
 * turns on Mole Office not being able to read the words itself.
 *
 * NOTHING IN A REVIEW CREATES A RUN. Writing a comment, finishing collecting and organising write no
 * row in `agent_runs` at all, and since wave 13u round 19 the send writes none either: it writes the
 * comments into one conversation, has `dispatchThread` work out who each goes to without a run, and
 * gives each recipient one message in the message pool. This follows problem eCrK1atZOrvA and a decision.
 * `PATCH /api/reviews/:id` still refuses the word
 * "sent" — a review is sent by sending it.
 *
 * THE INTERPRETER IS NOT IN THIS SERVER AND CANNOT BE. Nothing under `src/` may start a process, and
 * the runtime that answers on this machine is a command. So the GET says what to ask and the POST
 * checks what comes back, which is the same shape as agent work: Mole Office asks, something outside it
 * runs, and the strict layer is the only way back in.
 *
 * THERE IS NO ROUTE THAT DELETES A REVIEW. A review is never deleted. `abandon` is not a delete: it
 * ends the review, keeps it readable and listed, and leaves every comment in it exactly as it was.
 *
 * EVERY ROUTE READS `x-mole-office-workspace`, because a review is of one project's work and a review id
 * from another project is refused by name.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  NOT_IN_IT_SHOWN,
  REVIEW_REACHES,
  REVIEW_STATES,
  TAKEN_OUT_BECAUSE,
  abandonReview,
  chooseWhoTheReviewGoesTo,
  discardTheComments,
  commentsAReviewHasNotSentYet,
  commentsNotIn,
  finishCollecting,
  keepOrganised,
  listReviews,
  organiseRequest,
  readReview,
  sendReview,
  setState,
  startReview,
  takeOutOfTheReview,
  whereTheCommentsWouldGo,
  type ChoiceForOneComment,
  type CommentsNotInReview,
  type DiscardOutcome,
  type OrganiseOutcome,
  type ReviewDetail,
  type ReviewListReply,
  type ReviewScope,
  type ReviewView,
  type SendOutcome,
  type TakeOutOutcome,
  type WhereTheyGo,
} from '../lib/reviews.ts'
import type { InterpreterRequest } from '../lib/interpret.ts'
import { actorFrom, takesNoInput } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
// WHO MAY READ WHICH MESSAGE: wave 13j's one rule. The four doors that show a
// comment's words hand it the caller, and lib/reviews.ts leaves out what the caller may not read.
import { refuseAMessageThisReaderMayNotRead, theMessageReader } from '../lib/messages.ts'
import { workspaceOf } from '../lib/workspaces.ts'
// THE ONE SHAPE THAT VALIDATES A CONTEXT. A review's entry is the same three separable facts a
// comment stores, so it is checked by the same object rather than by a copy of it.
import { anyContext, anyRecipient } from './agents.ts'
import type { Context } from '@shared/targets.ts'
import { route } from '../lib/route.ts'

// ---------------------------------------------------------------------------- input shapes

const reviewIdParams = z.object({
  id: z.string().min(1, { error: 'the URL must contain a review id — GET /api/reviews lists them' }),
})

const newReview = z.strictObject({
  entry: anyContext,
  /**
   * HOW WIDE IT IS. Omitted means `local`, which is what every review in this product was.
   *
   * `global` is the whole project, and it is the one answer nothing can reach by accident: a page
   * and a part of the screen used to widen to the project silently, and both now refuse and say to
   * ask for this instead.
   */
  reach: z
    .enum(REVIEW_REACHES, { error: `reach must be one of: ${REVIEW_REACHES.join(', ')}` })
    .optional(),
  /**
   * THE AGENT RECORD OF THE AGENT THAT ASKED FOR THIS REVIEW, where one did.
   *
   * It does one thing: it puts that agent first in the recipient picker for this review. An agent
   * may ASK for a review and may not start one, so this is only kept when a person is asking — an
   * agent that sends it about itself is ignored rather than refused, because the ask is an ordinary
   * proposal and this field is not how it is granted.
   */
  startedByAgent: z.string().min(1).nullish(),
})

const reviewQuery = z.strictObject({
  state: z.enum(REVIEW_STATES, { error: `state must be one of: ${REVIEW_STATES.join(', ')}` }).optional(),
  covers: z
    .string()
    .min(1, {
      error:
        'covers is the `data-target` value of one thing — the kind, then the values that identify it, separated ' +
        'by "/". It narrows the list to the reviews collecting that thing.',
    })
    .optional(),
})

const holdingQuery = z.strictObject({
  comment: z.string().min(1, { error: 'comment is the id of one comment, a record of kind "message"' }),
})

const reviewRecipient = z.strictObject({
  recipient: z.strictObject({
    kind: z.literal('agent', { error: 'a review goes to an agent, so recipient.kind is "agent"' }),
    agentId: z.string().min(1, { error: "recipient.agentId is the agent's record id — GET /api/participants lists them" }),
  }),
})

const reviewPatch = z.strictObject({
  state: z.enum(REVIEW_STATES, { error: `state must be one of: ${REVIEW_STATES.join(', ')}` }),
})

/**
 * WHO EACH COMMENT IS FOR, WHERE THE PERSON CHOSE BY HAND.
 *
 * OPTIONAL, AND ONE ENTRY PER COMMENT AT MOST. A comment nobody chose an agent for is routed from
 * the words the person wrote on it, and a comment with neither is not sent — the reply names it.
 *
 * THE RECIPIENT SHAPE IS api/agents.ts's OWN. A copy of it here would be a second statement of what
 * "who this is for" looks like, free to accept something the write path refuses.
 *
 * IT IS STRICT, unlike the recipient on a comment being written, and the difference is what is at
 * stake: refusing a comment's recipient threw away the words somebody had just typed, and refusing
 * a choice made here loses nothing at all, because every comment it is about is already stored.
 */
const sendChoices = z.strictObject({
  to: z
    .array(
      z.strictObject({
        commentId: z.string().min(1, { error: 'each choice names the comment it is about, by its record id' }),
        recipient: anyRecipient.nullable(),
      }),
    )
    .optional(),
  /**
   * SEND ONLY THESE COMMENTS OF THE REVIEW. Left out, every comment that can go goes.
   *
   * IT IS HOW "SEND THIS COMMENT" IS ONE REVIEW AND ONE CONVERSATION. The review pane has a press
   * on each comment's row, and that press has to send that comment and leave the others alone
   * without making a second conversation for it. Naming the comments here is that, and it goes
   * through the same function, the same conversation and the same delivery reading as the whole
   * review.
   */
  only: z
    .array(z.string().min(1, { error: 'each entry names one comment of this review, by its record id' }))
    .optional(),
})

/** One press under one comment: which comment, and which of the two presses. */
const takeOutPress = z.strictObject({
  comment: z.string().min(1, { error: 'the press names the comment it is about, by its record id' }),
  because: z.enum(TAKEN_OUT_BECAUSE),
})

// ---------------------------------------------------------------------------- routes

export async function reviewRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Start collecting here — or come back to the review already collecting here.
   *
   * ONE ROUTE FOR BOTH, because coming back is somebody standing in the same place again and saying
   * "collect this". A second route would make a second review out of an afternoon's break.
   */
  app.post(
    '/reviews',
    route(
      'review.start',
      'remote',
      'Start collecting comments here. Takes {entry}, which is the context you were standing in — the same ' +
        '{target, span?, revision?} shape a comment stores. WHAT THE REVIEW COLLECTS IS DERIVED FROM THAT AND ' +
        'NEVER CHOSEN: started from a record, that record and everything stored as part of it; from a line of a ' +
        'plan, that plan; from a block on the week, that block; from a message, its conversation. A page and a ' +
        'part of the screen name no place, so a review of one place cannot be started from either and the ' +
        'refusal says so. THE ONE THING THAT IS CHOSEN IS HOW WIDE IT IS: {reach} takes "local", the default and ' +
        'what every review was, or "global", the whole project, where the entry says where you were standing and ' +
        'decides nothing. AT MOST ONE PROJECT-WIDE REVIEW COLLECTS PER PROJECT — a second answers 409 naming who ' +
        'holds the first. {startedByAgent} names the agent that asked for this review, which puts it first in ' +
        'the recipient picker and does nothing else. `rule` in the reply says what is ' +
        'inside in words. IF YOU WERE ALREADY COLLECTING HERE this answers 200 with that same review and ' +
        '`started: false` — leaving the place a review was started from stops it collecting there and ends ' +
        'nothing, so coming back resumes rather than starting a second one. Answers 201 with `started: true` for ' +
        'a new one. Creates no conversation and no run, and sends nothing.',
    ),
    async (
      req,
      reply,
    ): Promise<{ review: ReviewView; started: boolean; rule: ReviewScope; says: string }> => {
      const actor = actorFrom(req)
      const body = parse(newReview, req.body, 'The request body is not usable:')
      // CAST, the way api/agents.ts casts a comment's context, and for the same reason: the zod
      // union is BUILT from the target declaration at import time, so its inferred type is a plain
      // object rather than the discriminated `Target`. The shape has been checked; the type has not
      // been narrowed. `checkContext` inside `startReview` is what refuses a target nothing holds.
      const entry = body.entry as unknown as Context
      const outcome = startReview(
        { workspaceId: workspaceOf(req), entry, reach: body.reach, startedByAgent: body.startedByAgent ?? null },
        actor,
      )
      reply.status(outcome.started ? 201 : 200)
      return outcome
    },
  )

  /** This project's reviews, newest first. */
  app.get(
    '/reviews',
    route(
      'review.list',
      'remote',
      'Every review of this project, most recently started first. ?state=collecting|collected|organised|sent ' +
        'narrows it, and `counts` says how many are in each state. ?covers=<data-target value> narrows it to the ' +
        'reviews whose scope includes one particular thing — which is how a page asks "is anything collecting ' +
        'where I am standing right now". That question is answered here rather than in the browser so that there ' +
        'is one statement of what a scope includes. A review whose entry has since been deleted is listed like ' +
        'any other and matches no `covers`, because Mole Office cannot say what it collects. At most 200 come back ' +
        'and `leftOut` says how many did not. Writes nothing.',
    ),
    async (req): Promise<ReviewListReply> => {
      const q = parse(reviewQuery, req.query, 'The query string is not usable:')
      return listReviews({
        workspaceId: workspaceOf(req),
        state: q.state,
        covers: q.covers,
        reader: theMessageReader(actorFrom(req)),
      })
    },
  )

  /**
   * WHICH REVIEW, IF ANY, HOLDS ONE COMMENT BACK UNTIL IT IS SENT. Problem 7VI4cV5ppiFQ.
   *
   * The review column offers to send a comment saved without sending. Where a review lists that comment, choosing
   * who it is for does not send it: the message worker holds it until the review is sent (problem g4M_z6965R5o). The
   * column asks here so that its words say which of the two will happen. It is the worker's own reading,
   * `commentsAReviewHasNotSentYet`, so the column and the worker cannot disagree.
   */
  app.get(
    '/reviews/holding',
    route(
      'review.read',
      'remote',
      'Which review, if any, holds one comment back until that review is sent. ?comment=<message id>. `review` is the ' +
        'review, or null because none holds it: then a recipient chosen for the comment is handed it as any message is. ' +
        'Asked the way the message worker asks it, so what this says and what the worker does are one answer. A comment ' +
        'you may not read is refused. Writes nothing.',
    ),
    async (req): Promise<{ review: ReviewView | null }> => {
      const { comment } = parse(holdingQuery, req.query, 'The query string is not usable:')
      refuseAMessageThisReaderMayNotRead(theMessageReader(actorFrom(req)), comment, 'refuse')
      return { review: commentsAReviewHasNotSentYet(workspaceOf(req)).get(comment) ?? null }
    },
  )

  /**
   * One review: what is in it, and what each remark is on.
   *
   * Every member carries a READING of its context — whether what it points at is still there and
   * whether the quoted words have moved. Computed on this request and never stored, because a
   * stored answer to "is this still there" is only ever right by accident.
   */
  app.get(
    '/reviews/:id',
    route(
      'review.read',
      'remote',
      'One review: where it was started from, what counts as inside it, and every comment in it. Each comment ' +
        'carries what the person wrote, what it points at, and a READING — "there", "changed" (the thing is ' +
        'there and the quoted words moved or went), "gone", or "unknown" when Mole Office cannot say either way — ' +
        'computed on this request, never stored. `key` on each is the same string an addressable element on ' +
        'screen carries as its `data-target`. WHILE A REVIEW IS COLLECTING the membership is worked out now, so ' +
        'a link written today changes it; ONCE COLLECTING HAS FINISHED it is read from what was written down at ' +
        'that moment, and a member that cannot be read now is reported rather than dropped, with the reason — ' +
        'deleted, filed in another project, no longer a note, or really not in this database. EVERY COMMENT COMES ' +
        'BACK: there is no cap on what a review holds. `gaps` names what Mole Office could not work out about the ' +
        'membership — a note nobody is recorded as writing, a note written in the same second as the press — and ' +
        'every sentence in it is in `says` too. A review whose entry has since been deleted still answers here, ' +
        'with `rule.kind` "gone" saying what is missing. `organised` is WHAT MOLE OFFICE MADE OF THESE COMMENTS, ' +
        'assembled from the sentence stored beside each of them, or null because nothing has read them — there is ' +
        'no placeholder reading, because a mechanical arrangement shown where an interpretation goes would be a ' +
        'claim about somebody\'s words that nothing made. Every member also carries its own `interpretation`, so a ' +
        'row can draw what was said beside what Mole Office made of it. `saved` lists THE COMMENTS SAVED WITHOUT ' +
        'SENDING on what the review reviews, written by the person who started it before it started, that nobody has ' +
        'been handed and that no other finished review holds. They are not members and the membership rule is ' +
        'unchanged; the review lists them and its send carries them. A COMMENT YOU MAY NOT READ IS LEFT OUT: an agent reads only the messages it sent, was sent or got through a group it was in, and a secretary and the owner read every one. Nothing here counts or names a comment left out. Writes nothing.',
    ),
    async (req): Promise<ReviewDetail> => {
      const { id } = parse(reviewIdParams, req.params, 'The URL is not usable:')
      return readReview(id, workspaceOf(req), theMessageReader(actorFrom(req)))
    },
  )

  /**
   * The first boundary. Membership freezes and nothing is sent.
   */
  app.post(
    '/reviews/:id/finish-collecting',
    route(
      'review.collect',
      'remote',
      'Finish collecting: work out what is in this review and WRITE THE MEMBERSHIP DOWN. Takes no body. NOTHING ' +
        'IS SENT — sending is a separate act, and the gap between the two is where a person reads what Mole Office ' +
        'made of their comments and corrects it. After this, a `part_of` link written next week cannot change ' +
        'what this review contained. The comments themselves are not consumed: an annotation belongs to the ' +
        'person who wrote it and stays discoverable by later reviews. EVERY COMMENT IS WRITTEN DOWN, however many ' +
        'there are. ONLY THE PERSON WHO STARTED THE REVIEW MAY FINISH IT, because freezing cannot be undone; ' +
        'anybody else is refused with 403 naming who started it. A review that has already finished collecting ' +
        'is refused with 409 rather than re-frozen. A review whose entry has since been deleted is refused with ' +
        '400 naming what is missing, because writing down an empty membership would say it contained nothing ' +
        'and nothing measured that. Answers the review in full.',
    ),
    async (req): Promise<ReviewDetail> => {
      const actor = actorFrom(req)
      const { id } = parse(reviewIdParams, req.params, 'The URL is not usable:')
      takesNoInput(req, 'POST /api/reviews/:id/finish-collecting', 'it acts on the review the URL names')
      return finishCollecting(id, workspaceOf(req), actor)
    },
  )

  /**
   * THE COMMENTS THIS REVIEW DID NOT TAKE, each with why, as rows and not as a number.
   *
   * It is a route of its own rather than a field on `GET /api/reviews/:id` because it reads every
   * comment in the project and every other review's written-down membership, and the review itself
   * is read on every keystroke that changes one. The reply says what it read and what it took.
   */
  app.get(
    '/reviews/:id/not-in-it',
    route(
      'review.read',
      'remote',
      'THE COMMENTS IN THIS PROJECT THAT ARE NOT IN THIS REVIEW, one row each, with why. The population is: this ' +
        'project, not in this review, not deleted — deliberately not "everything waiting", which admits comments ' +
        'already sent and comments belonging to another collected review, neither of which any reason describes. ' +
        'Newest first, at most 20 rows, and `leftOut` says how many are not on the reply. Each row carries the ' +
        'words that were written, what the comment points at, the same `key` an addressable element on screen ' +
        'carries as its `data-target`, the `clause` of the membership rule that left it out, and the `reason` to ' +
        'draw — one of: earlier, later, elsewhere, other-author, sent, in-another-review, not-known. `not-known` ' +
        'is a real answer and never a placeholder: it means Mole Office has the row and cannot say which of the others ' +
        'describes it. `limits` names what this reading did not look at. A COMMENT YOU MAY NOT READ IS LEFT OUT: an agent reads only the messages it sent, was sent or got through a group it was in, and a secretary and the owner read every one. Nothing here counts or names a comment left out. Writes nothing.',
    ),
    async (req): Promise<CommentsNotInReview> => {
      const { id } = parse(reviewIdParams, req.params, 'The URL is not usable:')
      return commentsNotIn(id, workspaceOf(req), NOT_IN_IT_SHOWN, theMessageReader(actorFrom(req)))
    },
  )

  /**
   * The way out. It ends a review without sending anything and without claiming it was finished.
   */
  app.post(
    '/reviews/:id/abandon',
    route(
      'review.collect',
      'remote',
      'ABANDON THIS REVIEW: stop it collecting, write down what it held, and send nothing. Takes no body. It is ' +
        'the only other way a review stops collecting, and it exists because finishing cannot be undone: a review ' +
        'started by accident otherwise collects for ever and frames every page of the application for ever. THE ' +
        'COMMENTS ARE UNTOUCHED — no record is written, no state is changed on any of them, nothing is deleted — ' +
        'and a review started afterwards collects the ones it reaches, because an abandoned review is not read as ' +
        '"another review" when Mole Office says why a comment is not in one. The review stays readable and stays in ' +
        'the list. ONLY THE PERSON WHO STARTED IT MAY ABANDON IT, because ending it cannot be undone; anybody ' +
        'else is refused with 403 naming who started it. A review that is not collecting is refused with 409. ' +
        'Answers the review in full.',
    ),
    async (req): Promise<ReviewDetail> => {
      const actor = actorFrom(req)
      const { id } = parse(reviewIdParams, req.params, 'The URL is not usable:')
      takesNoInput(req, 'POST /api/reviews/:id/abandon', 'it acts on the review the URL names')
      return abandonReview(id, workspaceOf(req), actor)
    },
  )

  /** WHO THE WHOLE REVIEW GOES TO. The owner's second detail: Change, then one contact. */
  app.post(
    '/reviews/:id/recipient',
    route(
      'record.change',
      'remote',
      'SAY WHO THIS REVIEW GOES TO: {"recipient":{"kind":"agent","agentId":"<agent record id>"}}. SENDS NOTHING. ' +
        'Until somebody says, a review goes to the agent recorded as writing the record it was started on, and with ' +
        'no such agent it goes to nobody: `goesTo` on GET /api/reviews/:id says which, and on what ground. Every ' +
        'comment IN the review then goes to this recipient: one nobody chose for follows the review, and one that ' +
        'carried a choice of its own is given this one, so no earlier choice sends it elsewhere. A comment sent on its ' +
        'own keeps its own recipient: one addressed outright with Send in the comment box is not in the review, and ' +
        'this changes nothing on it. Every write is one transaction. ONLY THE PERSON WHO STARTED THE REVIEW MAY SAY; ' +
        'anybody else is refused with 403. A review that has been sent or abandoned is refused with 409. An id that ' +
        'is not an agent record is refused with 400. Answers the review in full.',
    ),
    async (req): Promise<ReviewDetail> => {
      const actor = actorFrom(req)
      const { id } = parse(reviewIdParams, req.params, 'The URL is not usable:')
      const { recipient } = parse(reviewRecipient, req.body, 'The body is not usable:')
      return chooseWhoTheReviewGoesTo(id, workspaceOf(req), recipient.agentId, actor)
    },
  )

  /** THE DISCARD ANSWER to the question asked on leaving a page whose review holds comments. */
  app.post(
    '/reviews/:id/discard',
    route(
      'record.remove',
      'remote',
      'DELETE THE COMMENTS THIS COLLECTING REVIEW HOLDS: every one it would send. Takes no body. SENDS NOTHING. ' +
        'Each is deleted the ordinary way, in one transaction: it is marked deleted and kept, and ' +
        'POST /api/records/<id>/restore brings one back. The review stays collecting, with nothing in it. ONLY THE ' +
        'PERSON WHO STARTED THE REVIEW MAY DISCARD; anybody else is refused with 403. A review that is not collecting ' +
        'is refused with 409. Answers the review, the ids deleted, and a sentence saying what was done.',
    ),
    async (req): Promise<DiscardOutcome> => {
      const actor = actorFrom(req)
      const { id } = parse(reviewIdParams, req.params, 'The URL is not usable:')
      takesNoInput(req, 'POST /api/reviews/:id/discard', 'it acts on the review the URL names')
      return discardTheComments(id, workspaceOf(req), actor)
    },
  )

  /**
   * The second boundary, half one: what an interpreter is asked about this review's comments.
   *
   * MOLE OFFICE CANNOT RUN ONE ITSELF and this route is where that shows. Nothing under `src/` may start
   * a process, and the runtime that
   * answers on this machine is a command. So Mole Office asks, precisely, and validates what comes back,
   * strictly, which is what it already does for agent work.
   */
  app.get(
    '/reviews/:id/organise',
    route(
      'review.organise-preview',
      'remote',
      'WHAT AN INTERPRETER IS ASKED about the comments in this review. `asked` is the whole request as one piece ' +
        'of text, ready to hand to a runtime unchanged: every comment with its own id, what it was left on, the ' +
        'words the person selected, and the two lists of words a reading may use — what somebody wants to HAPPEN, ' +
        'and what could EXIST afterwards. Both lists are written out from one declaration, so what is asked for ' +
        'cannot drift from what is accepted back. Mole Office does not run this: nothing in the server may start a ' +
        'process, so hand `asked` to a runtime and send what comes back to POST /api/reviews/<id>/organise. A ' +
        'review that is still collecting is refused with 409, because what is in it can still change and a reading ' +
        'of a set that moves is a reading of something else. A COMMENT YOU MAY NOT READ IS LEFT OUT: an agent reads only the messages it sent, was sent or got through a group it was in, and a secretary and the owner read every one. Nothing here counts or names a comment left out. Writes nothing.',
    ),
    async (req): Promise<InterpreterRequest> => {
      const { id } = parse(reviewIdParams, req.params, 'The URL is not usable:')
      return organiseRequest(id, workspaceOf(req), theMessageReader(actorFrom(req)))
    },
  )

  /**
   * The second boundary, half two: the reading comes back, and Mole Office keeps what it can keep.
   *
   * THE BODY IS NOT PARSED BY A SHAPE DECLARED HERE. `checkOrganised` in src/shared/intent.ts is the
   * one statement of what a reading is, and it has to be, because it is the only check that can
   * compare the answer against the comments that were handed over. A zod object beside it would be a
   * second, weaker copy of the same shape, free to accept something the real check refuses.
   */
  app.post(
    '/reviews/:id/organise',
    route(
      'review.organise',
      'remote',
      'A READING OF THIS REVIEW\'S COMMENTS, checked and kept beside the words it is about. Send ' +
        '{comments:[{commentId, reading, intents, artefacts, recipient?}], groups:[{says, commentIds}]} — the ' +
        'shape GET /api/reviews/<id>/organise asks for. IT IS REFUSED unless it names every comment in the review ' +
        'exactly once, names no comment outside it, and uses only the declared words: a reading that cannot be ' +
        'traced back to the words it came from is the thing this refuses to store. A REFUSAL NAMES ONLY THE COMMENTS ' +
        'YOU MAY READ, and neither names nor counts the others, though the reading must still cover them. NOTHING IS FILED BY THIS — no ' +
        'task, no problem, no finding, and never a decision, which only a person may write. What is stored is one ' +
        'sentence per comment, in `annotation.interpretation`, beside the words and never instead of them; the ' +
        'words themselves are untouched. A comment whose words live in a conversation has nowhere to keep a ' +
        'reading, so its reading is returned and not stored, and `kept` says which. The review is marked organised ' +
        'only when at least one sentence was stored. Send it again to correct it; take one reading away with ' +
        'PATCH /api/records/<comment id> {"dataPatch":{"interpretation":null}}, which is the ordinary way to ' +
        'change any field. Sends nothing to anybody.',
    ),
    async (req): Promise<OrganiseOutcome> => {
      const actor = actorFrom(req)
      const { id } = parse(reviewIdParams, req.params, 'The URL is not usable:')
      return keepOrganised(id, workspaceOf(req), req.body, actor)
    },
  )

  /**
   * The third boundary, half one: where every comment would go, worked out and not acted on.
   *
   * A PERSON HAS TO BE ABLE TO SEE WHAT SEND WOULD DO BEFORE THEY PRESS IT. Handing an afternoon's
   * comments to agents is the one act in a review that another party finds out about, and a screen
   * that offered it without saying who each comment is for would be asking somebody to press a
   * button and find out afterwards.
   */
  app.get(
    '/reviews/:id/send',
    route(
      'review.send-preview',
      'remote',
      'WHERE EACH COMMENT IN THIS REVIEW WOULD GO if you sent it, and which ones would go nowhere and why. One ' +
        'line per comment, in the order the review lists them: `willGo` says whether it would be handed to an ' +
        'agent, `yoursToAnswer` says Mole Office will not hand it to anybody because only a person may answer it, and ' +
        '`says` is the sentence under it — the same sentence the send itself obeys, because both run one ' +
        'function. Who a comment is for is read from the words the person wrote on it: one agent named is that ' +
        'agent, several or none is nobody, and a comment nobody said anything about goes nowhere until somebody ' +
        'chooses. A COMMENT YOU MAY NOT READ IS LEFT OUT: an agent reads only the messages it sent, was sent or got through a group it was in, and a secretary and the owner read every one. Nothing here counts or names a comment left out. WRITES NOTHING AT ALL, and creates no conversation and no run.',
    ),
    async (req): Promise<WhereTheyGo> => {
      const { id } = parse(reviewIdParams, req.params, 'The URL is not usable:')
      return whereTheCommentsWouldGo(id, workspaceOf(req), [], theMessageReader(actorFrom(req)))
    },
  )

  /**
   * The third boundary, half two: the review goes to somebody, as one message to each recipient.
   *
   * Nothing in a review creates a run — writing a comment, finishing collecting, organising and this
   * send all write zero runs, and `tests/one-run-door.test.ts` keeps the one insert in one function.
   * This writes the comments into one conversation, has that function work out who each goes to
   * without a run, and gives each recipient one message holding their comments.
   */
  app.post(
    '/reviews/:id/send',
    route(
      'review.send',
      'remote',
      'SEND THIS REVIEW. Every comment that can go becomes a message in ONE conversation carrying who it is for, ' +
        'and that conversation is dispatched, which groups the messages by recipient. EACH RECIPIENT IS GIVEN ONE ' +
        'MESSAGE from the person, in the message pool, holding every comment that went to them, numbered, with ' +
        'each comment\'s quote at the same place in its `quotes`: their waiter hands it over and the person\'s ' +
        'chat with them shows it. `messages` in the reply names each one. NO RUN IS WRITTEN. The review stays one ' +
        'thing; the work partitions. Takes {to?} to choose an agent for ' +
        'particular comments: [{commentId, recipient}], where recipient is {kind:"session",sessionId}, ' +
        '{kind:"new"} or null for nobody. A comment with no choice here is routed from what is stored on it — the ' +
        'agent somebody chose, in `chosenRecipient`, and failing that the words they wrote in `recipientHint`. ' +
        'Takes {only?} to send PARTICULAR comments of the review and leave the rest exactly where they are: a ' +
        'list of comment ids, which is what the press on one comment\'s own row sends. It is still one review and ' +
        'one conversation; the comments not named come back in the reply saying nobody asked for them. ' +
        'WHAT SOMEBODY WROTE IS STORED BEFORE ANYTHING IS SENT: a comment nobody can deliver is still ' +
        'written into the conversation, still queued, still editable and still re-addressable, and the reply ' +
        'names it in `held`. A COMMENT THAT IS THE PERSON\'S OWN TO ANSWER IS NOT HANDED TO ANYBODY — a reading ' +
        'naming a decision is refused by the same gate that refuses an agent a decision anywhere else, and those ' +
        'comments come back in `yoursToAnswer`, still queued and still in the review. Nothing is filed from ' +
        'them. THE COMMENTS SAVED WITHOUT SENDING that the review lists in `saved` go with it the same way; while ' +
        'one this send would carry has nobody chosen to go to, the send is refused with 409 naming each such ' +
        'comment, and nothing is written. A review that is still collecting is refused with 409 naming what to do; one that has been sent ' +
        'can be retried by its starter with ordinary send proof for deliverable frozen, queued comments. Recovery ' +
        'dispatches only messages carrying those comments, refuses a partial shared message or a comment already handed over, ' +
        'and leaves other queued messages alone. Older saved-comment membership was not recorded and cannot be inferred. ' +
        'The review is marked sent only when NOTHING was left waiting, ' +
        'so a Send that held one comment back can be pressed again once that one is answered for. Comments that ' +
        'went are stamped "sent" on their own records and stay exactly as visible as they were.',
    ),
    async (req): Promise<SendOutcome> => {
      const actor = actorFrom(req)
      const { id } = parse(reviewIdParams, req.params, 'The URL is not usable:')
      const body = parse(sendChoices, req.body ?? {}, 'The request body is not usable:')
      // CAST, for the reason the entry above is cast: the recipient shape is checked by zod and the
      // type it infers is a plain object, because `kind` comes from a runtime list. Nothing about
      // the value has been narrowed and nothing here trusts it — `readDelivery` is what says whether
      // it can go anywhere.
      const to = (body.to ?? []) as unknown as ChoiceForOneComment[]
      return sendReview(id, workspaceOf(req), to, actor, body.only ?? null)
    },
  )

  /**
   * The two presses under a comment the review would otherwise wait for: "I answer this myself" and "Remove from this
   * review". It sits under the send's own act, because who may press is who may send this review.
   */
  app.post(
    '/reviews/:id/take-out',
    route(
      'review.send',
      'remote',
      'TAKE ONE COMMENT OUT OF WHAT THIS REVIEW WAITS FOR. Takes {comment, because}: the comment\'s id, and ' +
        '"the-person-answers-it" for a comment only the person may answer, or "it-cannot-be-found" for one the review ' +
        'contained that can no longer be found. Each takes out only its own kind of comment; a comment that went or ' +
        'was taken out already is refused with 409, and nothing is changed. THE COMMENT STAYS: its record and its ' +
        'line in the review are not touched, and the review stores which comment, why, who pressed and when. Who may ' +
        'press is who may send this review, and on a review already sent only its starter. When nothing else in the ' +
        'review waits, it is marked sent, with no conversation written; a review already sent keeps its first time. ' +
        'The reply holds the review, the entry written, `reviewSent`, and what the press did in `says`.',
    ),
    async (req): Promise<TakeOutOutcome> => {
      const actor = actorFrom(req)
      const { id } = parse(reviewIdParams, req.params, 'The URL is not usable:')
      const press = parse(takeOutPress, req.body ?? {}, 'The request body is not usable:')
      return takeOutOfTheReview(id, workspaceOf(req), press, actor)
    },
  )

  /**
   * The states nothing writes yet, refused by name.
   *
   * A ROUTE THAT ONLY EVER REFUSES IS WORTH HAVING HERE. Without it a caller reaching for "mark
   * this sent" gets a 404 and learns nothing; with it they are told that sending is a separate act
   * that is not built, which is the true answer and the one that stops somebody looking for the
   * route they think they have missed.
   */
  app.patch(
    '/reviews/:id',
    route(
      'review.collect',
      'remote',
      'REFUSES, always, and says which act does the work instead. "organised" is refused because a review becomes ' +
        'organised by something reading its comments, not by being told it was read — see ' +
        'POST /api/reviews/<id>/organise. "sent" is refused because a review is sent by sending it — ' +
        'POST /api/reviews/<id>/send — and marking one sent here would say work ' +
        'had been handed to somebody when none had. "collected" is refused because it is what ' +
        'POST /api/reviews/<id>/finish-collecting does, which also writes down what was in it. "collecting" is ' +
        'refused because a frozen membership cannot be unfrozen. Nothing is ever changed by this route.',
    ),
    async (req): Promise<never> => {
      actorFrom(req)
      const { id } = parse(reviewIdParams, req.params, 'The URL is not usable:')
      const body = parse(reviewPatch, req.body, 'The request body is not usable:')
      return setState(id, workspaceOf(req), body.state)
    },
  )
}
