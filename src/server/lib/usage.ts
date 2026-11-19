// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT EACH CALL WAS, MEASURED BY THE SERVER THAT ANSWERED IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * `api_calls`, `outside_reads`, `usage_stretches` and `usage_checks` were created by a migration on
 * 25 August 2026 and NOTHING HAS EVER WRITTEN A ROW INTO ANY OF THEM. Every question this campaign
 * asks about how agents read the project — how long a recovery takes, what agents keep asking for,
 * what they go outside Mole Office for — is a query over four empty tables until this hook runs. So this
 * is the precondition for the surface, not a refinement of it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A HOOK AND NOT A LINE IN EACH HANDLER
 * ---------------------------------------------------------------------------------------
 *
 * `actorFrom` has 64 call sites and `workspaceOf` has 92, every one inside a handler. Recording
 * from inside handlers would be 156 edits and a standing obligation on every route anybody adds
 * afterwards, which is an obligation that fails silently the first time somebody forgets. One hook
 * is one edit and cannot be forgotten.
 *
 * ---------------------------------------------------------------------------------------
 * THE FOUR RULES THIS FILE MAY NOT BREAK
 * ---------------------------------------------------------------------------------------
 *
 * 1. IT CHANGES NOTHING ABOUT WHAT THE PRODUCT ANSWERS. Same status, same body, same headers but
 *    one. It refuses nothing, it resolves nothing a second time, and it never calls `actorFrom` —
 *    a GET carrying a half-made identity claim is answered today and must go on being answered.
 * 2. IT COSTS THE CALLER NOTHING. The insert is on `onResponse`, which fires after the reply has
 *    been sent, so it cannot add a millisecond to what anybody waited for.
 * 3. IT DOES NOT FEED ITSELF. A read of the usage family writes no row. Without that rule the
 *    largest operation in the telemetry would, within a day, be reading the telemetry.
 * 4. A FAILED INSERT DOES NOT TAKE THE PRODUCT DOWN, AND IS NOT SILENT. It is counted, and the
 *    count is published on `GET /api/health` and on the usage summary.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS DELIBERATELY NOT STORED
 * ---------------------------------------------------------------------------------------
 *
 * No URL query string — the route PATTERN and nothing else, so `GET /api/search?q=…` stores
 * `/api/search`. No request body, no response body, no headers other than the ones Mole Office already
 * reads, and no record content: `target_id` is a reference and whatever it names is looked up at
 * read time from wherever it is canonical.
 *
 * BOTH HALVES OF THAT ARE HELD AS ASSERTIONS OVER A REAL ROW RATHER THAN AS THIS PARAGRAPH, and
 * they are held in `tests/usage-hook.test.ts` — "stores the route pattern and never the query
 * string" for the first, and "keeps a shell command whole" in `tests/usage-outside.test.ts` for the
 * rule that this table's `?` and `&` ban is NOT the outside-read table's. This used to cite
 * `tests/usage-privacy.test.ts`, which has never existed in this tree. A citation naming a file
 * nobody can open is worse than none: a reader goes looking, finds nothing, and concludes the rule
 * is unheld.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { anOfficeId } from './ids.ts'
import { operationNamed } from '@shared/ops.ts'
import { localStamp } from '@shared/time.ts'
import { db, sqlite } from '../db/client.ts'
import { apiCalls } from '../db/schema.ts'
import {
  observedIdentity,
  observedTrace,
  resolvedActorOf,
  resolvedWorkspaceOf,
} from './http.ts'
import { arrivalOf } from '@shared/arrival-of.ts'
import { callerAddressOf } from './caller-address-of.ts'
import { howThisRequestProvedItself } from './keys.ts'
import { CALL_ID_HEADER } from '../../config/call-header.mjs'

/**
 * The response header that hands a caller the id of the row its own request produced.
 *
 * Re-exported rather than declared: the name lives in `src/config/call-header.mjs`, which can be
 * read without opening the database. This file cannot, and the cors registration and a test both
 * want only the name. The file itself says what that cost.
 */
export { CALL_ID_HEADER }

