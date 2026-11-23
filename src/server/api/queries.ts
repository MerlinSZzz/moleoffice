// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The change log, the two questions that justify typed links, what needs a person today, and
 * where the reader got to.
 *
 *   unconsumed -- results with no recorded downstream consumption: the claims, modules and ideas
 *                 that no `consumes` link points at. A finding nothing consumes may never have
 *                 reached the work it should have changed.
 *   unmet      -- work waiting on something that does not exist, or that has been deleted.
 *
 * ---------------------------------------------------------------------------------------
 * WHY `unconsumed` IS NOT CALLED "RESULTS NOTHING IS USING"
 * ---------------------------------------------------------------------------------------
 *
 * That is what it said, and it is a broader claim in English than the query supports. The query
 * counts ONE link type. A claim somebody `measures` is being used — measuring a result is arguably
 * the strongest form of using one — and it is on this list, so the list called "results nothing is
 * using" was naming records that something was demonstrably using.
 *
 * `measures` WAS NOT FOLDED INTO `consumes`, AND THE DISTINCTION IS THE POINT. `consumes` says
 * downstream work DEPENDS on this result: if the result is retracted, that work is wrong. `measures`
 * says one thing EVALUATED another: the measurement is how you found out, not something built on
 * top. They answer different questions and the two queries that justify the whole typed-link system
 * rest on the first — `unmet` asks what breaks when a result goes away, and a measurement does not
 * break. Making `measures` count as consumption would have changed what BOTH lists mean without
 * either of them saying so.
 *
 * So the rule stayed and the SENTENCE moved to what the rule computes. That is the whole of
 * decision 7: the words a reader is given have to describe the query that ran, and "no recorded
 * downstream consumption" is checkable against the links while "nobody is using it" is not.
 *
 * A CLAIM ON THIS LIST IS NOT A COMPLAINT. It says no work has been recorded as depending on the
 * result yet, which is a fact about the link graph and is often the honest state of a new finding.
 *   attention  -- the shared rule in src/shared/attention.ts, run over this workspace and served
 *                 as its answer, reasons and all.
 *   anchor     -- when this reader last looked, and what has been written since.
 *
 * There is no separate "daily page" endpoint: a day is
 * `GET /api/changes?since=<date>&until=<date> 23:59:59`, because the change log already holds
 * every write with its timestamp and its author. A week is the same pair seven days apart.
 *
 * Every route below is the same three steps: work out who is asking, check the input, call one
 * function in lib/records.ts. The rules themselves are in src/shared and the reading of the
 * database is in lib/, so nothing in this file decides anything.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Change, PanelRecord } from '@shared/types.ts'
import { ATTENTION_PARTS, type AttentionPartPage } from '@shared/attention-first-page.ts'
import { RUNGS, type Rung } from '@shared/detail.ts'
import { openLoopsFor, whoseMoveIn, type OpenLoops, type WhoseMoveReading } from '../lib/openloops.ts'
import {
  attentionOnItsOwnThread,
  endTheAttentionThread,
  homeAttentionOfEachProjectOnItsOwnThread,
  logTheAttentionThreadTo,
  readEverythingAgainAtTheNextAsk,
} from '../lib/attention-thread.ts'
import { attentionInTheShape, type AttentionFlowReply, type AttentionFullReply, type AttentionHomeReply, type AttentionNarrowReply, type AttentionOfOtherProjects } from '../lib/attention-shapes.ts'
import {
  countChangesMatching,
  listChanges,
  moveAnchor,
  readerOf,
  readingSinceAnchor,
  sessionFilterValues,
  theHiddenMessagesTheRowsName,
  unconsumed,
  unconsumedOver,
  unmetDependencies,
  decisionsWithoutSummary,
  decisionsOver,
  ANCHOR_ROWS,
  type AnchorMove,
  type AnchorReading,
  type AttentionReading,
  type DecisionWithoutSummary,
  type SessionInRows,
  type SessionMatch,
} from '../lib/records.ts'
import { resolveSessionRef } from '../lib/resolve-session-ref.ts'
import { sessionsIn } from '../lib/sessions-in.ts'
import { PanelError } from '../lib/panel-error.ts'
// The machine sweep. Imported HERE and not in lib/records.ts because lib/resources.ts imports
// lib/records.ts for `logChange`, and importing it back would be a cycle. The handler hands the
// sweep's result to the rule; neither file works anything out.
import { unclaimedSweep } from '../lib/resources.ts'
import { actorFrom, toChanges } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { listWorkspaces } from '../db/list-workspaces.ts'
import { route } from '../lib/route.ts'
import { everyMessageHiddenFrom, theMessageReader } from '../lib/messages.ts'
// WHAT A RECORD SPENT, criterion T2. The reader is its own file because it is a lens over the
// change log rather than a second change-log reader: it calls `sessionsIn` and `listChanges` like
// every other caller, and the one token summation, then says what it counted.
import { spentOnRecord } from '../lib/spent-on-this.ts'
import type { SpentOnThis } from '@shared/spent.ts'
// HAS ANYBODY USED THE HOLE IN RULE 3. Criterion P40; the reading and what it cannot see are on
// the function itself.
import { theRuleThreeSignature } from '../lib/rulethree.ts'

