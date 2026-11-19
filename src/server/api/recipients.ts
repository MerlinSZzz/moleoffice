// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO A MESSAGE COULD GO TO: two read-only routes over evidence Mole Office already holds.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THESE TWO ROUTES ARE
 * ---------------------------------------------------------------------------------------
 *
 *   GET  /api/agent/recipients          the agents a message about this could mean, ranked, each
 *                                       carrying the sentence saying why, and whether it can be
 *                                       picked up where it left off
 *   POST /api/agent/recipients/resolve  words to one agent, or a refusal naming every candidate
 *
 * NEITHER WRITES ANYTHING. No row is created, no message is addressed and no run is queued. They
 * answer a question; the choice is made by a person pressing something, and the addressing happens
 * on the message route. That separation is on purpose: Mole Office never guesses a recipient
 * silently, and it shows what it made of the words, which a person can then override easily.
 *
 * The reading is `src/server/lib/recipients.ts`. This file is the door: it works out who is asking,
 * checks the input, and calls one function. It adds nothing to the answer and takes nothing away.
 *
 * ---------------------------------------------------------------------------------------
 * WHY POST FOR THE SECOND ONE WHEN IT WRITES NOTHING
 * ---------------------------------------------------------------------------------------
 *
 * The phrase a person types is the input, and it belongs in a body: it is free text of any length,
 * it may hold any character, and a query string is the wrong place for both. `design/ROUND-SEVEN.md`
 * names the method in its route table, so this follows the table rather than re-deciding it.
 *
 * ---------------------------------------------------------------------------------------
 * A REFUSAL COMES BACK 200, AND THAT IS NOT A FAKE SUCCESS
 * ---------------------------------------------------------------------------------------
 *
 * "Those words name three agents" is a true and complete answer to "which agent do these words
 * mean". It is not an operation that failed; nothing was asked to be done. The caller needs the
 * list of three to choose from, and an error would carry one sentence instead of the list. So the
 * body says `outcome` — `one`, `many` or `none` — and `recipient` is null on both refusals, so a
 * caller that reads the answer rather than the outcome gets nothing rather than a guess.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH PROJECT THE ANSWER IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * The project comes off the RECORD that was pointed at, never off the request. A plan is
 * person-level and its lines bind to work in any project, so `x-mole-office-workspace` and the record
 * can honestly disagree. When they do, `context.askedForProject` says which project the request
 * named and the note says which one was read. The header is what decides only when nothing was
 * pointed at, since there is then no record to ask.
 */

import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { parse } from '../lib/parse.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { readReview } from '../lib/reviews.ts'
import {
  agentRankingFor,
  recipientsFor,
  resolveRecipient,
  type AgentRankingAnswer,
  type RecipientContext,
  type RecipientsAnswer,
  type Resolution,
} from '../lib/recipients.ts'

// ---------------------------------------------------------------------------- input shapes

/**
 * What was pointed at, on a query string: a record, a plan and a line, or a block on the week.
 *
 * Three separate optional fields rather than one packed string, because a caller building this URL
 * has the ids in its hand and a packed form would need a grammar, a parser and an error message
 * about the grammar. `strictObject`, so a misspelt field is refused rather than read as "nothing
 * was pointed at" — which would answer a different question and look entirely normal.
 */
const contextQuery = z.strictObject({
  record: z.string().trim().min(1, { error: 'record must be a record id' }).optional(),
  plan: z.string().trim().min(1, { error: 'plan must be a plan id' }).optional(),
  line: z.string().trim().min(1, { error: 'line must be the id of a line of that plan' }).optional(),
  window: z.string().trim().min(1, { error: 'window must be the id of a block on the week' }).optional(),
})

/**
 * The agent ranking's query: what was pointed at, and optionally the review the choice is for. A review is asked
 * about by its id and never by its starter, so the starter ranked is the one the review stores, not one a caller
 * names. Only this route takes it: the run list's route keeps `contextQuery`, which refuses the key.
 */
const agentRankingQuery = contextQuery.extend({
  review: z.string().trim().min(1, { error: 'review must be a review id' }).optional(),
})

/** The same three shapes in a body, for the route that takes a phrase. */
const contextBody = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('record'), id: z.string().trim().min(1) }),
  z.strictObject({
    kind: z.literal('planLine'),
    planId: z.string().trim().min(1),
    lineId: z.string().trim().min(1),
  }),
  z.strictObject({ kind: z.literal('scheduleBlock'), windowId: z.string().trim().min(1) }),
])

