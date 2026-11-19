// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Session routes: what is running, what died, and what each one worked on.
 *
 * Same three steps per handler as api/records.ts, in the same order: work out who is asking,
 * check the input, then call one function in lib/sessions.ts. No filesystem walking and no
 * database work happens in this file -- the rules about what discovery may overwrite live in one
 * place, and a route that reached past them could quietly undo somebody's edits.
 *
 * ---------------------------------------------------------------------------------------
 * READS DO NOT WRITE
 * ---------------------------------------------------------------------------------------
 *
 * GET /api/sessions and GET /api/sessions/:id observe the machine and answer. They store
 * nothing. This is the same rule `incomplete` follows in api/records.ts -- computed on every
 * read, never a column -- and here it matters more, because the answer being computed is "is this
 * still alive". A cached `running` is wrong the moment the process exits and wrong silently,
 * which is the failure this endpoint exists to remove.
 *
 * Writing is a separate, explicit request:
 *
 *   POST /api/sessions/discover     file what is on disk as records, idempotently
 *   POST /api/sessions/:id/link     link one session to a record it worked on
 *
 * `discover` is not in the original three endpoints and is here deliberately: sessions have to
 * become records before anything can link to them, and a GET that wrote to the database would
 * mean a browser prefetch or a health check silently creating records. The link route files a
 * session on demand too, so the common path needs no separate sweep.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT COMES BACK WITH EVERY SESSION
 * ---------------------------------------------------------------------------------------
 *
 * Every session carries `state` AND `stateReason`. The reason is not decoration: `orphaned` and
 * `unknown` are real answers here, and an answer a reader cannot check is one they have to either
 * take on faith or ignore. "no process names this session and its log last grew 9h ago" is
 * something a person can disagree with; "orphaned" on its own is not.
 *
 * It also carries `placement`: which pipeline or module the run is filed under, how Mole Office knows,
 * and — when nothing places it — which of the four reasons that is and the one request that would
 * fix it. That rule used to run only in the browser, and it was the single most expensive thing in
 * this product for the agents that write to it: they could not find out where their own work would
 * appear without reading a React component, and the one that did not read it filed its session
 * under a module it never worked on. `placementRule` on the list says the rule in four sentences,
 * for the same reason `searched` says where the sweep looked.
 */

import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { LINK_TYPES, SESSION_STATES, type LinkType } from '@shared/types.ts'
import {
  ADAPTERS,
  defaultEnv,
  OBSERVED_SESSION_STATES,
  type AdapterEnv,
  type UnreadablePlace,
} from '../lib/adapters/index.ts'
import {
  DEFAULT_TAIL_LINES,
  MAX_TAIL_LINES,
  PLACEMENT_RULE,
  aSessionWithoutItsTranscript,
  aTailThisReaderMayNotRead,
  linkSession,
  migrateChangeSessions,
  noSessionToLinkHasThisId,
  readSessionTail,
  scopeSessionsToProject,
  sessionPlacement,
  sessionTimeline,
  sessionWork,
  sweepSessions,
  syncSessions,
  theMessagesASessionsRowsNameHiddenFrom,
  theSessionAnIdNames,
  theStartThisOfficeReadOfItsProcess,
  type PlacementReading,
  type SessionLinkResult,
  type SessionLogMigration,
  type SessionTail,
  type SessionView,
  type SessionWork,
  type SyncReport,
} from '../lib/sessions.ts'
import { bothEndsMustExist, getRecord, recordInWorkspace } from '../lib/records.ts'
import { nothingWrittenSentence } from '../lib/records/patching.ts'
import { PanelError } from '../lib/panel-error.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import {
  everyMessageHiddenFrom,
  refuseAMessageThisReaderMayNotRead,
  theMessageReader,
  theRunsWhoseTranscriptThisReaderMayRead,
  type AMessageReader,
} from '../lib/messages.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { route } from '../lib/route.ts'
import { addAStep, theFlowRunOf, theStepsActor, type FlowRunStep } from '../lib/flow-runs.ts'
import { FLOW_RUN_HOWS, FLOW_RUN_OUTCOMES } from '@shared/flow-run.ts'
import { nowStamp } from '@shared/time.ts'
import { sayOnce, type ARowSaidOnce, type SaidOnce } from '@shared/sessions-said-once.ts'
import { readEveryProcessFirst } from '../../config/session-process.mjs'

// ---------------------------------------------------------------------------- input shapes

const LINK_TYPE_NAMES = Object.keys(LINK_TYPES) as [LinkType, ...LinkType[]]

/** The documented default, matching api/links.ts: two things are related, without saying how. */
const DEFAULT_LINK_TYPE: LinkType = 'relates_to'