/**
 * WHAT THIS PROCESS HAS FAILED TO WRITE, AND HOW MANY TRACE HEADERS IT COULD NOT READ.
 *
 * Two counters, in process, published rather than logged and forgotten. Losing a telemetry row is
 * honestly handleable; taking the product down over one is not; and pretending it did not happen is
 * the third option, which is the one this repository keeps taking by accident.
 */
const counters = { writesFailed: 0, traceHeaderIgnored: 0 }

/** What the recorder has failed at since this process started. Read by health and by the summary. */
export function usageCounters(): { writesFailed: number; traceHeaderIgnored: number } {
  return { ...counters }
}

/** Whether anything is recording in this process at all — which is not the same as "no rows yet". */
let recording = false

/**
 * IS THE RECORDER ON?
 *
 * "No rows" and "not recording" are different facts, and a surface that could not tell them apart
 * would draw an empty page as evidence that nothing happened. The usage summary publishes this and
 * the page says so in Developer mode.
 */
export function isRecording(): boolean {
  return recording
}

/** What one request worked out about itself before its row could be written. */
interface UsageState {
  id: string
  trace: string | null
  purpose: string | null
  listLen: number | null
  bytes: number | null
  /**
   * WHETHER THIS ONE REQUEST WAS ACTUALLY HELD OPEN. Set by a handler that really waited, through
   * `thisCallIsHeld` below, and never inferred from the route. The waiting door answers at once
   * when it is not asked to hold, and declaring `waits` on the route would take the instant answers
   * out of the handle.waiting median along with the holds (criterion U7). The route declaration is
   * still read as well, for a route whose every request is held open, like the event stream.
   */
  held: boolean
}

const USAGE = Symbol.for('mole-office.usage')

function usageOn(req: FastifyRequest): UsageState | undefined {
  return (req as Partial<Record<typeof USAGE, UsageState>>)[USAGE]
}

/**
 * THE ID OF THE ROW THIS REQUEST WILL PRODUCE, for a handler that needs to point at it.
 *
 * The recorder mints the id in `onRequest`, so it exists long before the row is written. A handler
 * cannot read it off the reply — the header is set in `onSend`, which runs after the handler has
 * returned — and that is the mistake this function exists to stop somebody making twice.
 *
 * NULL WHEN NOTHING IS RECORDING, and null is stored as null. A handler that invented an id here
 * would write a key pointing at a row that will never exist.
 */
export function callIdOf(req: FastifyRequest): string | null {
  return usageOn(req)?.id ?? null
}

/**
 * MARK THIS ONE REQUEST AS A LONG POLL, for a handler that really held the answer open.
 *
 * WHY A PER-REQUEST MARK AND NOT ONLY THE ROUTE. `GET /api/handles/:handle/waiting` answers at
 * once unless the caller asks it to hold, and it must: the local bridges that poll it every three
 * seconds send no parameter yet and rely on the instant answer. Declaring `waits` on the route
 * would mark those instant answers too, and `usage-reads.ts` drops every `waits = 1` row from every
 * latency figure. So the handler calls this only on the requests it actually held.
 *
 * IT MARKS NOTHING TODAY, AND THAT IS SAID HERE RATHER THAN LEFT TO BE DISCOVERED. Criterion U6
 * made `handle.waiting` counted by the hour, so the insert this mark was written for is never
 * reached for that door and there is no row to carry the mark. It is kept because it is the right
 * shape for the next route that holds only some of its requests open, and because deleting it
 * would be a change to how the waiting door is measured rather than a tidy-up. The one operation
 * that still declares `waits` on its route is `events.stream`, which hijacks its reply and writes
 * no row either — so no row in `api_calls` carries `waits = 1` today, and the latency filter that
 * drops them has nothing to drop.
 *
 * IT DOES NOTHING WHEN NOTHING IS RECORDING, and that is honest: there is no row to mark.
 */
export function thisCallIsHeld(req: FastifyRequest): void {
  const state = usageOn(req)
  if (state !== undefined) state.held = true
}

