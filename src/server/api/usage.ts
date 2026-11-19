// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { receiptUsage } from '../lib/usage-receipts.ts'
/**
 * HOW AGENTS READ THIS PROJECT: THE MEASUREMENTS, AND THE ONE THING AN AGENT WRITES.
 *
 * Eight reads and one write. The reads are structured — counts, ids and numbers — and compose no
 * English sentence where a number will do, because `GET /api` was measured at 93% prose by bytes and
 * this family is built not to repeat it.
 *
 * ---------------------------------------------------------------------------------------
 * THE WRITE IS THE ONLY THING HERE MOLE OFFICE DID NOT MEASURE ITSELF
 * ---------------------------------------------------------------------------------------
 *
 * `POST /api/usage/outside-reads` is an agent saying *I went somewhere other than Mole Office for project
 * state, and here is my own judgement about why*. Mole Office did not see it happen. Every surface drawing
 * from it says so in those words: it is not evidence that Mole Office lacked something, it is evidence
 * that an agent BELIEVED Mole Office lacked something, which is a different and still useful fact.
 *
 * WHAT MOLE OFFICE ADDS IS A COMPARISON AND NEVER AN OVERRULING. Each question in the closed list carries
 * the operation Mole Office already has for it, or nothing. An agent that calls something a boundary when
 * Mole Office has an operation for it lands in a different column from one that met a real gap. Both are
 * counted; neither is corrected.
 *
 * ---------------------------------------------------------------------------------------
 * THE READS ARE NOT RECORDED AND THE WRITE IS
 * ---------------------------------------------------------------------------------------
 *
 * A request whose operation begins `usage.` and whose effect is `read` writes no row in `api_calls`.
 * Without that rule the page reads the summary, the read writes a row, the row changes the summary,
 * and within a day the largest operation in the telemetry is reading the telemetry. The write is not
 * exempt, because it is part of the evidence.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { anOfficeId } from '../lib/ids.ts'
import { desc, eq, sql } from 'drizzle-orm'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { route } from '../lib/route.ts'
import { db } from '../db/client.ts'
import { apiCalls, hourlyCalls, outsideReads, usageStretches } from '../db/schema.ts'
import { callIdOf, isRecording, usageCounters } from '../lib/usage.ts'
import {
  EVERY_COLUMN,
  foldedCallsSince,
  gapReadings,
  HINT_THRESHOLD,
  lastPruneReport,
  operationReadings,
  outsideSince,
  patternReadings,
  sequenceReadings,
  stretchesOf,
  tracedCallsSince,
} from '../lib/usage-reads.ts'
import { theRequestWindows } from '../lib/what-is-kept.ts'
import { agentUsage } from '../lib/usage-agents.ts'
import { proposeFromPatterns } from '../lib/pattern-proposals.ts'
import { OUTSIDE_SOURCES, PURPOSES, VERDICTS, WANTED } from '@shared/ops.ts'
import { localStamp } from '@shared/time.ts'

const DAY = 24 * 60 * 60 * 1000

/**
 * HOW FAR BACK EVERY READ HERE LOOKS BY DEFAULT. Criterion U6: the traced window in force, which is
 * the person's setting when they have chosen and the default when nobody has.
 *
 * The traced window, because that is the span the rows actually cover. A shorter default would make
 * a page look emptier than the data is; a longer one would promise rows the prune has taken.
 */
function defaultDays(): number {
  return theRequestWindows().traced.value
}

/** The query's own bound: nothing older than the traced window in force survives the prune. */
function windowQueryFor(maxDays: number) {
  return z.strictObject({
    /** How many days back to read. Bounded by the traced window, because nothing older survives. */
    days: z.coerce.number().int().min(1).max(maxDays).optional(),
  })
}

/**
 * WHAT AN AGENT FILES WHEN IT WENT OUTSIDE MOLE OFFICE.
 *
 * `wanted_other` IS REQUIRED WHEN `wanted` IS `other` AND FORBIDDEN OTHERWISE, and both halves are
 * refusals rather than one. Required, because `other` with nothing beside it is a row that can never
 * become evidence for extending the list. Forbidden, because a free-text note beside a real question
 * would be counted by nothing and read by somebody as though it were.
 */