/**
 * THE POOL DOOR, so `GET /api` says what this route answers — it had no sentence at all before this
 * pass, in either shape.
 *
 * NARROWED WITH ?only=: "running" answers `counts` exactly as an unnarrowed call does — the tally is
 * cheap, a loop over rows already in memory, and costs nothing to keep whole — but `sessions` holds
 * only the rows in state "running", and none of them carries where it is filed. It was made for
 * Home's "Running now" band, which polled every 30 seconds and paid for 1,937 rows of prose and
 * placement every time to draw perhaps twenty of them (problem RcrvxsbgqWqr); Home no longer reads
 * sessions. The session hook is the caller now: its runs line keeps only running rows, and the whole
 * list arrived after its 3-second read under load (wave 13n's round 35). The hook reads
 * each row's `state` and `recordId` and nothing that is said once. An unnarrowed call keeps answering
 * everything, exactly as before.
 */
const SESSIONS_NOTE =
  'EVERY AGENT RUN this project can see: discovered on disk, filed as a record, or both. `counts` says how ' +
  'many are in each state; `sessions` is the rows themselves, with what is true of each right now and, ' +
  'unless narrowed away, which pipeline or module it is filed under. ' +
  '`notShownCount` counts conversations read from disk whose working folder did not resolve to this project; ' +
  'those rows are not in the answer. ' +
  'NARROWED WITH ?only=running: `counts` is unchanged — the full tally, every state — but `sessions` holds ' +
  'only the rows in state "running", and every row’s placement reads `{"kind":"unassigned","reason":' +
  '{"why":"not-asked-for"}, ...}` rather than saying where it is filed, because this narrowing does not ' +
  'read the change log to work that out. WHAT THE ROWS SAY ALIKE IS SAID ONCE: `saidOnce` holds the ' +
  '`placement`, the `stateReason` and the `itsProcess` most rows hold, and a row leaves any of them out when its value is ' +
  'that one. A row whose value differs carries its own. The tally is read the cheap way, from the end of each transcript ' +
  'and the process table, so a state decided near a boundary can read one state here and another to an ' +
  'unnarrowed call; the rows themselves are read in full, exactly as the unnarrowed call reads them. ' +
  'Ask unnarrowed for where a run is filed, for any other state, or for a tally you would argue with. ' +
  // The four sentences below were the whole of this door's older note in ROUTE_NOTES. That note and
  // this one both described the same route, which is prose nobody serves and nobody corrects, so the
  // older one was removed and everything only it said was moved here.
  'WHETHER A RUN IS ALIVE IS WORKED OUT ON THIS REQUEST, from the process table and how recently its ' +
  'log grew — never read from the database, because a stored answer to "is it running" is only ever ' +
  'right by accident. The reply also says where each adapter looked, so an empty list can be told ' +
  'apart from a sweep that searched the wrong home directory. WHERE A RUN BELONGS IS ANSWERED HERE: ' +
  'every row carries `placement` — the one pipeline or module the run is filed under, the evidence ' +
  'that put it there, everything else it reaches under `also`, and a sentence — and the reply carries ' +
  '`placementRule`, the rule itself in four sentences, and `placementRead`, what that rule had to read ' +
  'to answer. A run nothing places is unassigned WITH THE REASON on the row, which is an answer and ' +
  'not a gap, and with `howToPlace`: the copy-ready POST /api/sessions/:id/link that would file it. ' +
  "Nothing here reads a run's title — a link to a block files the run under the pipeline holding that block."

const whichSessions = z.strictObject({
  only: z.enum(['running']).optional(),
})

/** A row worth keeping when the caller asked `?only=running`. */
function isRunning(session: SessionView): boolean {
  return session.state === 'running'
}

const FLOW_RUN_NOTE =
  "One run's flow run: the flow it named and that flow's revision at the start, or the sentence saying it named none, " +
  'and each step with who did it, when, how and how it ended. The id is the run\'s record id. A run with no flow run ' +
  'answers null with the reason.'
const FLOW_RUN_STEP_NOTE =
  "Add one step to a run's flow run: {does, how, outcome, why?, startedAt?, endedAt?, actor?, n?, result?, evidence?}. " +
  'A step done by hand says why. Nobody has to use this door, and it refuses nothing of the run\'s own work.'

/** The sentence for a run with no flow run, the same at the read and at the step door. */
function noFlowRunSays(id: string): string {
  return (
    `Run ${id} has no flow run. The office files one beside every run it files since wave 1 of the office flow; a run ` +
    'filed before that has none, and a run whose flow run could not be written has an open problem about it saying why.'
  )
}

/** Refuse unless the id names a session record in this project. Another project's run is refused naming where it is. */
function theSessionRecordHere(id: string, workspaceId: string): void {
  const held = getRecord(id)
  if (held === null || held.kind !== 'session') {
    throw new PanelError(`No session record has the id ${id}. A flow run is read by the run's record id.`, 404)
  }
  recordInWorkspace(id, workspaceId)
}