/**
 * Timestamps are stored the way SQLite writes them: "2026-08-07 14:30:00", space separated,
 * no timezone. Comparisons are string comparisons, so an ISO value with a "T" in it would
 * quietly select the wrong rows. Rather than reject that form, it is converted, and anything
 * that is not a date at all is refused with an example of what to send.
 *
 * Built per parameter so the refusal names the parameter the caller actually sent. One shared
 * schema saying "since must look like…" to somebody who sent `until` is the small kind of wrong
 * message that costs a round trip.
 */
function timestamp(param: 'since' | 'until') {
  return z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?/, {
      error: `${param} must look like 2026-08-07 or 2026-08-07 14:30:00`,
    })
    .transform((s) =>
      s
        .replace('T', ' ')
        .replace(/\.\d+/, '') // drop fractional seconds
        .replace(/Z$/, '') // drop the UTC marker; stored times have no zone
        .trim(),
    )
}

/**
 * Both spellings of the session filter are accepted, and they mean exactly the same thing.
 *
 * An audit asked for `?session=` and for `?sessionId=` and was refused twice with a 400, which is
 * the same defect as the wrong column one level up: the log knew which session did the work and
 * there was no way to ask it. Neither spelling is "wrong" -- `session` is what a person types,
 * `sessionId` is what a caller holding an id types -- so refusing one to enforce a house style
 * would be pedantry standing where an answer should be. Both take EITHER form of reference, an
 * id or a run name, because a caller that has to know which one it holds has been given a puzzle
 * rather than an endpoint. What was matched, and how, comes back in the reply.
 */
const sessionRef = z.string().trim().min(1, {
  error: 'session must not be empty — it is a session record id or the run name it was written under',
})

/**
 * `since` and `until` are the two ends of the window, and both are INCLUSIVE.
 *
 * `until` is published because without an upper end there is no such thing as a day or a week
 * here. There are no stored daily pages — a day IS this filter — and `?since=2026-08-07` alone
 * answers with everything from that moment until now, which on a Sunday is four days. The SQL for
 * the upper end has been in `listChanges` since it was written and nothing passed it, so the
 * endpoint published a filter it called "a day" that was not one.
 *
 * NOTHING IS ADJUSTED TO MAKE A DATE MEAN A DAY. `?until=2026-08-07` is midnight, which is the
 * START of that day, so a whole day is `?until=2026-08-07 23:59:59`. Quietly turning the first
 * into the second would be this endpoint deciding what a caller meant, and the day it got that
 * wrong would be a day of work that silently did not appear.
 */
const changesQuery = z.strictObject({
  recordId: z.string().min(1, { error: 'recordId must not be empty' }).optional(),
  session: sessionRef.optional(),
  sessionId: sessionRef.optional(),
  since: timestamp('since').optional(),
  until: timestamp('until').optional(),
  /**
   * THE FIELD AND THE VALUE IT BECAME, sent together. `field` is the stored change field (`data.state`) and
   * `value` is the stored new value (`finished`), both matched exactly. One without the other is refused by the
   * route below: a field with no value would match every value that field ever took, and a value with no field
   * would match every field, which is a different question from the one asked.
   */
  field: z.string().optional(),
  value: z.string().optional(),
  // Query strings are always text, so "50" has to be coerced to a number before checking it.
  limit: z.coerce
    .number({ error: 'limit must be a whole number' })
    .int({ error: 'limit must be a whole number' })
    .min(1, { error: 'limit must be at least 1' })
    .max(1000, { error: 'limit must be 1000 or less' })
    .optional(),
})

/** How a session filter was understood, so a page never has to guess what it is looking at. */
export interface ChangeSessionFilter {
  /** Exactly what was asked for. */
  asked: string
  /** Which spelling carried it. */
  param: 'session' | 'sessionId'
  matchedBy: SessionMatch
  recordId: string | null
  title: string | null
  /** Every run name this session answers to. */
  names: string[]
  /** The stored values the filter matched on: the record id plus every name bound to it. */
  matchedValues: string[]
  /**
   * Rows matching this filter that still store a run name rather than the record id — ALL of
   * them, counted separately, not the ones that fit in this page.
   *
   * It used to be counted over the returned rows, which made it the answer to a question nobody
   * asked: 60 rows needed repointing, the newest 10 came back, and the count said 0 — so the
   * sentence in `note` recommending POST /api/sessions/discover was dropped as well. This is what
   * "discover would move N rows" is read off, so it is a total or it is worthless.
   */
  storedByName: number
  note: string
}