const outsideBody = z
  .strictObject({
    source: z.enum(OUTSIDE_SOURCES),
    what: z.string().min(1).max(400),
    wanted: z.enum(WANTED.map((w) => w.name) as [string, ...string[]]),
    wanted_other: z.string().min(1).max(200).optional(),
    verdict: z.enum(VERDICTS),
    trace: z.string().min(1).max(64).optional(),
    purpose: z.enum(PURPOSES).optional(),
  })
  .refine((body) => body.wanted !== 'other' || body.wanted_other !== undefined, {
    message:
      "wanted_other is required when wanted is \"other\". A row saying only \"other\" cannot become evidence for " +
      'adding a word to the list, which is the one thing that entry is for.',
    path: ['wanted_other'],
  })
  .refine((body) => body.wanted === 'other' || body.wanted_other === undefined, {
    message:
      'wanted_other belongs only to wanted: "other". Beside a question that already has a word, nothing counts it ' +
      'and a reader would take it for something that was.',
    path: ['wanted_other'],
  })

export async function usageRoutes(app: FastifyInstance): Promise<void> {
  /** Everything the page needs to say what it is drawing, and whether anything is drawing at all. */
  app.get(
    '/usage/summary',
    route(
      'usage.summary',
      'remote',
      'What the measurement layer holds right now: how many calls and claims are stored, how far back they ' +
        'go, whether the recorder is running in this process, and how many rows it failed to write. ' +
        '"No rows" and "not recording" are different facts and this is where the difference is published.',
    ),
    async (req) => {
      const workspaceId = workspaceOf(req)
      const counters = usageCounters()
      const oldest = db.select({ at: sql<number>`min(${apiCalls.atMs})` }).from(apiCalls).get()
      const calls = db.select({ n: sql<number>`count(*)` }).from(apiCalls).get()?.n ?? 0
      // AND THE CALLS THAT WERE COUNTED RATHER THAN STORED. Criterion U6. Without this the total on
      // the page would fall by 62 per cent with nothing saying why; `calls` is what the request log
      // holds, and this is what the counted rows hold on top of it.
      const folded = db.select({ n: sql<number>`coalesce(sum(${hourlyCalls.calls}), 0)` }).from(hourlyCalls).get()?.n ?? 0
      const traced = db
        .select({ n: sql<number>`count(*)` })
        .from(apiCalls)
        .where(sql`${apiCalls.traceId} is not null`)
        .get()?.n ?? 0
      const claims = db.select({ n: sql<number>`count(*)` }).from(outsideReads).get()?.n ?? 0
      const summaries = db.select({ n: sql<number>`count(*)` }).from(usageStretches).get()?.n ?? 0
      // THE WINDOWS IN FORCE, from the person's setting, read here rather than from the constants.
      const windows = theRequestWindows()
      return {
        workspace: workspaceId,
        recording: isRecording(),
        calls,
        // THE TWO HALVES OF "HOW MANY CALLS WERE THERE". `calls` is one row each in the request log;
        // `foldedCalls` is the calls a counted hourly row stands for. `calls` alone changed meaning
        // when the fold landed, so the page says both rather than drawing the smaller one as if it
        // were the whole truth.
        foldedCalls: Number(folded),
        // THE SPLIT THE WHOLE SURFACE USES IS TRACED AGAINST UNTRACED, and it is a fact about the
        // request rather than a claim about the caller. `actor_type` cannot do this job: the browser
        // sends whatever identity a person picked in the sidebar, so a browser claiming to be an
        // agent would land in the agent bucket with nothing saying so.
        tracedCalls: traced,
        untracedCalls: calls - traced,
        outsideReads: claims,
        stretchSummaries: summaries,
        oldestCallAt: oldest?.at == null ? null : localStamp(new Date(oldest.at)),
        windowDays: { untraced: windows.untraced.value, traced: windows.traced.value },
        // WHETHER ANYTHING HAS ENFORCED THOSE WINDOWS, which is a different fact from what they
        // are. Null means no prune has run in this process, and a reader may not take the windows
        // above as describing what the database actually holds until one has.
        lastPrune: lastPruneReport(),
        rowsNotWritten: counters.writesFailed,
        traceHeadersIgnored: counters.traceHeaderIgnored,
      }
    },
  )

  /** What agents keep asking for, and what it costs. */
  app.get(
    '/usage/operations',
    route(
      'usage.operations',
      'remote',
      'Per operation: how many calls, how many refusals, how many bytes came back, and the median ' +
        'milliseconds with held listens left out. For a write it also carries how often a read came ' +
        'straight back for the same thing — the measurement that would justify a continuation hint, ' +
        'and not a hint.',
    ),
    async (req) => {
      const traced = defaultDays()
      const { days } = parse(windowQueryFor(traced), req.query, 'The query string')
      const from = Date.now() - (days ?? traced) * DAY
      // THE COUNTS THAT STOOD WHERE THE LONG-POLL ROWS WERE, so this table's count per operation
      // is the whole count and not just the part stored one row each. Criterion U6.
      const folded = foldedCallsSince(from, workspaceOf(req))
      // COUNTED BY SQLITE, one row per operation. Fetching every call row into JavaScript took 0.6
      // to 0.8 s over 703,341 rows (problem Hy13YXeH7xHL); before that, walking them once per
      // operation took 162 seconds (problem seMxXokrlWrI).
      const { readings, of } = operationReadings(from, workspaceOf(req), folded)
      return {
        operations: readings,
        // THE THRESHOLD IS PUBLISHED BESIDE THE MEASUREMENT rather than left in a document. A share
        // with no threshold beside it invites whoever reads it to invent one.
        hintThreshold: HINT_THRESHOLD,
        of,
      }
    },
  )

  /** Stretches of work, newest first — which is what a recovery is. */
  app.get(
    '/usage/traces',
    route(
      'usage.traces',
      'remote',
      'Every stretch of work in the window: what it was for, how long it took, why it ended, how many ' +
        'calls and outside reads it held, and whether it ran from this machine or another. A stretch is ' +
        "Mole Office's own segmentation of a trace, not the caller's, so the numbers are right whether or not " +
        'an agent rotated its trace name.',
    ),
    async (req) => {
      const now = Date.now()
      const traced = defaultDays()
      const { days } = parse(windowQueryFor(traced), req.query, 'The query string')
      // TRACED ROWS ONLY, because a stretch is a run of work inside one trace and `stretchesOf`
      // drops every row that carries none. Fetching the rest was fetching rows to throw away:
      // 5,383 instead of 602,962 on the owner's corpus.
      const rows = tracedCallsSince(now - (days ?? traced) * DAY, workspaceOf(req), EVERY_COLUMN)
      const claims = outsideSince(now - (days ?? traced) * DAY, workspaceOf(req))
      const stretches = stretchesOf(rows, now)
        .map((stretch) => {
          const mine = claims.filter((c) => c.traceId === stretch.traceId && c.atMs >= stretch.startedMs && c.atMs <= stretch.endedMs)
          return {
            traceId: stretch.traceId,
            seq: stretch.seq,
            purpose: stretch.purpose,
            startedAt: localStamp(new Date(stretch.startedMs)),
            minutes: Math.round(((stretch.endedMs - stretch.startedMs) / 60000) * 10) / 10,
            endedBecause: stretch.endedBecause,
            calls: stretch.rows.length,
            reads: stretch.rows.filter((r) => r.effect === 'read').length,
            writes: stretch.rows.filter((r) => r.effect === 'write').length,
            refused: stretch.rows.filter((r) => r.status >= 400 && r.status < 500).length,
            bytes: stretch.rows.reduce((sum, r) => sum + (r.bytes ?? 0), 0),
            distinctOperations: new Set(stretch.rows.map((r) => r.operation).filter((o) => o !== null)).size,
            outsideReads: mine.length,
            gapVerdicts: mine.filter((c) => c.verdict === 'gap').length,
            localCalls: stretch.rows.filter((r) => r.clientOrigin === 'local').length,
            remoteCalls: stretch.rows.filter((r) => r.clientOrigin === 'remote').length,
            unknownCalls: stretch.rows.filter((r) => r.clientOrigin === null).length,
            actorId: stretch.rows.map((r) => r.actorId).find((a) => a !== null) ?? null,
            sessionId: stretch.rows.map((r) => r.sessionId).find((s) => s !== null) ?? null,
          }
        })
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      // A STRETCH SUMMARY IS A PRUNED STRETCH, so it belongs in the same list rather than in a second
      // one a reader would have to join by hand. It carries `fromSummary` so nothing reads a summary
      // as though its rows were still there to open.
      const pruned = db
        .select()
        .from(usageStretches)
        .orderBy(desc(usageStretches.startedMs))
        .all()
        .map((row) => ({
          traceId: row.traceId,
          seq: row.stretchSeq,
          purpose: row.purpose,
          startedAt: localStamp(new Date(row.startedMs)),
          minutes: Math.round(((row.endedMs - row.startedMs) / 60000) * 10) / 10,
          endedBecause: row.endedBecause,
          calls: row.calls,
          reads: row.reads,
          writes: row.writes,
          refused: row.refused,
          bytes: row.bytes,
          distinctOperations: row.distinctOperations,
          outsideReads: row.outsideReads,
          gapVerdicts: row.gapVerdicts,
          localCalls: row.localCalls,
          remoteCalls: row.remoteCalls,
          unknownCalls: row.unknownCalls,
          actorId: row.actorId,
          sessionId: row.sessionId,
          thenWrote: row.thenWrote,
          fromSummary: true,
        }))
      return { stretches, pruned }
    },
  )

  /** One trace, its calls and its claims merged in time order. */
  app.get<{ Params: { id: string } }>(
    '/usage/traces/:id',
    route(
      'usage.trace',
      'remote',
      'One piece of work, call by call and claim by claim, in the order they happened. This is the ' +
        'developer view: Normal mode never draws a raw row.',
    ),
    async (req, reply) => {
      const rows = db.select().from(apiCalls).where(eq(apiCalls.traceId, req.params.id)).orderBy(apiCalls.atMs).all()
      const claims = db.select().from(outsideReads).where(eq(outsideReads.traceId, req.params.id)).all()
      if (rows.length === 0 && claims.length === 0) {
        const traced = defaultDays()
        return reply.code(404).send({
          error:
            `No stretch of work is recorded under "${req.params.id}". Either nothing was ever sent with that ` +
            `name, or its rows are past the ${String(traced)}-day window and only the stretch summary is ` +
            `left — GET /api/usage/traces carries those.`,
        })
      }
      const events = [
        ...rows.map((r) => ({
          kind: 'call' as const,
          at: localStamp(new Date(r.atMs)),
          operation: r.operation,
          effect: r.effect,
          status: r.status,
          ms: r.ms,
          bytes: r.bytes,
          listLen: r.listLen,
          targetId: r.targetId,
          clientOrigin: r.clientOrigin,
          clientAddr: r.clientAddr,
          identitySource: r.identitySource,
        })),
        ...claims.map((c) => ({
          kind: 'outside' as const,
          at: localStamp(new Date(c.atMs)),
          source: c.source,
          what: c.what,
          wanted: c.wanted,
          wantedOther: c.wantedOther,
          verdict: c.verdict,
        })),
      ].sort((a, b) => a.at.localeCompare(b.at))
      return { traceId: req.params.id, events }
    },
  )

  /** What has crossed a threshold, and what is approaching one. */
  app.get(
    '/usage/patterns',
    route(
      'usage.patterns',
      'remote',
      'Every pattern this measurement layer knows, crossed or not, with the numbers that decided it. ' +
        'NOTHING IS FILED AUTOMATICALLY: a person or an agent decides whether a crossing is worth a ' +
        'record, because a problem filed by a count would carry nobody’s judgement and nobody’s name.',
    ),
    async (req) => {
      const now = Date.now()
      const traced = defaultDays()
      const { days } = parse(windowQueryFor(traced), req.query, 'The query string')
      const workspaceId = workspaceOf(req)
      const from = now - (days ?? traced) * DAY
      const claims = outsideSince(from, workspaceId)
      const gaps = gapReadings(claims.map((c) => ({ ...c, remote: false })))
      return { patterns: patternReadings(from, workspaceId, gaps, now) }
    },
  )

  /** Which operation follows which. */
  app.get(
    '/usage/sequences',
    route(
      'usage.sequences',
      'remote',
      'Ordered pairs of operations inside one stretch: what agents do next. It reads rows, so it covers ' +
        'the traced window and does not survive the prune — the stretch summary carries no ordering.',
    ),
    async (req) => {
      const now = Date.now()
      const traced = defaultDays()
      const { days } = parse(windowQueryFor(traced), req.query, 'The query string')
      // Traced rows only, for the reason on GET /api/usage/traces above: a sequence is a pair of
      // calls inside one stretch, and a stretch is made of traced rows.
      const rows = tracedCallsSince(now - (days ?? traced) * DAY, workspaceOf(req), [
        'traceId',
        'atMs',
        'purpose',
        'operation',
      ])
      return { sequences: sequenceReadings(rows, now).slice(0, 20), survivesPrune: false }
    },
  )

  /** Which tool the agents ran in, where they were refused, and how long before they wrote anything. */
  app.get(
    '/usage/agents',
    route(
      'usage.agents',
      'remote',
      'THE SAME CALLS, SPLIT BY THE TOOL THAT MADE THEM AND BY THE PROJECT, with the refusals grouped ' +
        'by what each status means, and the time from a run arriving to its first useful write. A call ' +
        'row carries the actor and the session and never the tool, so the tool is the one the run declared: ' +
        "the session record's adaptedTool, or for a call that names no session record, the agent registry's " +
        'runtime. Every arrival says which of the two answered. Calls whose run declared no tool Mole Office ' +
        'adapts are counted under a null tool, "not declared", with the sentence saying why; the free runtime ' +
        'word is never counted. A run that has written nothing has no time to a first write, and that is ' +
        'said in words rather than returned as a zero.',
    ),
    async (req) => {
      const windows = theRequestWindows()
      const traced = windows.traced.value
      const { days } = parse(windowQueryFor(traced), req.query, 'The query string')
      const from = Date.now() - (days ?? traced) * DAY
      return {
        window: {
          days: days ?? traced,
          from: localStamp(new Date(from)),
          note:
            'Untraced rows are kept for ' +
            `${String(windows.untraced.value)} days and traced ones for ${String(windows.traced.value)}, so a longer ` +
            'window than the first does not mean more untraced calls; it means the ones that survived.',
        },
        ...agentUsage(from, workspaceOf(req)),
        receipts: receiptUsage(from, workspaceOf(req)),
      }
    },
  )

  /** What the runs' receipts say, without the arrivals. */
  app.get(
    '/usage/receipts',
    route(
      'usage.agents',
      'remote',
      'THE RECEIPTS ALONE: the `receipts` part of GET /api/usage/agents, from the same summation over the ' +
        'same runs, without the arrivals and the refusals. A receipt is what the tool a run declared said the ' +
        'run used, filed on the run. `days` is bounded by the traced window, as there, so for the same days ' +
        'the two answer over the same runs.',
    ),
    async (req) => {
      const traced = theRequestWindows().traced.value
      const { days } = parse(windowQueryFor(traced), req.query, 'The query string')
      const from = Date.now() - (days ?? traced) * DAY
      return {
        window: {
          days: days ?? traced,
          from: localStamp(new Date(from)),
          note: 'The runs filed in this project since `from`, by the time each was filed.',
        },
        receipts: receiptUsage(from, workspaceOf(req)),
      }
    },
  )

  /** File a proposal for each crossed pattern that has none. Never a change, and never twice. */
  app.post(
    '/usage/patterns/proposals',
    route(
      'usage.propose',
      'remote',
      'A CROSSED THRESHOLD BECOMES A PROPOSAL FOR THE PERSON. It reads GET /api/usage/patterns, and for ' +
        'every pattern that has crossed and has no proposal yet it files one, with the numbers behind it ' +
        'and the two answers worth defending. It never changes a route, a shape or an existing record. ' +
        'It files at most one proposal per crossing, ever: the proposal carries `source` set to Mole ' +
        "Office's own name for that crossing, and this route looks for that before writing anything, so " +
        'the mark and the thing marked are one row. A proposal somebody deleted still counts as proposed.',
    ),
    async (req, reply) => {
      const now = Date.now()
      const workspaceId = workspaceOf(req)
      const traced = defaultDays()
      const claims = outsideSince(now - traced * DAY, workspaceId)
      const gaps = gapReadings(claims.map((c) => ({ ...c, remote: false })))
      const out = proposeFromPatterns(workspaceId, actorFrom(req), patternReadings(now - traced * DAY, workspaceId, gaps, now))
      reply.status(out.filed.length === 0 ? 200 : 201)
      return out
    },
  )

  /** What agents said they went outside Mole Office for. */
  app.get(
    '/usage/outside-reads',
    route(
      'usage.outside',
      'remote',
      'What agents said they went outside Mole Office for, grouped by the question and never by the file. ' +
        'EVERY ROW IS A CLAIM: Mole Office did not see it happen, an agent said it did. The five outcomes ' +
        'beside each question compare that claim with what Mole Office actually has an operation for, and ' +
        'none of them overrules the agent.',
    ),
    async (req) => {
      const now = Date.now()
      const traced = defaultDays()
      const { days } = parse(windowQueryFor(traced), req.query, 'The query string')
      const claims = outsideSince(now - (days ?? traced) * DAY, workspaceOf(req))
      // WHICH MACHINE A CLAIM CAME FROM IS READ THROUGH THE CALL THAT FILED IT, not stored again
      // here. The same request was already writing a row carrying that fact.
      const callIds = claims.map((c) => c.callId).filter((id): id is string => id !== null)
      const origins = new Map<string, string | null>()
      if (callIds.length > 0) {
        for (const row of db
          .select({ id: apiCalls.id, origin: apiCalls.clientOrigin })
          .from(apiCalls)
          .where(sql`${apiCalls.id} in ${callIds}`)
          .all())
          origins.set(row.id, row.origin)
      }
      const withMachine = claims.map((c) => ({
        wanted: c.wanted,
        verdict: c.verdict,
        traceId: c.traceId,
        remote: c.callId !== null && origins.get(c.callId) === 'remote',
      }))
      return {
        questions: gapReadings(withMachine),
        // THE LIST'S OWN EVIDENCE FOR GROWING. A row saying `other` carries what the agent wanted in
        // its own words, and those words are how a word gets added — from what agents actually asked,
        // not from what anybody could imagine today.
        withNoWordYet: claims
          .filter((c) => c.wanted === 'other')
          .map((c) => ({ what: c.what, wantedOther: c.wantedOther, at: localStamp(new Date(c.atMs)) })),
        claims: claims.length,
      }
    },
  )

  /** The one write: an agent reporting that it went somewhere else. */
  app.post(
    '/usage/outside-reads',
    route(
      'usage.report-outside',
      'remote',
      'File one trip outside Mole Office: where you looked, what you wanted from the closed list of eleven ' +
        'questions, and your own judgement — whether that truth belongs outside Mole Office, whether Mole Office ' +
        'should have had it, or whether you do not know. Mole Office stores the judgement and never overrules it.',
    ),
    async (req, reply) => {
      const body = parse(outsideBody, req.body, 'The report')
      const actor = actorFrom(req)
      const workspaceId = workspaceOf(req)
      const id = anOfficeId()
      // THE CALL THAT FILED THIS REPORT. It is the key that makes the five copied columns checkable,
      // and it is where the machine is read from — so this table stores no address of its own.
      //
      // IT IS READ OFF THE REQUEST AND NOT OFF THE REPLY. The recorder mints the id in `onRequest`
      // and sets the header in `onSend`, which runs after this handler has returned, so
      // `reply.getHeader` here answers null every time and would file a null key on every row.
      const callId = callIdOf(req)
      db.insert(outsideReads)
        .values({
          id,
          atMs: Date.now(),
          traceId: body.trace ?? (typeof req.headers['x-mole-office-trace'] === 'string' ? req.headers['x-mole-office-trace'] : null),
          workspaceId,
          workspaceStated: 1,
          actorType: actor.type,
          actorId: actor.id,
          sessionId: actor.sessionId,
          source: body.source,
          what: body.what,
          wanted: body.wanted,
          wantedOther: body.wanted_other ?? null,
          verdict: body.verdict,
          callId,
        })
        .run()
      const entry = WANTED.find((w) => w.name === body.wanted)
      return reply.code(201).send({
        id,
        // WHAT MOLE OFFICE MAKES OF THE CLAIM, said back at the moment it is filed rather than only on a
        // page nobody may open. It is a comparison, not a correction: the verdict stored is the one
        // that was sent.
        moleOfficeHasAnOperationFor: entry?.answeredBy ?? null,
        counted:
          entry?.answeredBy == null
            ? body.verdict === 'gap'
              ? 'capability gap'
              : body.verdict === 'boundary'
                ? 'boundary'
                : 'the agent did not know'
            : body.verdict === 'gap'
              ? 'not found'
              : body.verdict === 'boundary'
                ? 'boundary, disputed'
                : 'the agent did not know',
      })
    },
  )
}