const aStepBody = z.strictObject({
  does: z.string().trim().min(1, { error: 'does is what was done, one sentence' }),
  how: z.enum(FLOW_RUN_HOWS, { error: `how is one of: ${FLOW_RUN_HOWS.join(', ')}` }),
  why: z.string().trim().min(1, { error: 'why must not be empty — leave it out rather than sending spaces' }).optional(),
  outcome: z.enum(FLOW_RUN_OUTCOMES, { error: `outcome is one of: ${FLOW_RUN_OUTCOMES.join(', ')}` }),
  startedAt: z.string().trim().min(1).optional(),
  endedAt: z.string().trim().min(1).optional(),
  actor: z.strictObject({ kind: z.enum(['person', 'agent']), id: z.string().trim().min(1) }).optional(),
  n: z.number().int().positive().optional(),
  result: z.string().trim().min(1).optional(),
  evidence: z.string().trim().min(1).optional(),
})

const idParams = z.object({
  id: z.string().min(1, {
    error: 'the URL must contain a session id — GET /api/sessions lists them',
  }),
})

const tailQuery = z.strictObject({
  // Arrives as a string on a query string; coerced here rather than in the handler so the error
  // message names the field.
  lines: z
    .preprocess(
      (v) => (v === '' || v === undefined ? undefined : Number(v)),
      z
        .number({ error: 'lines must be a number' })
        .int({ error: 'lines must be a whole number' })
        .min(1, { error: 'lines must be at least 1' })
        .max(MAX_TAIL_LINES, {
          error:
            `lines must be at most ${MAX_TAIL_LINES}. A transcript on this machine reaches 13 MB, so an ` +
            `unbounded tail would be a response no page can draw and a read no server should do.`,
        }),
    )
    .optional(),
})

/**
 * The one thing a discovery sweep can be asked to hold back on: everything.
 *
 * A dry run writes nothing at all (problem kDKj9iXd4Vft). The sweep reads the disk and the records and answers, for
 * each conversation, what it would do and in which project; the change-log migration is worked out and none of it is
 * written. It used to hold back only the migration, and the sweep half filed records on a dry run.
 */
const discoverBody = z.strictObject({
  dryRun: z.boolean({ error: 'dryRun must be true or false' }).optional(),
})

/**
 * The far end of the link, named exactly one way.
 *
 * Deliberately the same shape and the same refusal as api/links.ts: a caller who has linked two
 * records already knows this body, and a second convention for the same idea is how two things
 * that should agree start to disagree. `fromId` is absent because the session in the URL is the
 * `from`.
 */
const linkBody = z
  .strictObject({
    toId: z.string().min(1, { error: 'toId must not be empty' }).optional(),
    toTitle: z.string().trim().min(1, { error: 'toTitle must not be empty' }).optional(),
    type: z
      .enum(LINK_TYPE_NAMES, { error: `type must be one of: ${LINK_TYPE_NAMES.join(', ')}` })
      .optional(),
  })
  .refine((b) => (b.toId === undefined) !== (b.toTitle === undefined), {
    error:
      'send exactly one of toId or toTitle: toId when you already know the id of the other record, toTitle when you are typing its name',
  })

// ---------------------------------------------------------------------------- what comes back

/** The list, and where it looked — so "no sessions" is an answer rather than a shrug. */
export interface SessionListReply {
  /** Whole rows, or, in a narrowed answer, rows that leave out what `saidOnce` says for them. */
  sessions: SessionView[] | ARowSaidOnce<SessionView>[]
  /**
   * Every place an adapter searched, in one line each.
   *
   * An empty list with no explanation is indistinguishable from a broken sweep. This says where
   * Mole Office looked, so a caller seeing nothing can tell "there are none" from "it searched the
   * wrong home directory".
   */
  searched: { tool: string; looksIn: string; reportsCleanExit: boolean }[]
  /**
   * How many sessions are in each state, so the interesting number is not something a caller has
   * to compute by walking the list.
   */
  counts: Record<string, number>
  /** Disk conversations whose working folder did not resolve to this project. No row is returned for them. */
  notShownCount: number
  /**
   * Places an adapter was refused, with the reason and the path. Empty when it read everything.
   *
   * Non-empty means `sessions` and `counts` are FLOORS. There may be sessions in these directories
   * and nothing here can see them, so a caller must not read "0 sessions" off this reply as "there
   * are none" — `warning` says the same thing in a sentence, and this is the machine-readable half
   * for a page that wants to list the paths or offer to fix them.
   */
  unreadable: UnreadablePlace[]
  /**
   * The rule that decides which pipeline or module each row's `placement` names.
   *
   * Served on the answer rather than described in a document, because the document is not what an
   * author has in front of them when they are looking at a run that landed nowhere. Same words on
   * every reply; `placementRead` beside it says what that rule had to read to answer.
   */
  placementRule: string
  /** Null exactly when `only` narrowed this reply away from working out where runs are filed. */
  placementRead: PlacementReading | null
  /** Which narrowing was asked for, echoed back. Absent means none — this is the whole pool. */
  only?: 'running'
  /**
   * In a narrowed answer, the `placement`, the `stateReason` and the `itsProcess` most rows hold, said
   * once. A row leaves any of them out when its value is this one (src/shared/sessions-said-once.ts).
   */
  saidOnce?: SaidOnce<SessionView>
  /**
   * Present only when the machine could not be inspected properly.
   *
   * Its absence means the process table was read AND every place an adapter looks was readable.
   * Its presence means some part of this answer is missing or unknowable for a reason that has
   * nothing to do with the sessions themselves, and a caller has to be told that rather than shown
   * a page of question marks or a confidently empty list.
   *
   * One string rather than a list because it is drawn as one line at the top of the page. When
   * both things are wrong, both sentences are here.
   */
  warning?: string
}