/**
 * WHETHER THIS REQUEST WAS A WAIT SOMEBODY CHOSE, which is not the same as slow: its route declares `waits` for every
 * request, like the event stream, or the waiting door marked this one call held. One predicate for its two readers, the
 * usage row's `waits` and the request log's slow line (acceptance finding 67). The inspector's release of the request
 * line noted it was worked out in both files, where a third shape of hold added to one would leave the other wrong with
 * nothing failing (invariant 9). A held call reads false while nothing is recording, because then nothing was marked.
 */
export function thisRequestWasAChosenWait(req: FastifyRequest): boolean {
  return usageOn(req)?.held === true || (req.routeOptions?.config as { waits?: unknown } | undefined)?.waits === true
}

/**
 * THE LONGEST ARRAY SITTING DIRECTLY ON A REPLY, or the reply's own length when it is an array.
 *
 * A STATED RULE RATHER THAN AN INTERPRETATION OF THE REPLY. It separates "this read returned
 * nothing" from "this read returned four hundred things", which is the difference between a context
 * read that is working and one that is quietly costing a caller its whole budget.
 *
 * Null when the reply holds no array at all, which is honest absence: `GET /api/health` returns four
 * fields and none of them is a list, and a 0 there would read as a list that came back empty.
 */
export function listLengthOf(payload: unknown): number | null {
  if (Array.isArray(payload)) return payload.length
  if (typeof payload !== 'object' || payload === null) return null
  let longest: number | null = null
  for (const value of Object.values(payload as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue
    if (longest === null || value.length > longest) longest = value.length
  }
  return longest
}

/**
 * THE ROUTE'S OUTER PATH PARAMETER, which is the one thing the route named.
 *
 * A reference and nothing else. The outer one — `:id` on `/api/records/:id/revisions/:rev` — because
 * that is the subject of the request and the rest is a part of it.
 */
export function targetIdOf(params: unknown): string | null {
  if (typeof params !== 'object' || params === null) return null
  const bag = params as Record<string, unknown>
  // `*` is the wildcard Fastify fills in for a request that matched no route. It is a path, not an
  // id, and storing it would put a URL in the column that exists to hold references.
  const first = Object.keys(bag).find((key) => key !== '*')
  if (first === undefined) return null
  const value = bag[first]
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * WHETHER THIS CALL IS THE TELEMETRY READING ITSELF.
 *
 * The stop is one rule: an operation beginning `usage.` whose effect is `read` writes no row. It is
 * NOT the whole `usage` family — `usage.report-outside` is a write an agent performs, it is part of
 * the evidence, and exempting it was the first version's mistake. `tests/usage-hook.test.ts` holds
 * both halves, because a rule that exempts too much and a rule that exempts too little look the same
 * from outside.
 */
export function skipsRecording(operation: string | null): boolean {
  if (operation === null || !operation.startsWith('usage.')) return false
  return operationNamed(operation)?.effect === 'read'
}

/** The operation a route declared, read off the request Fastify already routed. */
function operationOf(req: FastifyRequest): string | null {
  const config = req.routeOptions?.config as { operation?: unknown } | undefined
  const declared = config?.operation
  return typeof declared === 'string' ? declared : null
}

/**
 * INSTALL THE RECORDER. Four hooks, each doing the one thing only it can see.
 *
 * INSTALL IT BEFORE THE ROUTE GROUPS. A hook registered after a route group does not run for that
 * group's routes, and it fails silently: those routes go on answering with nobody counting them.
 */
export function recordCalls(app: FastifyInstance): void {
  recording = true

  /**
   * MINT AND START.
   *
   * The very first thing done is to put the state on the request, before a header is read, so a
   * request refused three lines later still writes a row. A refused call is exactly the evidence
   * this table exists to carry.
   *
   * A request that is not `/api` is not an API call — in production the browser app is served from
   * the same process. A `HEAD` IS recorded, under the `GET`'s operation, because Fastify hands it
   * the same route options.
   *
   * THERE IS NO `OPTIONS` GUARD HERE, AND THAT IS MEASURED RATHER THAN ASSUMED. A preflight is not
   * a request anybody decided to make, so it should write no row — and it writes none without a
   * guard, because `@fastify/cors` is registered above this hook and answers a preflight inside its
   * own `onRequest`, which ends the request before this one runs. Probed on 26 August 2026 in this
   * repository: a real preflight answers 204 and a bare `OPTIONS` answers 400, and with the guard
   * present and with it absent both wrote zero rows. A guard nothing can reach is a line that looks
   * like a rule and is not one, so it is gone and this paragraph is what a reader gets instead.
   * `tests/usage-hook.test.ts` holds the claim, and installing this recorder above the CORS plugin
   * is the mutation that turns it red.
   */
  app.addHook('onRequest', async (req: FastifyRequest) => {
    if (!req.url.startsWith('/api')) return
    const seen = observedTrace(req)
    if (seen.ignored) counters.traceHeaderIgnored += 1
    const state: UsageState = {
      id: anOfficeId(),
      trace: seen.trace,
      purpose: seen.purpose,
      listLen: null,
      bytes: null,
      held: false,
    }
    const holder = req as unknown as Record<typeof USAGE, UsageState>
    holder[USAGE] = state
  })

  /**
   * MEASURE THE LIST, while the reply is still an object.
   *
   * It does not fire for a payload that is already a string, a stream or a buffer — which is exactly
   * the case where the length of a list in it is honestly unknown, so `list_len` stays null there
   * rather than becoming a 0 that reads as an empty answer.
   */
  app.addHook('preSerialization', async (req: FastifyRequest, _reply: FastifyReply, payload: unknown) => {
    const state = usageOn(req)
    if (state !== undefined) state.listLen = listLengthOf(payload)
    return payload
  })

  /**
   * MEASURE THE PAYLOAD, and hand the caller the id of its own row.
   *
   * `onResponse` cannot see the payload, so the size is taken here. The header is what lets an agent
   * name the row its own request produced — which is how an outside-read report joins to the call
   * that filed it instead of stamping a second copy of the same facts.
   */
  app.addHook('onSend', async (req: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    const state = usageOn(req)
    if (state === undefined) return payload
    if (typeof payload === 'string') state.bytes = Buffer.byteLength(payload)
    else if (Buffer.isBuffer(payload)) state.bytes = payload.length
    reply.header(CALL_ID_HEADER, state.id)
    return payload
  })

  /**
   * WRITE THE ROW, after the caller has been answered.
   *
   * For a request that matched no route the pattern, the operation and the effect are all null, and
   * that is the honest answer rather than a gap: agents calling routes that do not exist is exactly
   * the evidence this table was asked for.
   */
  app.addHook('onResponse', async (req: FastifyRequest, reply: FastifyReply) => {
    const state = usageOn(req)
    if (state === undefined) return
    const operation = operationOf(req)
    if (skipsRecording(operation)) return
    const before = rowsChanged()
    try {
      writeCall(req, reply, state, operation)
    } catch (err) {
      // INVARIANT 4 READ CAREFULLY: catch only what you can honestly handle, and say what you did.
      // A lost telemetry row is handleable. A product that stops serving because a count failed is
      // not. The count is published, so the loss is a number somebody can read.
      counters.writesFailed += 1
      req.log?.error?.({ err, operation }, 'mole-office: a usage row was not written')
    } finally {
      rowsTheRequestLogChanged += rowsChanged() - before
    }
  })
}

/** Every row this connection has changed since it opened, triggers included: SQLite's own count. */
function rowsChanged(): number {
  return (sqlite.prepare('SELECT total_changes() AS rows').get() as { rows: number }).rows
}

/**
 * HOW MANY ROWS THE REQUEST LOG ITSELF HAS CHANGED, so a reader of `total_changes()` can leave them out. Every request
 * writes its own row here, the comments read's included, so without this nothing would ever read as unchanged
 * (lib/comments-answer.ts). Counted around the whole write, so its folds and summaries are counted too.
 */
let rowsTheRequestLogChanged = 0
export function rowsWrittenByTheRequestLog(): number {
  return rowsTheRequestLogChanged
}

/** The one insert, kept apart from the hook so the failure path above has one thing to wrap. */
function writeCall(req: FastifyRequest, reply: FastifyReply, state: UsageState, operation: string | null): void {
  const entry = operation === null ? undefined : operationNamed(operation)
  const actor = resolvedActorOf(req)
  const workspace = resolvedWorkspaceOf(req)
  // WHAT THE CALLER SAID, when nothing on this request's path asked who it was. `identity_source`
  // is what keeps the two apart, and FOUR VALUES BECAUSE THREE WOULD LIE: an analysis that mixed a
  // verified identity with an unverified one would do it silently, and since P83 a caller that held
  // a key has PROVED itself while one that only sent headers has not.
  const said = observedIdentity(req)
  /**
   * WHETHER THIS REQUEST HELD A KEY, even on a read no handler asked about. A write's actor already
   * carries the answer; a read resolves no actor, so the same one reading of a key is asked here.
   */
  const proof = howThisRequestProvedItself(req)
  const keyed = actor?.provedBy ?? proof?.how
  const identitySource = keyed !== undefined ? 'key' : actor !== undefined ? 'checked' : said.any ? 'header' : 'none'
  const arrival = arrivalOf(req)
  // The person's tool proof is never attributed as a person or agent, even if its headers claim one.
  // Two decisions, and report H-forI_Vk5H7, change an
  // earlier decision.
  const actorType = keyed === 'his-tool-key' ? 'tool' : actor?.type ?? said.actorType
  const actorId = keyed === 'his-tool-key' ? proof?.whoseId ?? null : actor?.id ?? said.actorId
  const clientAddr = callerAddressOf(req)
  const clientOrigin = arrival === undefined ? null : arrival === 'another machine' ? 'remote' : 'local'
  const atMs = Date.now()
  /**
   * COUNTED BY THE HOUR, OR STORED ONE ROW EACH. This is the ONE place the operation's declaration
   * is read. Under criterion U6 and a decision, a repeated long-poll hold becomes one small
   * row here per hour, per listener and per operation instead of a row per request. Every other
   * operation, and every request that matched no route, still writes exactly the row it always did.
   *
   * THE DECLARATION IS ON THE OPERATION (src/shared/ops.ts) AND NOT A LIST HERE. A second list in
   * this file would be the same fact written down twice, and the two would drift.
   *
   * ONLY THE CALLS THAT ANSWERED ARE FOLDED. A refused or failed call at one of these operations is
   * stored one row each like any other call, because a refused hold is not a hold: it is the
   * evidence a person needs, and the Usage page's refusal list is drawn from stored rows. So the
   * count that comes back for a folded operation is a count of the calls it answered, and the
   * refusals beside it are real rows with their status, their time and their trace. the secretary ruled
   * this on 13 September 2026, inside a decision.
   */
  const itAnswered = reply.statusCode >= 200 && reply.statusCode < 300
  if (entry?.countedByTheHour === true && operation !== null && itAnswered) {
    foldACountedCall({ atMs, operation, workspaceId: workspace?.id ?? null, listener: actorId })
  } else {
    db.insert(apiCalls)
      .values({
        id: state.id,
        atMs,
        operation,
        effect: entry?.effect ?? null,
        // THE PATTERN, NEVER THE URL. `/api/records/:id`, not `/api/records/abc?with=everything`.
        route: req.routeOptions?.url ?? null,
        method: req.method,
        // A poll that waits four minutes for a message is not a slow endpoint. `state.held` is the
        // per-request mark the waiting door sets only on the requests it really held. Since criterion
        // U6 that door's operation is counted by the hour, so this insert is never reached for it and
        // the mark has no row to sit on; the mark and the route's own `waits` are kept for a route
        // every one of whose requests is held open, like the event stream.
        waits: thisRequestWasAChosenWait(req) ? 1 : 0,
        status: reply.statusCode,
        ms: reply.elapsedTime,
        bytes: state.bytes,
        listLen: state.listLen,
        workspaceId: workspace?.id ?? null,
        workspaceStated: workspace === undefined ? null : workspace.stated ? 1 : 0,
        actorType,
        actorId,
        sessionId: actor?.sessionId ?? said.sessionId,
        identitySource,
        traceId: state.trace,
        purpose: state.purpose,
        targetId: targetIdOf(req.params),
        // THE ROUTE DECLARES NO TARGET KIND TODAY, so this is null and says so by being null. A kind
        // guessed from the path would be a claim in a column built for measurements; the declaration
        // is `route()`'s to grow and this column is ready for it.
        targetKind: null,
        clientAddr,
        // FROM THE ARRIVAL AND NOT FROM THE ADDRESS. Under the settled remote arrangement a call from
        // the owner's other machine comes through a proxy on a second loopback listener, so its
        // address reads 127.0.0.1 — a rule reading the address would file it as local for ever with
        // nothing failing. An in-process caller has no arrival, so this is null, which is read as
        // "recorded before Mole Office could tell" and never as local.
        clientOrigin,
      })
      .run()
  }
  /**
   * AND A CLAIM WITH NO KEY GOES ON THE SUMMARY THE SETTINGS LIST READS. Criterion P83, point 6.
   *
   * ONE SMALL ROW PER CALLER PER DAY, and not a group-by over `api_calls`: that table is 4.43
   * million rows and 88 per cent of the owner's database (problem a78qfu2K4C4_) with no index on
   * `actor_id`, so the very page the person reads before the window closes would be slow to draw. A caller
   * that held a key is not on this list; one that only claimed an identity is.
   *
   * A CALL FOLDED BY THE HOUR STILL WRITES THIS ROW. The fold above is about the request log; this
   * summary is about which callers claimed an identity without a key, and a folded call is still
   * such a call. Skipping it would quietly shrink the Settings list that criterion P83 built.
   */
  if (said.any && keyed === undefined) {
    foldAHeaderOnlyCall({
      atMs: Date.now(),
      actorType,
      actorId,
      clientAddr,
      clientOrigin,
    })
  }
}

/** One counted call, folded into its listener's row for the hour. Criterion U6. */
function foldACountedCall(call: {
  atMs: number
  operation: string
  workspaceId: string | null
  listener: string | null
}): void {
  const hour = localStamp(new Date(call.atMs)).slice(0, 13)
  // THE EMPTY STRING STANDS FOR A LISTENER OR A PROJECT NOBODY COULD READ, because SQLite treats
  // NULLs as distinct in a unique index and the upsert would make a second row for every request
  // with none. The same rule `foldAHeaderOnlyCall` below states for an address.
  sqlite
    .prepare(
      'INSERT INTO hourly_calls (id, hour, operation, workspace_id, listener, calls) ' +
        'VALUES (?, ?, ?, ?, ?, 1) ' +
        'ON CONFLICT(hour, operation, workspace_id, listener) ' +
        'DO UPDATE SET calls = calls + 1',
    )
    .run(anOfficeId(), hour, call.operation, call.workspaceId ?? '', call.listener ?? '')
}

/** One header-only call, folded into its caller's row for the day. */
function foldAHeaderOnlyCall(call: {
  atMs: number
  actorType: string | null
  actorId: string | null
  clientAddr: string | null
  clientOrigin: string | null
}): void {
  const day = localStamp(new Date(call.atMs)).slice(0, 10)
  // THE EMPTY STRING STANDS FOR AN ADDRESS OR AN ORIGIN NOBODY COULD READ, because SQLite treats
  // NULLs as distinct in a unique index and a second row per request is not a summary.
  sqlite
    .prepare(
      'INSERT INTO header_only_calls (id, day, actor_type, actor_id, client_addr, client_origin, first_seen, last_seen, calls) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1) ' +
        'ON CONFLICT(day, actor_type, actor_id, client_addr, client_origin) ' +
        'DO UPDATE SET last_seen = excluded.last_seen, calls = calls + 1',
    )
    .run(
      anOfficeId(),
      day,
      call.actorType ?? '',
      call.actorId ?? '',
      call.clientAddr ?? '',
      call.clientOrigin ?? '',
      call.atMs,
      call.atMs,
    )
}