export interface ChangesReply {
  changes: Change[]
  /** Present only when a session filter was asked for. */
  session?: ChangeSessionFilter
  /**
   * The sessions the returned rows name, resolved to their records.
   *
   * This is how a record answers "which session did this": ask for `?recordId=…` and read this.
   * Rows written by a person typing carry no session and are simply absent from it.
   */
  sessions: SessionInRows[]
  /**
   * How many rows match the filter in total, which is not how many came back.
   *
   * `changes` holds the newest `limit` rows and 200 when no limit was sent. Nothing said so until
   * this pass: "what happened on the 10th" is this endpoint's only spelling, and on a day with 499
   * writes it answered with 200 of them and nothing to say the other 299 existed. A caller
   * counting a day's work got a wrong number that looked right.
   */
  matched: number
  /**
   * True when the cap cut the list short: `changes` is a page, `matched` is the whole of it.
   *
   * The same pair `AnchorReading`, `attentionNow`, `placementEvidence` and `sessionWork` already
   * publish, in the same words, for the same reason.
   */
  truncated: boolean
  /**
   * WHAT THE RUNS THIS RECORD'S CHANGE LOG NAMES SPENT ON IT — criterion T2.
   *
   * PRESENT ONLY WHEN A RECORD WAS ASKED FOR (`?recordId=…`). Without one there is no record to sum
   * for, and on every project-wide read the key is absent rather than an empty reading.
   *
   * It is read from the record's WHOLE change log, not from the page `changes` holds, so a capped
   * list cannot publish a window as a total. See lib/spent-on-this.ts.
   */
  spent?: SpentOnThis
}

// ---------------------------------------------------------------------------- attention

/**
 * Whether to sweep the machine for this answer.
 *
 * TWO WORDS AND NO DEFAULT-BY-SILENCE. The attention rule counts what is alive on this machine
 * that no session claims — it never ranks it, because the number is set by the operating system
 * rather than by the work — and finding that out means reading /proc and asking the GPU and the
 * container runtime. That is too much to do on every page load, so it is asked for. What must not
 * happen is an empty `machine` list that reads as "nothing is running unclaimed" when nobody
 * looked, so the reply always says which of the two it is.
 */
/** Why a `from` is not decimal digits, or null when it is. Each refusal names what is wrong with it. */
function whyFromIsNotDigits(text: string): string | null {
  if (text === '') return 'from is empty'
  if (/\s/.test(text)) return 'from has a space in it'
  if (/^[+-]/.test(text)) return 'from has a sign'
  if (/^0[xob]/i.test(text)) return `from ${JSON.stringify(text)} is not written in decimal`
  if (/^\d*[.e]/i.test(text)) return `from ${JSON.stringify(text)} is not a whole number written in digits`
  if (!/^\d+$/.test(text)) return `from ${JSON.stringify(text)} has a character that is not a digit`
  if (!Number.isSafeInteger(Number(text))) return `from ${text} is too large to count exactly`
  return null
}