/**
 * The sentence for a sweep that could not read everything. Null when there is nothing to say.
 *
 * Written once and used by both session routes: the list, where it becomes the page's warning, and
 * the detail route, where a 404 has to admit that the session asked for might be sitting in a
 * directory nobody could open. A "no such session" that was really "I was not allowed to look" is
 * the same lie as an empty list, just aimed at one caller instead of the page.
 */
function warnAbout(places: readonly UnreadablePlace[]): string | null {
  if (places.length === 0) return null
  const listed = places.map((p) => `${p.path} (${p.reason})`).join('; ')
  return (
    `${places.length} place${places.length === 1 ? '' : 's'} Mole Office looks for sessions could not be read, ` +
    `so any count in this answer is a floor and not a total: ${listed}.`
  )
}

/** What one discovery sweep did, to the records and to the change log's session column. */
export interface DiscoverReply {
  report: SyncReport
  changeLog: SessionLogMigration
  note: string
  nothingWritten?: string
}

export interface SessionDetailReply {
  session: SessionView
  tail: SessionTail
  /**
   * What this session did to the database: the records it wrote, the ones it only touched, and
   * its change rows.
   *
   * Served here, on the session's own endpoint, rather than from a route of its own. "What did
   * this session do" is not a different subject from "what is this session" -- it is the same
   * page -- and the tail beside it is the same answer read from the other side: the transcript
   * says what it was doing, this says what came of it.
   *
   * Null when the session has no record. Nothing can have been written by a session Mole Office has
   * never filed, and an empty list would read as "it did nothing", which is a different claim.
   */
  work: SessionWork | null
  /**
   * The rule behind `session.placement`, in four sentences.
   *
   * Repeated from the list because this is the request an author makes about its OWN run — "where
   * did what I just wrote end up" — and making somebody fetch the whole list to find out what the
   * answer on this row means is the manoeuvre this pass exists to remove.
   */
  placementRule: string
  /**
   * When this office read the run's own process as starting, or null. Wave 13y round 35, item 9.8 (c).
   *
   * The run's page shows it only when the record holds no start time of its own. It is not null only when the record
   * names its process and the ledger read that same start time for that process, registered against this run
   * (`theStartThisOfficeReadOfItsProcess`). Null when the session has no record, when the only such row was withdrawn as
   * a mistake, and when the run's process mark says its process is not shown to be its own (wave 13y round 37).
   */
  startThisOfficeRead: string | null
}

// ---------------------------------------------------------------------------- routes

export interface SessionRouteOptions {
  /**
   * How to look at the machine, built fresh per request.
   *
   * Injectable for one reason that matters more than tidiness: the whole subject of these routes
   * is whether a process is alive and when a file last grew, and a test that ran against the real
   * machine would assert whatever happened to be running that afternoon. With the machine
   * described rather than sampled, `orphaned` and `crashed` are testable outcomes rather than
   * things that only ever happen in production.
   *
   * Per request, not once: `defaultEnv` freezes `now` and memoises the process table, which is
   * exactly right within one answer -- a list must not decide two sessions against two different
   * moments -- and exactly wrong across requests, where it would serve yesterday's clock.
   */
  env?: () => AdapterEnv
}