const resolveBody = z.strictObject({
  /**
   * The words, kept exactly as typed.
   *
   * Trimmed at the ends only. Nothing inside is normalised, because what was said is stored and
   * shown back — the eighth rule — and the reply carries it under `read.said`.
   */
  said: z
    .string({ error: 'said must be the words naming the agent you mean' })
    .trim()
    .min(1, { error: 'said must not be empty. Write who you mean, for example: the agent working on calibration' }),
  context: contextBody.optional(),
})

/**
 * The three ways of pointing at something, as one value, or null for "nothing was pointed at".
 *
 * Exactly one of the three has to be named. Two at once is refused rather than one being preferred:
 * a rule that quietly picked the record over the window would answer about something the caller did
 * not ask about, and nothing on the reply would look wrong.
 */
function contextFrom(q: z.output<typeof contextQuery>): RecipientContext | null {
  const named = [
    q.record === undefined ? null : 'record',
    q.plan === undefined && q.line === undefined ? null : 'plan and line',
    q.window === undefined ? null : 'window',
  ].filter((name): name is string => name !== null)

  if (named.length > 1) {
    throw new PanelError(
      `Point at one thing, not ${named.length}: this request named ${named.join(' and ')}. Ask again for each ` +
        'one separately.',
    )
  }
  if (q.record !== undefined) return { kind: 'record', id: q.record }
  if (q.window !== undefined) return { kind: 'scheduleBlock', windowId: q.window }
  if (q.plan !== undefined && q.line !== undefined) return { kind: 'planLine', planId: q.plan, lineId: q.line }
  if (q.plan !== undefined || q.line !== undefined) {
    throw new PanelError(
      'A line of a plan is named by both `plan` and `line`. One without the other names nothing, so nothing was ' +
        'read: GET /api/plans/<plan> lists its lines with their ids.',
    )
  }
  return null
}

// ---------------------------------------------------------------------------- what each route says

export const RECIPIENTS_NOTE =
  'The agents a message about this could be meant for, ranked, with the reason for each: GET /api/agent/recipients. ' +
  'Point at ONE thing with `?record=<id>`, or `?plan=<id>&line=<id>`, or `?window=<id>`; naming two is refused, and ' +
  'naming none is allowed and answers with every agent in the project, ranked by nothing. Five things count, ' +
  'strongest first: the change log says this run created the record; the run said which work it was on and this is ' +
  'part of that work; the change log says this run wrote to the record; Mole Office filed the run under the same ' +
  'pipeline or module from what it wrote; and it wrote to a record this one is linked to, which is the weakest and ' +
  'says so. Runs with none of those come back under `recent`, a SEPARATE list, so recency is never read as ' +
  'relevance. TWO RUNS THE EVIDENCE CANNOT TELL APART ARE TIED AND THE ANSWER SAYS SO: each of them names the ' +
  'others in `tiedWith`, the order between them is their ids in alphabetical order and means nothing, and the ' +
  '`recent` list is lengthened rather than cut through the middle of a tie. A candidate that is fixture content, ' +
  'that carries no mark saying how it entered the corpus, or that has been deleted is listed, marked on the ' +
  'candidate, AND counted in `read.origins` — there is no agent behind a fixture row to answer. THERE IS NO PROSE ' +
  'ON THIS REPLY OUTSIDE `read`: what was pointed at is `context.record` and `context.nothingFiled.code`, how many ' +
  'can be picked up is `read.pickUp`, what kind of rows these are is `read.origins`, and the three rules that say ' +
  'how the answer was arrived at are `read.rule`, `read.pickUpRule` and `read.whenItCannotBePickedUp`. ' +
  'EVERY CANDIDATE CARRIES `pickUp`, which says whether that run can be picked up where it ' +
  'left off — `yes` with the runtime name and that runtime’s own id for the conversation, `no` with the reason, or ' +
  '`unknown` when the transcript could not be read, which is not the same as it being gone. A run that cannot be ' +
  'picked up is still listed and must never be silently replaced by a new agent. The project comes off the record ' +
  'pointed at, not off `x-mole-office-workspace`; the header decides only when nothing was pointed at. It writes nothing.'