export const attentionQuery = z.strictObject({
  machine: z
    .enum(['include', 'omit'], {
      error: 'machine must be "include" to sweep this machine for unclaimed processes, or "omit" not to',
    })
    .optional(),
  /**
   * HOW MUCH OF THE ANSWER COMES BACK.
   *
   * NO SHAPE IS THE NARROW ANSWER, and `narrow` asks the same. It keeps the
   * rows the rule selected (`visible` and `remainder`) cut to the keys a list draws, with `total`,
   * `counts`, `remainderByGroup`, `remainderNote`, `at` and `read`, and no reason, factor, score or
   * progress. `full` answers the reading with paged lists and their continuations.
   *
   * `machine=include` WITH NO SHAPE ASKS THE PAGED FULL ANSWER, because the machine list is part of it
   * and the narrow answer carries no sweep at all. `machine=omit` with no shape is narrow.
   *
   * `home` IS HOME'S FIRST PAGE in both modes since round 19 of wave 13w: the three question lists
   * and the reports already read come as counts, and `part` answers one page of one of them, the
   * page a reader asks for by opening its fold. See `attentionFirstPage` in
   * src/shared/attention-first-page.ts. Measured on the made-up office of the owner's size in
   * tests/an-office-with-answers-of-the-live-size.ts: the whole answer is 11.87 MB and this page 3,608 bytes.
   *
   * `other-projects` IS THAT FIRST PAGE FOR EVERY OTHER PROJECT ON THE LIST, in one request and one ask
   * of the attention thread. Home and the Projects page asked it once per project, and on an office of
   * nine projects those reads waited for each other on the one thread and in the browser's six
   * connections (round 23 of wave 13w).
   */
  shape: z
    .enum(['home', 'flow', 'part', 'other-projects', 'narrow', 'full'], {
      error:
        'shape must be "home" for the first page Home draws, "flow" for the fields the pipeline graph draws, "part" for one page of one list behind a fold on Home, "other-projects" for the first page of every other project, "full" for the reading with paged lists, "narrow" for the selected rows cut to the keys a list draws, or left out for the narrow answer (the paged full one with machine=include)',
    })
    .optional(),
  /** Which list `shape=part` answers a page of. */
  part: z
    .enum(ATTENTION_PARTS, { error: `part must be one of ${ATTENTION_PARTS.map((one) => `"${one}"`).join(', ')}` })
    .optional(),
  /**
   * Where that page starts in the list, counting from 0. ONLY DECIMAL DIGITS, read as written: a
   * coerced number read an empty value or a space as 0 and 0x10 as 16, which is a page nobody asked for.
   */
  from: z
    .string({ error: 'from is written once, in decimal digits' })
    .transform((text, ctx) => {
      const why = whyFromIsNotDigits(text)
      if (why !== null) {
        ctx.addIssue({ code: 'custom', message: `${why}; from is where the page starts, written in decimal digits only, 0 or more` })
        return z.NEVER
      }
      return Number(text)
    })
    .optional(),
}).superRefine((q, ctx) => {
  // A PAGE OF ONE LIST NAMES THE LIST, AND NOTHING ELSE TAKES A LIST. Answering the whole reading to a
  // call that named a list, or a page of nothing to one that did not, would be answering a question
  // nobody asked.
  if (q.shape === 'part' && q.part === undefined) {
    ctx.addIssue({ code: 'custom', path: ['part'], message: `shape=part answers one page of one list, so it needs part=, one of ${ATTENTION_PARTS.join(', ')}` })
  }
  if (q.shape !== 'part' && (q.part !== undefined || q.from !== undefined)) {
    ctx.addIssue({ code: 'custom', path: ['shape'], message: 'part= and from= ask for one page of one list, which only shape=part answers' })
  }
  // THE SWEEP IS OF THIS MACHINE FOR ONE PROJECT, and the first page has no machine list to put it in.
  if (q.shape === 'other-projects' && q.machine === 'include') {
    ctx.addIssue({ code: 'custom', path: ['machine'], message: 'shape=other-projects answers no machine list, so machine=include has nothing to sweep for' })
  }
})

/** Was the machine looked at, and where did it look? Never a silent empty list. */
export interface MachineSweepReport {
  swept: boolean
  /** Where the sweep looked, in plain English. Empty when it did not run. */
  searched: string[]
  /** Places it could not look at all, in the probe's own words. */
  unchecked: string[]
  note: string
}

export type AttentionReply = AttentionReading & { machineSweep: MachineSweepReport }

/** The sentence that stops an unswept machine reading as a clean one. */
function describeSweep(sweep: ReturnType<typeof unclaimedSweep> | null): MachineSweepReport {
  if (sweep === null) {
    return {
      swept: false,
      searched: [],
      unchecked: [],
      note:
        'This machine was NOT swept, so `machine` is empty because nobody looked and not because nothing is ' +
        'running. Ask with ?machine=include to sweep it here, or GET /api/resources/orphans for what is ' +
        'still alive whose owning session has ended.',
    }
  }
  return {
    swept: true,
    searched: sweep.searched,
    unchecked: sweep.unchecked,
    note: sweep.summary,
  }
}

/**
 * THE REPLY GET /api/attention SENDS, in the shape asked for, from one reading. The route itself asks
 * the attention thread for `home`, `flow`, `narrow` and `part` in their shape (src/server/lib/attention-shapes.ts),
 * and uses this for the whole answer, which is the only one that carries the sweep.
 *
 * THE HOME AND NARROW SHAPES CARRY NO MACHINE SWEEP. The home page's machine reading is
 * `GET /api/resources/orphans`, and nothing that reads a narrow row reads `machineSweep`. Home asks
 * `shape=home` in both modes; `shape=full`, and `machine=include` with no shape, are what ask for the
 * whole answer, and only the whole answer carries the sweep. Exported so a test can shape a reading
 * exactly as the route does.
 */
export function theAttentionReplyIn(
  shape: 'home' | 'flow' | 'narrow' | undefined,
  reading: AttentionReading,
  sweep: ReturnType<typeof unclaimedSweep> | null,
): AttentionHomeReply | AttentionFlowReply | AttentionNarrowReply | AttentionReply {
  if (shape === 'home' || shape === 'flow' || shape === 'narrow') return attentionInTheShape({ shape }, reading)
  return { ...reading, machineSweep: describeSweep(sweep) }
}

// ---------------------------------------------------------------------------- the reader anchor

const anchorQuery = z.strictObject({
  limit: z.coerce
    .number({ error: 'limit must be a whole number' })
    .int({ error: 'limit must be a whole number' })
    .min(1, { error: 'limit must be at least 1' })
    .max(1000, { error: 'limit must be 1000 or less' })
    .optional(),
})

/**
 * The body of a move. Everything in it is optional, and an absent body means "I have read to now".
 *
 * There is no `lastSeenAt` here and there must not be: the moment is the server's, written through
 * the one stamp helper. A caller that could send its own could set an anchor an hour late and hide
 * an hour of agent work without anything saying so.
 */