/**
 * Refuse, saying where the run is, when this id names a record in another project.
 *
 * BOTH ROUTES BELOW ALREADY REFUSED IT. They resolve an id through a sweep of THIS project's session
 * records, so a session record in another project was never found and the answer was 404 — the right
 * status. What they did not say is WHERE it is, and "no session with that id" sends a reader hunting
 * for a run that is right there. The fix is one header, and the refusal has to name it.
 *
 * A session is addressed either by its own `<tool>:<external id>` or by the id of its record. A run
 * on disk belongs to no project until somebody files it, so only the record form can be in another
 * project, and only the record form is checked here. `recordInWorkspace` is the one place this
 * refusal is worded; an id naming a record in THIS project passes through it and falls to the
 * route's own "no session with that id", which is then the true answer — the record is here and it
 * is not a run.
 */
function refuseIfTheRunIsInAnotherProject(id: string, workspaceId: string, reader: AMessageReader, noSession: () => PanelError): void {
  // A MESSAGE THIS READER MAY NOT READ is answered as an id naming no session is,
  // wherever it is filed, so the answer says neither that it is there nor where.
  refuseAMessageThisReaderMayNotRead(reader, id, noSession)
  if (getRecord(id) !== null) recordInWorkspace(id, workspaceId)
}

export const sessionRoutes: FastifyPluginAsync<SessionRouteOptions> = async (app, opts) => {
  const makeEnv = opts.env ?? (() => defaultEnv())

  /**
   * Every session Mole Office can see: discovered on disk, filed as a record, or both.
   *
   * The state of each one is derived on this request from what is observable now -- a live
   * process, when the log last grew, whether it ended on an error. Nothing about liveness is read
   * from the database, because a stored answer to "is it alive" is only ever right by accident.
   */
  app.get('/sessions', route('session.list', 'remote', SESSIONS_NOTE), async (req): Promise<SessionListReply> => {
    const env = makeEnv()
    const asked = parse(whichSessions, req.query, 'The narrowing asked for')
    // The placement reading is about THIS project's records, so the sweep has to be told which one:
    // it was measured answering `placement kind:'in'` under a pipeline in another project, with the
    // sentence "that word is this run's own statement that it belongs there" underneath it.
    //
    // PLACEMENT IS SKIPPED EXACTLY WHEN THE CALLER NARROWED THE REQUEST. Working out where every run
    // is filed means reading every record with no kind filter, every link and the whole change log —
    // the most expensive thing this file does — and a caller that only wants the running rows never
    // reads that field, so the sweep never does the work to fill it in.
    const workspaceId = workspaceOf(req)
    // ONE READING OF EVERY PROCESS answers the sweep's questions on Windows, by the way that waits, so none of them
    // holds the thread (tests/no-windows-process-reading-holds-the-servers-thread.test.ts, claim 8).
    const { sessions, unreadable, placement } = await readEveryProcessFirst(() =>
      sweepSessions(workspaceId, env, {
        placement: asked.only === undefined,
        only: asked.only,
      }),
    )
    const scoped = scopeSessionsToProject(sessions, workspaceId)

    // COUNTED OVER EVERY SESSION THE SWEEP FOUND, NEVER OVER A NARROWED SUBSET. `only=running` keeps
    // the rows below to the ones actually drawn, and the tally is what tells a caller how many more
    // there are without shipping a row for each — narrowing the answer would say "3 crashed" only
    // because the crashed rows were the ones left out, which is the opposite of what a tally is for.
    const counts: Record<string, number> = {}
    for (const state of OBSERVED_SESSION_STATES) counts[state] = 0
    for (const session of scoped.sessions) counts[session.state] = (counts[session.state] ?? 0) + 1

    // WHAT A ROW READ FROM A TRANSCRIPT, ONLY TO A READER WHO MAY READ IT.
    const rows = asked.only === 'running' ? scoped.sessions.filter(isRunning) : scoped.sessions
    const mayRead = theRunsWhoseTranscriptThisReaderMayRead(theMessageReader(actorFrom(req)), rows.map((one) => one.recordId), workspaceOf(req))
    const shown = rows.map((one) => (mayRead(one.recordId) ? one : aSessionWithoutItsTranscript(one)))
    // WHAT EVERY NARROWED ROW SAYS ALIKE IS SAID ONCE: its placement, which a narrowed answer never
    // works out, and the sentence every run filed by hand with no log shares. The unnarrowed answer
    // is unchanged, because its rows are where each run is filed and every reader of it reads that.
    const said = asked.only === undefined ? null : sayOnce(shown)
    const reply: SessionListReply = {
      sessions: said === null ? shown : said.rows,
      notShownCount: scoped.notShown.length,
      searched: ADAPTERS.map((a) => ({
        tool: a.tool,
        looksIn: a.looksIn(env),
        // Served rather than assumed: a caller wondering why nothing is ever `finished` gets the
        // answer here instead of concluding the endpoint is broken.
        reportsCleanExit: a.reportsCleanExit,
      })),
      counts,
      unreadable,
      placementRule: PLACEMENT_RULE,
      placementRead: placement,
      ...(asked.only === undefined || said === null ? {} : { only: asked.only, saidOnce: said.saidOnce }),
    }

    // Two different blindnesses, and a request can have both: the process table is what says
    // whether a session found on disk is alive, and a readable directory is what says the session
    // was found at all. Neither is allowed to come back as a confident answer.
    const warnings: string[] = []
    const scan = env.scanProcesses()
    if (!scan.ok) {
      warnings.push(
        `The processes on this machine could not be listed (${scan.reason}). Every session below is ` +
          `reported as "unknown" unless its log ended on an error: without a process table there is no way ` +
          `to tell a running session from a dead one, and guessing would be worse than saying so.`,
      )
    }
    const missed = warnAbout(unreadable)
    if (missed !== null) warnings.push(missed)
    if (warnings.length > 0) reply.warning = warnings.join(' ')

    return reply
  })

  /**
   * One session, plus the last lines of its own log.
   *
   * The tail is read from the tool's file at the moment of the request and is never stored, which
   * is the whole design: Mole Office knows where the conversation is, and does not keep a copy of it.
   * `?lines=N` asks for more or fewer.
   */
  app.get('/sessions/:id', route('session.list', 'remote'), async (req): Promise<SessionDetailReply> => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(idParams, req.params, 'The URL is not usable:')
    const q = parse(tailQuery, req.query, 'The query string is not usable:')

    const env = makeEnv()
    // ONLY THE RUN SHOWN IS READ (wave 13y round 136): the row the sweep gives first for the id, within the project's
    // scope, built from that run's own records and transcripts, with every place the search could not open, so a miss
    // can say whether it could read everywhere it looked (tests/the-detail-of-a-run-reads-only-that-run.test.ts).
    // ONLY THE RUN SHOWN IS PLACED, from its own links and writes (wave 13y round 109): the answer is the one the
    // reading of every run gives (tests/the-detail-of-a-run-places-only-that-run.test.ts).
    const { session: found, unreadable } = theSessionAnIdNames(id, workspaceId, env)
    const session = found === null ? null : { ...found, placement: sessionPlacement(found.id, found.recordId, workspaceId) }
    const reader = theMessageReader(actorFrom(req))
    if (session === null) {
      // A RUN THAT RAN OUTSIDE THIS PROJECT'S FOLDERS IS ANSWERED EXACTLY AS ONE NEVER FOUND (problem 8CGX4TA2Sgn4): a
      // different answer would itself say that something is there.
      const missed = warnAbout(unreadable)
      const noSession = (): PanelError =>
        new PanelError(
          `No session with id ${id}. GET /api/sessions lists every session Mole Office can see; the id to use ` +
            `here is either the session's own id ("<tool>:<session>") or the id of its record.` +
            // "Not found" would otherwise be a stronger claim than the search supports.
            (missed === null ? '' : ` This search was incomplete: ${missed}`),
          404,
        )
      refuseIfTheRunIsInAnotherProject(id, workspaceId, reader, noSession)
      throw noSession()
    }

    // THE TRANSCRIPT'S WORDS ONLY TO A READER WHO MAY READ THEM: the run's own
    // agent, a secretary and the owner. Anybody else gets no lines and the reason, and none of the words
    // the session's name, purpose and last line were read from.
    const mayRead = theRunsWhoseTranscriptThisReaderMayRead(reader, [session.recordId], workspaceId)(session.recordId)
    const itsRecord = session.recordId === null ? null : getRecord(session.recordId)
    return {
      session: mayRead ? session : aSessionWithoutItsTranscript(session),
      tail: mayRead
        ? readSessionTail(session, q.lines ?? DEFAULT_TAIL_LINES)
        : aTailThisReaderMayNotRead(session, q.lines ?? DEFAULT_TAIL_LINES),
      // Asked for by record id, never by the session's own `<tool>:<id>`: the change log joins to
      // records, and a session with no record has written nothing by definition.
      // NO MESSAGE THE CALLER MAY NOT READ is in what the run wrote or touched.
      // The rule is asked only of the messages the run's change rows name.
      work:
        session.recordId === null
          ? null
          : sessionWork(session.recordId, workspaceId, 200, theMessagesASessionsRowsNameHiddenFrom(reader, session.recordId, workspaceId)),
      placementRule: PLACEMENT_RULE,
      startThisOfficeRead: itsRecord === null ? null : theStartThisOfficeReadOfItsProcess(itsRecord, session.itsProcess),
    }
  })

  /**
   * ONE RUN'S CALLS, IN TIME ORDER, WITH ITS POLLS FOLDED.
   *
   * The office records every flow operation itself, one row per request in `api_calls`. This reads
   * one run's rows back, folds the polls, and puts the change log's
   * rows for the same run beside them.
   */
  app.get('/sessions/:id/timeline', route('session.timeline', 'remote'), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(idParams, req.params, 'The URL is not usable:')
    // NO CALL AIMED AT A MESSAGE THE CALLER MAY NOT READ, and no change row naming one.
    return sessionTimeline(id, workspaceId, everyMessageHiddenFrom(theMessageReader(actorFrom(req)), workspaceId))
  })

  /**
   * ONE RUN'S FLOW RUN, READ BY THE RUN'S RECORD ID. Wave 1 of the office flow, M1. One record by id, never a
   * list. A run with no flow run is answered with null and the sentence saying why that can be, never with an
   * empty record or somebody else's.
   */
  app.get('/sessions/:id/flow-run', route('session.flow-run', 'remote', FLOW_RUN_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(idParams, req.params, 'The URL is not usable:')
    theSessionRecordHere(id, workspaceId)
    const held = theFlowRunOf(id)
    if (held === null) return { run: id, flowRun: null, says: noFlowRunSays(id), workspaceId }
    return { run: id, flowRun: getRecord(held.id), workspaceId }
  })

  /**
   * A STEP OF A RUN'S FLOW, RECORDED BY WHOEVER DID IT OR SAW IT DONE. Wave 1 of the office flow, M1, the ask:
   * the steps done by hand between a round and its landing. NOBODY HAS TO USE THIS DOOR. Its one rule is the step's
   * shape: a step done by hand says why. It refuses nothing of the run's own work.
   */
  app.post('/sessions/:id/flow-run/steps', route('session.flow-run-step', 'remote', FLOW_RUN_STEP_NOTE), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const actor = actorFrom(req)
    const { id } = parse(idParams, req.params, 'The URL is not usable:')
    const body = parse(aStepBody, req.body, 'The step:')
    theSessionRecordHere(id, workspaceId)
    const who = theStepsActor(body.actor, actor)
    const step: FlowRunStep = {
      ...(body.n === undefined ? {} : { n: body.n }),
      does: body.does,
      ...(who === undefined ? {} : { actor: who }),
      startedAt: body.startedAt ?? nowStamp(),
      ...(body.endedAt === undefined ? {} : { endedAt: body.endedAt }),
      how: body.how,
      ...(body.why === undefined ? {} : { why: body.why }),
      outcome: body.outcome,
      ...(body.result === undefined ? {} : { result: body.result }),
      ...(body.evidence === undefined ? {} : { evidence: body.evidence }),
    }
    const added = addAStep(id, step, actor)
    if (added === null) throw new PanelError(`${noFlowRunSays(id)} So there is nothing to add a step to. Nothing was written.`, 409)
    reply.status(201)
    return {
      run: id,
      flowRun: added.flowRun,
      position: added.position,
      step,
      // WHAT THE OFFICE MADE OF WHAT WAS SENT, said back: who it recorded as doing the step, and when it started.
      says:
        `Step ${String(added.position)} of flow run ${added.flowRun} recorded: ${step.does} ` +
        `Done ${step.how}, by ${who === undefined ? 'nobody recorded who' : `the ${who.kind} ${who.id}`}` +
        `${body.actor === undefined && who !== undefined ? ' (the caller, since the step named nobody)' : ''}, ` +
        `started ${step.startedAt}${body.startedAt === undefined ? ' (the moment it was recorded, since the step named none)' : ''}.`,
      workspaceId,
    }
  })

  /**
   * File what is on disk as records, so sessions can be linked like everything else.
   *
   * Idempotent in what it OBSERVES: run it twice and the second run computes the same values, so
   * nothing about a session moves and `updated` is 0. It is not idempotent in what it WRITES --
   * the discovery stamp carries the moment it was taken, so every session it saw is written to
   * again. `report.stampOnly` is that number and the note says it out loud; this used to claim
   * "the second run writes nothing", which was false on every second run there has ever been.
   * It never touches a title, a summary or a link -- see the contract at the top of lib/sessions.ts.
   */
  app.post('/sessions/discover', route('session.discover', 'local', {
    because: 'acts-on-this-machine',
    act: "Filing the sessions on this computer's disk as records",
  }), async (req): Promise<DiscoverReply> => {
    const actor = actorFrom(req)
    const body = parse(discoverBody, req.body ?? {}, 'The request body is not usable:')
    const workspaceId = workspaceOf(req)
    let wrote = false
    const onWrite = () => { wrote = true }
    const report = syncSessions(actor, workspaceId, makeEnv(), undefined, { dryRun: body.dryRun === true, onWrite })
    const missed = warnAbout(report.unreadable)
    // Reconciling the change log's session column happens here, in the same request, for the same
    // reason the records are reconciled here: this is the endpoint that makes the registry agree
    // with reality, and a session that has just been filed is exactly when its earlier rows can
    // stop pointing at a name. It is reported in full, and on `{"dryRun":true}` neither half writes anything.
    const changeLog = migrateChangeSessions(actor, workspaceId, { apply: !body.dryRun, onWrite })
    return {
      report,
      changeLog,
      ...(!body.dryRun && !wrote ? { nothingWritten: nothingWrittenSentence({ kind: 'already-stored' }) } : {}),
      note:
        (report.dryRun
          ? `A dry run: nothing was written. ${report.discovered} session${report.discovered === 1 ? '' : 's'} on ` +
            `disk: ${String(report.where.filter((one) => one.action === 'filed').length)} would be filed, each into ` +
            `the project its working directory matches; ` +
            `${String(report.where.filter((one) => one.action === 'observed').length)} already have a record, where ` +
            `it is; ${String(report.where.filter((one) => one.action === 'not filed').length)} would not be filed, ` +
            `because no one project holds its working directory or none was read from its log. \`report.where\` says which, where and why`
          : `${report.discovered} session${report.discovered === 1 ? '' : 's'} on disk: ` +
            `${report.created} newly filed, each into the project its working directory matches, ` +
            `${report.updated} updated, ${report.unchanged} already current` +
            (report.where.some((one) => one.action === 'not filed')
              ? `, ${String(report.where.filter((one) => one.action === 'not filed').length)} not filed, because no single ` +
                `project holds its working directory or none was read from its log`
              : '')) +
        // "Already current" is about the session and says nothing about whether a row was written,
        // and the two used to be reported as one. A sweep that moved nothing still writes to every
        // record it saw, because the stamp it writes carries the time it was taken.
        (report.stampOnly > 0
          ? `. ${report.stampOnly} of the already-current ${report.stampOnly === 1 ? 'record was' : 'records were'} ` +
            `still written to, only to renew the discovery stamp, so the record edit time moved and the ` +
            `session did not.`
          : '') +
        // Unreachable today, and left in on purpose: every state an adapter can observe is one a
        // record may store, so this counter is zero on every sweep. It used to name "orphaned"
        // and "unknown" as the two that could not be stored, which stopped being true when the
        // vocabulary grew to six and left a sentence here describing a rule that no longer
        // existed. The list is read off SESSION_STATES now, so if an observer-only state is ever
        // added this says the right thing without being edited.
        (report.stateNotStorable > 0
          ? `. ${report.stateNotStorable} could not have a state stored: what was observed of them is not ` +
            `a word a session record may hold, and a record holds one of ${SESSION_STATES.join(', ')}. Their ` +
            `\`state\` was left empty rather than guessed, so they read as incomplete — the real answer ` +
            `is on each record at data.extra.discovered.observedState.`
          : '') +
        // The sweep files what it can see. When it could not see everywhere, the counts above are
        // a floor, and a caller reading "0 newly filed" has to know which of the two happened.
        (missed === null ? '' : `. ${missed}`) +
        ` Change log: ${changeLog.note}` +
        // A DRY RUN WROTE NOTHING, and the change-log half says so in its own note above.
        '',
    }
  })

  /**
   * Link a session to a record it worked on.
   *
   * A session that has been seen but never filed is filed by this call rather than refused, and
   * the answer says so in `createdSessionRecord` and in one sentence in `note`. Refusing would
   * hand back an id GET /api/sessions had just given the caller and tell them it was not real.
   *
   * The reply carries `placement` — where the run stands now that this link exists. It is here
   * because the association a caller makes and the group the run appears in were two different
   * questions with one cheerful `201` between them: a link to a block was answered "now relates
   * to …" and placed the run nowhere at all.
   */
  app.post('/sessions/:id/link', route('session.link', 'remote'), async (req, reply): Promise<SessionLinkResult> => {
    const actor = actorFrom(req)
    const { id } = parse(idParams, req.params, 'The URL is not usable:')
    const body = parse(linkBody, req.body, 'The request body is not usable:')
    // NEITHER END MAY BE A MESSAGE THE CALLER MAY NOT READ: the answer quotes the
    // far end's title. Such a message is answered as a record that is not there, at either end.
    const reader = theMessageReader(actor)
    refuseIfTheRunIsInAnotherProject(id, workspaceOf(req), reader, () => noSessionToLinkHasThisId(id))
    if (body.toId !== undefined) refuseAMessageThisReaderMayNotRead(reader, body.toId, bothEndsMustExist)

    reply.status(201)
    return linkSession(
      id,
      { toId: body.toId, toTitle: body.toTitle, type: body.type ?? DEFAULT_LINK_TYPE },
      actor,
      workspaceOf(req),
      makeEnv(),
      reader,
    )
  })
}
