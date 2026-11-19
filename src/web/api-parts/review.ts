// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13y, pages and speed. The browser's doors to the review tool: reviews, agent threads, marks and
// recipients. Wave 13y's round 68 moved them here out of the one `api` object in src/web/api.ts; a line adds its
// new doors to its own part, and src/web/api-parts/join.ts joins every part into `api`.
import { type ChosenRecipient, json, rankingAsk, rankingQuery, request } from '../api.ts'
import type { AgentMessageView, AgentThreadView, DispatchOutcome, MarksReply, MessageContext, MessageIntent, MessageRemoved, RecipientKind, ThreadDetail, ThreadListReply, ThreadMode, ThreadState } from '../../server/lib/agents.ts'
import type { AgentRankingAnswer, RecipientsAnswer, Resolution } from '../../server/lib/recipients.ts'
import type { DiscardOutcome, OrganiseOutcome, ReviewDetail, ReviewListReply, ReviewReach, ReviewScope, ReviewState, ReviewView, SendOutcome, TakenOutBecause, TakeOutOutcome, WhereTheyGo } from '../../server/lib/reviews.ts'
import type { InterpreterRequest } from '../../server/lib/interpret.ts'
import type { Context } from '@shared/targets.ts'

export const reviewDoors = {

  // -------------------------------------------------------------------------- collecting a review

  /**
   * START COLLECTING HERE — or come back to the review already collecting here.
   *
   * ONE ROUTE FOR BOTH, and `started` in the reply says which happened. Coming back is somebody
   * standing in the same place again, so it resumes rather than making a second review out of an
   * afternoon's break. WHAT A REVIEW COLLECTS IS DERIVED FROM WHERE IT WAS STARTED and is never
   * chosen from a menu.
   */
  startCollecting: (entry: Context, opts: { reach?: ReviewReach } = {}) =>
    request<{ review: ReviewView; started: boolean; rule: ReviewScope; says: string }>('/api/reviews', {
      method: 'POST',
      // `reach` IS LEFT OFF WHEN IT IS THE ORDINARY ONE, so the wire says what was asked for rather
      // than restating the default. The route's own default is `local` and there is one statement
      // of that, on the route.
      body: json(opts.reach === undefined || opts.reach === 'local' ? { entry } : { entry, reach: opts.reach }),
    }),

  /**
   * This project's reviews, newest first.
   *
   * `covers` is a `data-target` value and narrows the list to the reviews whose scope includes that
   * thing. THAT IS HOW A SCREEN ASKS "is anything collecting where I am standing"; working it out
   * in the browser would be a second statement of what a scope includes.
   */
  reviews: (opts: { state?: ReviewState; covers?: string } = {}) => {
    const query = new URLSearchParams()
    if (opts.state !== undefined) query.set('state', opts.state)
    if (opts.covers !== undefined) query.set('covers', opts.covers)
    const tail = query.toString()
    return request<ReviewListReply>(`/api/reviews${tail === '' ? '' : `?${tail}`}`)
  },

  /**
   * One review: what counts as inside it, what is in it, and what each remark is on now.
   *
   * NAMED `oneReview` BECAUSE `review` IS TAKEN, by the planning review of a week — a different
   * thing with the same English word. Two calls called `review` on one object is worse than a
   * slightly longer name.
   */
  oneReview: (id: string) => request<ReviewDetail>(`/api/reviews/${encodeURIComponent(id)}`),

  /**
   * WHICH REVIEW HOLDS ONE COMMENT BACK UNTIL IT IS SENT, or null because none does. The message worker's own
   * reading, so a screen saying "goes with the review" and the worker holding it are one answer. Problem 7VI4cV5ppiFQ.
   */
  reviewHolding: (commentId: string) =>
    request<{ review: ReviewView | null }>(`/api/reviews/holding?comment=${encodeURIComponent(commentId)}`),

  /**
   * THE FIRST BOUNDARY. Write the membership down. SENDS NOTHING, makes no run, starts no
   * conversation. It cannot be undone, which is why only the person who started it may press it.
   */
  finishCollecting: (id: string) =>
    request<ReviewDetail>(`/api/reviews/${encodeURIComponent(id)}/finish-collecting`, { method: 'POST' }),

  /**
   * WHAT AN INTERPRETER IS ASKED ABOUT THIS REVIEW'S COMMENTS. Writes nothing, changes nothing.
   *
   * `asked` is the whole request as one piece of text, ready to hand to something that can read
   * words. MOLE OFFICE CANNOT READ THEM ITSELF and this call is where that shows: nothing under `src/`
   * may start a process, so the interpreter is somewhere else and this is the question for it.
   *
   * A review that is still collecting is refused with 409, because what is in it can still change.
   */
  askToOrganise: (id: string) =>
    request<InterpreterRequest>(`/api/reviews/${encodeURIComponent(id)}/organise`),

  /**
   * THE READING THAT CAME BACK. Mole Office checks it and keeps what it can keep.
   *
   * IT IS REFUSED unless it names every comment in the review exactly once, names no comment outside
   * it, and uses only the declared words. A refusal stores nothing and touches nobody's words, and
   * the server's own sentence says so — which is what the surface sending this shows.
   *
   * `stored` in the reply is false when a reading was accepted and there was nowhere to keep any of
   * it, which is the case for a review whose comments live in a conversation. That is not a failure
   * and it is not a success, so the caller draws what the reply says rather than a tick.
   *
   * WHAT IS SENT IS `unknown` ON PURPOSE. `checkOrganised` on the server is the one check of what a
   * reading is, and it is the only one that can compare an answer against the comments that were
   * handed over. Typing this parameter as a checked shape would say the browser had checked it, and
   * a second check here would be the same rule written twice.
   */
  keepOrganised: (id: string, reading: unknown) =>
    request<OrganiseOutcome>(`/api/reviews/${encodeURIComponent(id)}/organise`, {
      method: 'POST',
      body: json(reading),
    }),

  /**
   * WHERE EVERY COMMENT IN THIS REVIEW WOULD GO, worked out and not acted on. Writes nothing.
   *
   * ---------------------------------------------------------------------------------------
   * THIS IS WHAT REPLACED A BUTTON THAT COULD ONLY EVER FAIL
   * ---------------------------------------------------------------------------------------
   *
   * There used to be an `askToSendReview` here. It sent `PATCH /api/reviews/:id {"state":"sent"}`
   * and its own note said IT ALWAYS FAILS, because nothing in Mole Office sent a review — and the pane
   * drew it as the primary press a finished review offered. It was taken out, and now the act it
   * was pretending to do exists.
   *
   * THE PREVIEW IS NOT DECORATION. Sending is the one act in a review that another party finds out
   * about, so the person reads who each comment is going to and which ones are going nowhere
   * BEFORE they press. The line under each comment here is the same sentence the send itself obeys.
   */
  whereTheReviewWouldGo: (id: string) => request<WhereTheyGo>(`/api/reviews/${encodeURIComponent(id)}/send`),

  /**
   * SEND THE REVIEW. The comments become messages in one conversation, and that conversation goes.
   *
   * ONE REVIEW, ONE CONVERSATION, AND ONE RUN PER AGENT the comments in it are for. Nothing about
   * that grouping is done here or on this route: `dispatchThread` on the server has always grouped
   * a conversation's queued messages by recipient, and this is that behaviour used rather than
   * copied.
   *
   * `to` IS WHERE A PERSON CHOSE BY HAND, one entry per comment at most. A comment with no choice
   * is routed from the words the person wrote on it, and a comment with neither is not sent — it
   * stays queued and the reply names it.
   */
  sendReview: (
    id: string,
    to: readonly { commentId: string; recipient: ChosenRecipient | null }[] = [],
    /**
     * SEND ONLY THESE COMMENTS. Left out, every comment that can go goes.
     *
     * THIS IS WHAT THE PRESS ON ONE COMMENT'S ROW SENDS, and it is the whole of the fix to the
     * per-comment send: that press used to make its own conversation through the agent routes, so
     * the review's conversation went on saying the comment had not been sent while the pane's
     * heading counted it as sent. One review, one conversation, whichever press is used.
     */
    only: readonly string[] | null = null,
  ) =>
    request<SendOutcome>(`/api/reviews/${encodeURIComponent(id)}/send`, {
      method: 'POST',
      body: json({ to, ...(only === null ? {} : { only }) }),
    }),

  /**
   * TAKE ONE COMMENT OUT OF WHAT THE REVIEW WAITS FOR: "I answer this myself" for a comment only the person may answer,
   * and "Remove from this review" for one that can no longer be found. The comment stays; the review stops waiting for
   * it, and is marked sent when nothing else waits.
   */
  takeOutOfTheReview: (id: string, comment: string, because: TakenOutBecause) =>
    request<TakeOutOutcome>(`/api/reviews/${encodeURIComponent(id)}/take-out`, {
      method: 'POST',
      body: json({ comment, because }),
    }),

  /**
   * WHO THIS REVIEW GOES TO, chosen by the person who started it. One write; the reply is the review read again.
   * The owner's second detail: a review goes by default to the agent that wrote the page, and Change is one press.
   */
  reviewRecipient: (id: string, recipient: { kind: 'agent'; agentId: string }) =>
    request<ReviewDetail>(`/api/reviews/${encodeURIComponent(id)}/recipient`, {
      method: 'POST',
      body: json({ recipient }),
    }),

  /**
   * DISCARD THE COMMENTS A COLLECTING REVIEW HOLDS, in one write. Each is deleted the ordinary way, which marks it
   * and does not erase it, and the reply's sentence says how to bring one back.
   */
  discardReview: (id: string) =>
    request<DiscardOutcome>(`/api/reviews/${encodeURIComponent(id)}/discard`, { method: 'POST' }),

  // -------------------------------------------------------------------------- talking to an agent
  /**
   * TWELVE CALLS, ALL OF THEM WHOLE.
   *
   * None of these unwraps its reply. `{thread: …}` and `{message: …}` look like one-key envelopes
   * that could be unwrapped for free, and the note at the top of this file says why that is a trap:
   * an envelope that carries one thing today carries two the day somebody adds a field, and the
   * unwrap goes on silently dropping the second one.
   *
   * The three run routes a worker uses — the queue, the claim and the result — are deliberately not
   * here. A worker is not this browser: it takes no project header and serves the machine, and
   * `tools/agent-worker.mjs` calls them directly. Adding them here would be a second client for
   * routes this app has no reason to call.
   */

  /** Start a conversation. `direct` sends each comment as you write it; `review` collects them. */
  newAgentThread: (input: { title: string; mode: 'direct' | 'review' }) =>
    request<{ thread: AgentThreadView }>('/api/agent/threads', { method: 'POST', body: json(input) }),

  /** Every conversation about this project, most recently touched first, with the counts. */
  agentThreads: (opts: { state?: ThreadState; mode?: ThreadMode } = {}) => {
    const q = new URLSearchParams()
    if (opts.state !== undefined) q.set('state', opts.state)
    if (opts.mode !== undefined) q.set('mode', opts.mode)
    const suffix = q.toString()
    return request<ThreadListReply>(`/api/agent/threads${suffix ? `?${suffix}` : ''}`)
  },

  /** One conversation: its comments, what each points at, its runs, and what came back. */
  agentThread: (id: string) => request<ThreadDetail>(`/api/agent/threads/${encodeURIComponent(id)}`),

  /** Rename a conversation, or abandon it. The server refuses "dispatched" and "answered" here. */
  patchAgentThread: (id: string, patch: { title?: string; state?: ThreadState }) =>
    request<{ thread: AgentThreadView }>(`/api/agent/threads/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: json(patch),
    }),

  /**
   * Say something, about something, to somebody. CREATES NO RUN, in either mode.
   *
   * This is what makes a review durable: the comment is on the server the moment it is written, so
   * a reload, a navigation and a crashed tab all keep it.
   */
  addAgentMessage: (
    threadId: string,
    input: {
      intent: MessageIntent
      body: string
      context?: MessageContext | null
      recipient?: { kind: RecipientKind; agentId?: string | null; sessionId?: string | null; said?: string | null; why?: string | null } | null
      /**
       * WHICH COMMENT THESE WORDS CAME FROM, when they came from one.
       *
       * It is what says a comment has gone out. The server checks that the id names a live comment
       * in this project, and refuses a second message carrying a comment that has already gone.
       */
      fromAnnotationId?: string | null
    },
  ) =>
    request<{ message: AgentMessageView }>(`/api/agent/threads/${encodeURIComponent(threadId)}/messages`, {
      method: 'POST',
      body: json(input),
    }),

  /** Change a comment while it is still waiting. A sent one is refused, by design. */
  changeAgentMessage: (
    id: string,
    patch: {
      intent?: MessageIntent
      body?: string
      context?: MessageContext | null
      recipient?: { kind: RecipientKind; agentId?: string | null; sessionId?: string | null; said?: string | null; why?: string | null } | null
      /**
       * WHICH COMMENT THESE WORDS CAME FROM, when they came from one.
       *
       * It is what says a comment has gone out. The server checks that the id names a live comment
       * in this project, and refuses a second message carrying a comment that has already gone.
       */
      fromAnnotationId?: string | null
    },
  ) =>
    request<{ message: AgentMessageView }>(`/api/agent/messages/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: json(patch),
    }),

  /** Take a comment out of a review while it is still waiting. */
  removeAgentMessage: (id: string) =>
    request<MessageRemoved>(`/api/agent/messages/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  /**
   * Send, or Finish review. THE ONLY CALL IN THIS FILE THAT MAKES A RUN EXIST.
   *
   * It takes no body on purpose: what is sent is every comment still waiting, and who each one is
   * for is on the comment. A refusal comes back as an ApiError carrying the server's own sentence,
   * which names every comment that could not be routed — and nothing is sent, so one correction
   * sends the lot.
   */
  dispatchAgentThread: (id: string) =>
    request<DispatchOutcome>(`/api/agent/threads/${encodeURIComponent(id)}/dispatch`, { method: 'POST' }),

  /** Which objects on this project's pages have a comment waiting, in one request for the page. */
  agentMarks: () => request<MarksReply>('/api/agent/marks'),

  /**
   * The agents a message about this could be meant for, ranked, each with the reason.
   *
   * The context is turned into the route's own three-field query here rather than by every caller,
   * and a comment on a span of text asks about the object the span is INSIDE — the ranking is about
   * which agent worked on the thing, and a few words of it is still the thing. Which question this
   * one becomes is `rankingAsk` above, and that is the only place it is worked out.
   */
  agentRecipients: (context: MessageContext | null) => {
    const suffix = rankingQuery(rankingAsk(context))
    return request<RecipientsAnswer>(`/api/agent/recipients${suffix ? `?${suffix}` : ''}`)
  },

  /**
   * THE REGISTERED AGENTS THAT FILED OR WROTE WHAT WAS POINTED AT, in the one ranking, as item 5 of a decision
   * says. Asked the same way as the list above, through `rankingAsk`, so the two can never be
   * asked about different things. WITH A REVIEW, the server also ranks the agent that asked for that review, read off
   * the review itself, with whether it can receive. An ask that names no record and no review is not sent: nothing Mole
   * Office holds says which agent wrote a page, so the answer is an empty ranking.
   */
  agentRanking: async (context: MessageContext | null, review: string | null = null): Promise<AgentRankingAnswer | null> => {
    const ask = rankingAsk(context)
    if (ask === null && review === null) return null
    const q = new URLSearchParams(rankingQuery(ask))
    if (review !== null) q.set('review', review)
    return request<AgentRankingAnswer>(`/api/agent/recipients/agents?${q.toString()}`)
  },

  /**
   * Words to one agent, or a refusal naming every candidate.
   *
   * A refusal comes back 200 with `outcome` saying which kind it is, because "those words name
   * three agents" is a true answer rather than a request that failed. The caller draws all three.
   */
  resolveAgentRecipient: (said: string, context: MessageContext | null) => {
    // THE SAME QUESTION THE RANKED LIST ASKS, through the same function. A cell of a table is asked
    // about as the record it is in; a page and an unsent instruction are asked about as nothing,
    // because nothing Mole Office holds says which agent worked on one.
    const ask = rankingAsk(context)
    const body =
      ask === null
        ? { said }
        : ask.kind === 'record'
          ? { said, context: { kind: 'record' as const, id: ask.recordId } }
          : ask.kind === 'planLine'
            ? { said, context: { kind: 'planLine' as const, planId: ask.planId, lineId: ask.lineId } }
            : { said, context: { kind: 'scheduleBlock' as const, windowId: ask.windowId } }
    return request<Resolution>('/api/agent/recipients/resolve', { method: 'POST', body: json(body) })
  },
}