const anchorBody = z.strictObject({
  lastChangeId: z
    .string()
    .trim()
    .min(1, {
      error: 'lastChangeId must not be empty — leave it out and the newest row in the change log is used',
    })
    .optional(),
})

/**
 * How a caller asks what is still open.
 *
 * `about` is where to stand — any live record in this project. Leaving it out asks about the whole
 * project, which is what the session hook does. `reach` is how many links away a loop may be, and
 * it only means anything with an anchor. `rung` is how much each loop says: it changes the LENGTH
 * of the answer and never which loops are in it.
 */
const openLoopsQuery = z.strictObject({
  about: z.string().trim().min(1, { error: 'about must be a record id — leave it out to ask about the whole project' }).optional(),
  reach: z.coerce
    .number({ error: 'reach must be a number of links' })
    .int({ error: 'reach must be a whole number of links' })
    .min(0, { error: 'reach must be 0 or more' })
    .max(6, { error: 'reach must be 6 or less: past six links a project is one connected lump' })
    .optional(),
  rung: z.enum(RUNGS as readonly [Rung, ...Rung[]], { error: `rung must be one of: ${RUNGS.join(', ')}` }).optional(),
})

/** The same length control, and nothing else: this reading is the whole project by definition. */
const whoseMoveQuery = z.strictObject({
  rung: z.enum(RUNGS as readonly [Rung, ...Rung[]], { error: `rung must be one of: ${RUNGS.join(', ')}` }).optional(),
})