export const AGENT_RANKING_NOTE =
  'The registered agents that filed or wrote the record pointed at, ranked: GET /api/agent/recipients/agents. ' +
  'Point at ONE thing the way GET /api/agent/recipients does. An agent that filed the record comes before an agent ' +
  'that only wrote to it; within one of those, more change rows come first, then the newer. Each agent carries ' +
  '`cannotReceive`, which is the message door’s own refusal sentence, or null when a message to it would be taken, ' +
  'and `cannotReceiveSaid`, the facts that sentence was built from, or null with it. ' +
  '`stampsNotNamed` counts change rows whose writer names no registered agent, or names two; those are left off. ' +
  'WITH review=<id>, the agent that asked for that review (its startedByAgent) is ranked too, first, on the rung ' +
  '"started-this-review", with its own `cannotReceive`; `startedBy` says which agent record the review names and ' +
  'which registered agent that is, either null when there is none. A review of another project, or none, is ' +
  'refused with 404. A review may be asked about with nothing pointed at, and then its starter is ranked alone. ' +
  'It writes nothing and chooses nobody.'

export const RESOLVE_NOTE =
  'Words to one agent, or a refusal naming every candidate: POST /api/agent/recipients/resolve with ' +
  '{"said":"the agent working on clamp calibration"} and, optionally, "context" — {"kind":"record","id":…}, ' +
  '{"kind":"planLine","planId":…,"lineId":…} or {"kind":"scheduleBlock","windowId":…}. NO LANGUAGE MODEL IS ' +
  'CALLED. The words are matched, exactly and case-folded, against what Mole Office durably holds about each run: its ' +
  'title, what it says it is doing, why it was started, the title of the work it is filed under, and the titles of ' +
  'the records it wrote. Words that name any agent, words for the act of asking, and ordinary grammar are stripped ' +
  'first, and the reply lists every stripped word with the reason. EVERY remaining word must be found for a run to ' +
  'match. A word matches by being CONTAINED in the stored text, and `matched[].whole` says whether it stood on its ' +
  'own there or was only found inside a longer word — "lamp" is inside "clamp", and the two are different ' +
  'findings. There are exactly three outcomes and the reply names which: `one`, and it says which words matched ' +
  'what, and whether that run is fixture content, has been deleted, or cannot be picked up where it left off; ' +
  '`many`, which is a REFUSAL naming every candidate; `none`, which is a refusal saying nothing matched and ' +
  'offering to start a new agent. A refusal comes back 200 with `recipient` null, because "these words name three ' +
  'agents" is a true answer to the question rather than an operation that failed. It writes nothing and addresses ' +
  'nothing: choosing is a person’s press, on the message route.'

// ---------------------------------------------------------------------------- routes

export const recipientRoutes: FastifyPluginAsync = async (app) => {
  /**
   * The agents a message about this could be meant for.
   *
   * Read-only, and it is read fresh every time. Nothing is cached: a run that has just written to
   * the record being commented on is the strongest candidate there is, and a cached answer would
   * not know about it. What the read cost is on the reply, at `read.tookMs`.
   */
  app.get('/agent/recipients', route('agent.recipients', 'remote', RECIPIENTS_NOTE),
    async (req): Promise<RecipientsAnswer> => {
    const q = parse(contextQuery, req.query ?? {}, 'The query string is not usable:')
    return recipientsFor(contextFrom(q), workspaceOf(req))
  })

  /**
   * The registered agents that filed or wrote what was pointed at, in the one ranking, by item 5 of
   * a decision; problem Nu0y2IKdzPcw.
   *
   * A ROUTE OF ITS OWN, not a field on the answer above, because the right-click composer asks it
   * every time it opens and the answer above reads every run in the project to rank them. This one
   * reads the record's own change rows and nothing more.
   */
  app.get('/agent/recipients/agents', route('agent.recipients', 'remote', AGENT_RANKING_NOTE),
    async (req): Promise<AgentRankingAnswer> => {
    const q = parse(agentRankingQuery, req.query ?? {}, 'The query string is not usable:')
    const workspaceId = workspaceOf(req)
    // THE STARTER IS READ OFF THE REVIEW, in the project the request names, so a review elsewhere is refused there.
    const review = q.review === undefined ? null : readReview(q.review, workspaceId).review
    const starter = review === null ? null : { review: review.id, agentRecord: review.startedByAgent, started: review.started }
    return agentRankingFor(contextFrom(q), workspaceId, starter)
  })

  /**
   * Say who you mean, in words.
   *
   * The refusals are the point of this route. Ambiguity comes back as a refusal naming every
   * candidate, and no match comes back as a refusal offering to start a new agent, because the
   * alternative to both is Mole Office picking one — which it must never do.
   */
  app.post(
    '/agent/recipients/resolve',
    route('agent.recipients', 'remote', RESOLVE_NOTE),
    async (req): Promise<Resolution> => {
      const body = parse(resolveBody, req.body, 'The request body is not usable:')
      return resolveRecipient(body.said, body.context ?? null, workspaceOf(req))
    },
  )
}