export async function queryRoutes(app: FastifyInstance): Promise<void> {
  // THE ATTENTION THREAD ENDS WITH THE SERVER, as the seal-read thread does: an idle thread is only unref'd, and it
  // keeps its own connection to the database and the module graph of the server that started it.
  app.addHook('onClose', async () => {
    await endTheAttentionThread()
  })
  // THE LINES THE ATTENTION THREAD SENDS, such as why it read every record again, go to this server's log.
  logTheAttentionThreadTo((line) => app.log.info(line))

  /** Every write, newest first. Filter by record, by session, by time, or any of them together. */
  app.get('/changes', route('project.changes', 'remote'), async (req): Promise<ChangesReply> => {
    const q = parse(changesQuery, req.query, 'The query string is not usable:')

    // ?field= AND ?value= ARE ONE FILTER, and half of it is not a narrower question but a different one: a field
    // with no value would mean every value that field took, and a value with no field would mean every field.
    // An empty string is refused too, because it names no stored field and no stored value.
    if (
      (q.field !== undefined || q.value !== undefined) &&
      (q.field === undefined || q.value === undefined || q.field === '' || q.value === '')
    ) {
      throw new PanelError(
        `?field= and ?value= are one filter, so send both or neither: ?field= names the stored change field to ` +
          `match exactly (for example data.state), and ?value= names the stored new value to match exactly (for ` +
          `example finished); an empty one is not a value.`,
      )
    }

    // A window that ends before it starts can only ever answer with nothing, and an empty list is
    // indistinguishable from a quiet week. Refusing it names both values, which is the one piece of
    // information a caller needs to see that it has them the wrong way round.
    if (q.since !== undefined && q.until !== undefined && q.since > q.until) {
      throw new PanelError(
        `since="${q.since}" is later than until="${q.until}", so this window contains no moment at all and no ` +
          `answer to it could mean anything. A day is since=<date>&until=<date> 23:59:59; a week is the same pair ` +
          `seven days apart.`,
      )
    }

    if (q.session !== undefined && q.sessionId !== undefined && q.session !== q.sessionId) {
      throw new PanelError(
        `session="${q.session}" and sessionId="${q.sessionId}" were both sent and they are different. They ` +
          `are two spellings of one filter, so there is no answer that honours both — send one.`,
      )
    }

    // ONE PROJECT'S LOG. Read once here and put into the filter, so the list, the count and the
    // session resolution below are all about the same project — three reads that could disagree
    // are exactly how a truncated list ends up beside a count of somebody else's rows.
    const workspaceId = workspaceOf(req)
    const asked = q.session ?? q.sessionId
    const ref = asked === undefined ? undefined : resolveSessionRef(asked, workspaceId)
    const matchedValues = ref === undefined ? undefined : sessionFilterValues(ref)
    // NO ROW NAMING A MESSAGE THIS READER MAY NOT READ is listed or counted. Such a
    // message asked for by id is answered as an id naming nothing is: no rows, and nothing spent on it.
    // ONLY THE MESSAGES THE ROWS COULD NAME ARE ASKED ABOUT: those of the record's whole change log when a record is
    // asked, because what was spent on it is read over that, and those of the whole filter otherwise. Every list and
    // count below reads some of those rows, so this one list serves them all.
    const reader = theMessageReader(actorFrom(req))
    const hidden = theHiddenMessagesTheRowsName(
      q.recordId === undefined
        ? { workspaceId, since: q.since, until: q.until, session: matchedValues, field: q.field, value: q.value }
        : { workspaceId, recordId: q.recordId },
      reader,
    )
    // T2 IS ABOUT ONE RECORD, so it is read only when one was asked for. The read is over the
    // record's whole change log, which is why it is not taken from the capped `rows` below.
    const spent = q.recordId === undefined ? undefined : spentOnRecord(q.recordId, workspaceId, hidden)

    if (ref === undefined || matchedValues === undefined) {
      const filter = { workspaceId, recordId: q.recordId, since: q.since, until: q.until, field: q.field, value: q.value, hidden }
      const rows = listChanges({ ...filter, limit: q.limit })
      // Counted over the same filter rather than measured off the list, so the cap is a fact the
      // reply carries instead of a bound only the server knows about.
      const matched = countChangesMatching(filter)
      return {
        changes: toChanges(rows),
        sessions: sessionsIn(rows, workspaceId),
        matched,
        truncated: matched > rows.length,
        ...(spent === undefined ? {} : { spent }),
      }
    }

    const filter = { workspaceId, recordId: q.recordId, since: q.since, until: q.until, session: matchedValues, field: q.field, value: q.value, hidden }
    const rows = listChanges({ ...filter, limit: q.limit })
    const matched = countChangesMatching(filter)
    // Rows that store a NAME rather than the record id. When nothing answers to the reference
    // there is no id for any of them to be storing, so every matching row is one of these — it
    // used to report 0 there, next to a note in the same object saying "these N rows are the ones
    // written under that exact name". The count is the actionable half: it is what "POST
    // /api/sessions/discover would move N rows" is read off.
    //
    // COUNTED, NOT MEASURED OFF `rows`. It used to be `rows.filter(…).length`, which is a count
    // over one page of a capped list: a session with 60 rows still under its run name, asked for
    // with limit=10, reported 0 of them and dropped the sentence recommending the repoint. A
    // derived total taken from a window is the same lie as a truncated list that says it is whole.
    const byName = matchedValues.filter((v) => v !== ref.recordId)
    const storedByName =
      ref.recordId === null ? matched : byName.length === 0 ? 0 : countChangesMatching({ ...filter, session: byName })

    return {
      changes: toChanges(rows),
      session: {
        asked: ref.asked,
        param: q.session !== undefined ? 'session' : 'sessionId',
        matchedBy: ref.matchedBy,
        recordId: ref.recordId,
        title: ref.title,
        names: ref.names,
        matchedValues,
        storedByName,
        note:
          ref.recordId === null
            ? `Nothing is filed as "${ref.asked}": ${ref.why} These ${matched} row` +
              `${matched === 1 ? '' : 's'} are the ones written under that exact name.`
            : `"${ref.asked}" is the session record ${ref.recordId} ("${ref.title}"), matched by ` +
              `${ref.matchedBy}` +
              (ref.names.length > 0 ? `; it also answers to ${ref.names.join(', ')}` : '') +
              `. Rows are matched on ${matchedValues.length} stored value` +
              `${matchedValues.length === 1 ? '' : 's'}, because the log can hold the record id and the run ` +
              `name at once` +
              (storedByName > 0
                ? ` — and ${storedByName} of these still hold a name. POST /api/sessions/discover repoints them.`
                : '.'),
      },
      sessions: sessionsIn(rows, workspaceId),
      matched,
      truncated: matched > rows.length,
      ...(spent === undefined ? {} : { spent }),
    }
  })

  /**
   * Results with no recorded downstream consumption: every live claim, module and idea that no
   * `consumes` link points at.
   *
   * NOT "results nobody is using" — see the header. A `measures` link does not take a record off
   * this list, deliberately, and a record on the list is one nothing has been recorded as depending
   * on rather than one nobody has looked at.
   */
  app.get(
    '/queries/rule-three-signature',
    route(
      'project.rule-three-signature',
      'remote',
      'Has anybody used the hole in rule 3? An agent may not mark a block that is already stored, the rule ' +
        'matches by id, and deleting the block and writing the same words back under a new id gets the mark ' +
        'through. THE SIGNATURE IS a rule-3 refusal followed, in the same project, by the same record gaining a ' +
        'marked block with an id nothing had seen before. THIS ANSWERS THE SECOND HALF ONLY, from the revision ' +
        'ledger, and says so: the refusal throws and is stored nowhere, and the call log keeps the operation, the ' +
        'status and the time of every request but not which record was refused. So `candidates` are candidates ' +
        'and none of them is the signature — most are ordinary, because an agent writing a report may mark its ' +
        'own machinery paragraphs as it writes them. `looked` says how many records and revisions were read, so ' +
        'an empty list means nobody did this rather than nobody looked. The hole stays open. ' +
        'Writes nothing.',
    ),
    async (req) => theRuleThreeSignature(workspaceOf(req)),
  )

  app.get('/queries/unconsumed', route('project.unconsumed', 'remote'),
    async (req): Promise<{ records: PanelRecord[]; counted: number }> => {
    const workspaceId = workspaceOf(req)
    // `counted` IS WHAT TELLS AN EMPTY ANSWER APART. Nought records here means either that
    // everything something could build on is built on, or that there is nothing of the sort on
    // file. See `unconsumedOver`.
    return { records: unconsumed(workspaceId), counted: unconsumedOver(workspaceId) }
  })

  app.get(
    '/queries/unmet',
    route('project.unmet', 'remote'),
    async (req): Promise<{ items: { consumer: PanelRecord; missingTitle: string }[] }> => {
      return { items: unmetDependencies(workspaceOf(req), theMessageReader(actorFrom(req))) }
    },
  )

  /**
   * THE DECISIONS ON FILE THAT CARRY NO SUMMARY, criterion DC3.
   *
   * Level 3 of the reading ladder is the record's own `summary`, and a decision's summary is its
   * context: what happened and why the choice was made. A decision filed without one is incomplete,
   * not refused (criterion DC2), and this reading is where that incompleteness becomes work. Each
   * row carries the decision's own `because`, its `source` and the record its authority lives in, so
   * the context can be written from what the decision already holds. Where the context cannot be
   * found, the summary says so in words and does not invent one.
   *
   * THIS READS AND NOTHING ELSE. No context is backfilled and no record changes. `counted` is how
   * many live decisions were looked at, so an empty list is not the same answer as no decisions at
   * all.
   */
  app.get(
    '/queries/decisions-without-summary',
    route(
      'project.decisions-without-summary',
      'remote',
      'The live decisions in this project that carry no `summary`, newest filed first. A decision\'s summary ' +
        'is its level-3 context — what happened and why the choice was made — so this is the work of writing ' +
        'the context from what each decision already holds: its `because`, its `source` and the record its ' +
        'authority lives in. Reads only; nothing is backfilled. `counted` is how many live decisions were ' +
        'looked at, so an empty list is not the same answer as no decisions at all.',
    ),
    async (req): Promise<{ decisions: DecisionWithoutSummary[]; counted: number }> => {
      const workspaceId = workspaceOf(req)
      return { decisions: decisionsWithoutSummary(workspaceId), counted: decisionsOver(workspaceId) }
    },
  )

  /**
   * What needs a person today, and why — the shared rule, run here.
   *
   * The whole result comes back: the rows a person reads first, the remainder with the named
   * groups it is made of, the reasons and every rank factor per row, and the three groups that are
   * questions rather than verdicts — a state word nobody has classified, a record with no state at
   * all, and work somebody deliberately put down. A caller draws this; it does not re-derive it.
   * A second implementation of "what needs me today" is the one piece of duplication in this
   * product that would be actively dangerous.
   */
  app.get('/attention', route('project.attention', 'remote'), async (req): Promise<AttentionHomeReply | AttentionFlowReply | AttentionNarrowReply | AttentionOfOtherProjects | (AttentionFullReply & { machineSweep: MachineSweepReport }) | AttentionPartPage> => {
    const q = parse(attentionQuery, req.query, 'The query string is not usable:')
    const workspaceId = workspaceOf(req)
    const sweep = q.machine === 'include' ? unclaimedSweep(workspaceId) : null
    // ONLY WHAT THIS READER MAY READ goes into the reading.
    // ON A THREAD OF ITS OWN, so the server reads other requests while it is worked out (problem
    // CtH8CGBkE5Bz, src/server/lib/attention-thread.ts).
    // IN THE SHAPE ASKED FOR, cut on that thread, so only that shape comes back to this one (round 22 of
    // wave 13w). Home's shape is a few kilobytes; the whole reading can be megabytes.
    // NO SHAPE IS NARROW, except with machine=include: only the full answer carries the machine list,
    // so that one combination asks for the full reading rather than answering a sweep nobody can see.
    const theShape = q.shape ?? (q.machine === 'include' ? undefined : 'narrow')
    const input = { workspaceId, resources: sweep?.resources ?? [], reader: theMessageReader(actorFrom(req)) }
    if (theShape === 'part') return attentionOnItsOwnThread(input, { shape: 'part', part: q.part!, from: q.from ?? 0, machine: q.machine ?? 'omit' })
    if (theShape === 'home' || theShape === 'flow' || theShape === 'narrow') return attentionOnItsOwnThread(input, { shape: theShape })
    if (theShape === 'other-projects') {
      // THE LIST GET /api/workspaces ANSWERS, read here, and the readings in one ask of the thread.
      const each = listWorkspaces().map((one) => one.id).filter((id) => id !== workspaceId)
      return { leftOut: workspaceId, projects: await homeAttentionOfEachProjectOnItsOwnThread({ resources: [], reader: input.reader }, each) }
    }
    return { ...(await attentionOnItsOwnThread(input, { shape: 'full', machine: q.machine ?? 'omit' })), machineSweep: describeSweep(sweep) }
  })

  /**
   * EVERY RECORD READ AGAIN AT THE NEXT ATTENTION READ. The attention thread keeps the records the rule reads, and
   * reads again only the ones the change log names (src/server/lib/attention-kept-records.ts). A write made straight
   * into the database file writes no change row, so after one this brings the reading back to what the file holds,
   * as a restart does. It writes nothing.
   */
  app.post(
    '/attention/read-everything-again',
    route(
      'project.attention-read-again',
      'remote',
      'Make the next attention read read every record again, and not only the records the change log names since the last read. Use it after a write made straight into the database file, which leaves no change row. A restart does the same. Writes nothing. Body {}. Answers whether the attention thread was running.',
    ),
    async (req): Promise<{ theThreadWasRunning: boolean }> => {
      parse(z.strictObject({}), req.body ?? {}, 'The request body is not usable:')
      return { theThreadWasRunning: readEverythingAgainAtTheNextAsk() }
    },
  )

  /**
   * What has changed since this reader last looked.
   *
   * The anchor is stored on the SERVER and belongs to the person, not to a browser: the desk and
   * the phone read the same bookmark and move it for each other. A reader who has never looked
   * gets `anchor: null` and `changes: null` with a sentence saying so — never an empty list, which
   * would read as "nothing happened".
   */
  /**
   * WHAT IS STILL OPEN IN THIS PROJECT, for somebody who has just arrived and knows nothing.
   *
   * One reading — `openLoopsFor` in src/server/lib/openloops.ts — with three callers: this route,
   * the record surface's own `GET /api/records/:id/context`, and the session hook that briefs an
   * agent at the start of a run. A second opinion about what is still open is the one duplication
   * that would send an agent to the wrong work, which is the incident this answers.
   *
   * IT NEVER READS A BODY TO DECIDE WHAT TO LEAVE OUT. Every exclusion is a stored fact and every
   * excluded id is named, so nothing is a number a caller cannot open.
   */
  app.get('/open-loops', route('project.open-loops', 'remote'), async (req): Promise<OpenLoops> => {
    const q = parse(openLoopsQuery, req.query, 'That is not a way to ask what is still open:')
    return openLoopsFor({
      workspaceId: workspaceOf(req),
      // ONLY WHAT THIS READER MAY READ.
      reader: theMessageReader(actorFrom(req)),
      ...(q.about === undefined ? {} : { anchorId: q.about }),
      ...(q.reach === undefined ? {} : { reach: q.reach }),
      ...(q.rung === undefined ? {} : { rung: q.rung }),
    })
  })

  /**
   * WHOSE MOVE IT IS, across this project's open loops.
   *
   * `whose_move` is a field an agent may write, so it gets its own queue. It is NOT
   * `GET /api/needs-you`, which answers what an agent is REFUSED — settling a fork — from the kind
   * and the resolution. Nothing written in this field can add anything to that queue or take
   * anything out of it, and this route reads nothing that route reads.
   */
  app.get('/whose-move', route('project.whose-move', 'remote'), async (req): Promise<WhoseMoveReading> => {
    const q = parse(whoseMoveQuery, req.query, 'That is not a way to ask whose move it is:')
    return whoseMoveIn(workspaceOf(req), q.rung ?? 'title')
  })

  app.get('/anchor', route('anchor.read', 'remote'), async (req): Promise<AnchorReading> => {
    const actor = actorFrom(req)
    const q = parse(anchorQuery, req.query, 'The query string is not usable:')
    // NO ROW NAMING A MESSAGE THIS READER MAY NOT READ is listed or counted.
    const workspaceId = workspaceOf(req)
    const hidden = everyMessageHiddenFrom(theMessageReader(actor), workspaceId)
    return readingSinceAnchor(readerOf(actor), workspaceId, { limit: q.limit, hidden })
  })

  /**
   * Mark the point this reader has read to.
   *
   * The moment is the server's own clock and is never sent by the caller: an anchor an hour out
   * hides an hour of agent work, silently. `lastChangeId` may be sent by a reader that has read as
   * far as one particular row, and defaults to the newest row in the log.
   *
   * This writes NOTHING to the change log, on purpose. An anchor moves every time a page is
   * opened, and the change log IS the daily view — logging the act of reading the day would bury
   * the day. db/schema.ts gives the full reasoning.
   */
  app.put('/anchor', route('anchor.write', 'remote'), async (req): Promise<AnchorMove> => {
    const actor = actorFrom(req)
    const body = parse(anchorBody, req.body ?? {}, 'The request body is not usable:')
    return moveAnchor(
      readerOf(actor),
      workspaceOf(req),
      body.lastChangeId === undefined ? {} : { lastChangeId: body.lastChangeId },
    )
  })
}
