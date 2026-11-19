// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH TOOL THE AGENTS WERE RUNNING IN, WHERE THEY WERE REFUSED, AND HOW LONG BEFORE THEY WROTE
 * ANYTHING.
 *
 * Criterion I4 asks for the usage numbers split by framework and by project, and for the time from
 * an agent's arrival to its first useful write. None of the three could be answered before this
 * file, and the reason is worth stating plainly.
 *
 * ---------------------------------------------------------------------------------------
 * A CALL ROW DOES NOT SAY WHICH TOOL MADE IT
 * ---------------------------------------------------------------------------------------
 *
 * `api_calls` carries the actor type, the actor id and the session id, and nothing else about the
 * caller. There is no runtime header and no runtime column. So the tool is worked out here, by
 * joining on what the row does carry:
 *
 *   1. the `session` record whose id the row names, and its declared `adaptedTool` field, or
 *   2. when the row names no session record, the durable agent registry row whose handle the row's
 *      actor id names, and its `runtime`, which the registry takes only from the adapted list.
 *
 * THE DECLARED FIELD AND NEVER THE FREE WORD, as a decision says; problem
 * uh6-H72Zik9H. A
 * session record's `runtime` is a free word: on 6 September 2026 it held eleven words, one tool
 * under two spellings, and eight words that name no tool at all. Counting by it made `codex` and
 * `codex-cli` two tools. So the split counts by `adaptedTool`, which the record door takes only
 * from AGENT_RUNTIMES. A run whose session record has no `adaptedTool` is counted under `null`,
 * "not declared", even when its free word is the name of an adapted tool: reading the free word
 * would be a guess, and it is shown beside the run as it was written.
 *
 * EVERY ROW SAYS WHICH OF THE TWO ANSWERED, and a row neither answers for is counted under `null`
 * with the sentence saying so. `null` here is *nobody declared which tool this was*, which is a
 * different fact from *this tool made no calls*, and a reading that folded them together would make
 * the browser's own polling look like a framework.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIRST USEFUL WRITE IS A ROW IN THE CHANGE LOG, NOT A 201
 * ---------------------------------------------------------------------------------------
 *
 * An arrival is the first call a session made. Its first useful write is the first row in `changes`
 * carrying that session. A run that read for twenty minutes and wrote nothing has no first write,
 * and it is reported with `msToFirstWrite: null` and the reason, never as a zero and never dropped.
 *
 * THE TWO CLOCKS ARE DIFFERENT AND THE JOIN IS WHERE THAT BITES. `api_calls.at_ms` is epoch
 * milliseconds; `changes.at` is a local wall-clock string. `parseLocalStamp` is the one reader that
 * bridges them. A hand-rolled conversion here would be the defect `usage-reads.ts` already records:
 * appending a `Z` made a fifty-minute silence read as "just now" for two months.
 */
import { sql } from 'drizzle-orm'

import { isAgentRuntime, type AgentRuntime } from '@shared/participants.ts'
import { parseLocalStamp } from '@shared/time.ts'
import { inEnglish, saying, type DevSaying, type DevSayingCode } from '@shared/dev-sayings.ts'
import { db, sqlite } from '../db/client.ts'
import { agents, changes, records } from '../db/schema.ts'
// THE ONE READER OF AN AGENT'S RUNTIME. The registry row's `runtime` column is dead, as option A of a decision
// says, on proposal nfETNdLvpE5P — and the record's `data.runtime` is the store.
import { runtimeOfTheAgentRecord } from '../db/read-participant.ts'

/** Why a call was refused, by the status it was refused with. The words are in the word lists. */
const WHY_REFUSED: Readonly<Record<number, Extract<DevSayingCode, `usageRefused${number}`>>> = {
  400: 'usageRefused400',
  401: 'usageRefused401',
  403: 'usageRefused403',
  404: 'usageRefused404',
  405: 'usageRefused405',
  409: 'usageRefused409',
  413: 'usageRefused413',
  422: 'usageRefused422',
  429: 'usageRefused429',
}

/** What a refusal status means, or the honest sentence for one nobody has words for, as a code. */
export function whyRefusedSaid(status: number): DevSaying {
  const code = WHY_REFUSED[status]
  return code === undefined ? saying('usageRefusedOther', { status: String(status) }) : saying(code, {})
}

/** The same, in English. */
export function whyRefused(status: number): string {
  return inEnglish(whyRefusedSaid(status))
}

/** One declared tool, or the calls whose run declared none. */
export interface ByFramework {
  /**
   * THE DECLARED TOOL, one of the tools Mole Office adapts. Null because no run declared which tool
   * made these calls: "not declared" on the page. The free `runtime` word is never read here.
   */
  adaptedTool: AgentRuntime | null
  /** Present only on the null row: why nobody could say. */
  why?: string
  calls: number
  refused: number
  writes: number
  bytes: number
  sessions: number
  /** The middle time from arrival to first useful write, in milliseconds, over this tool's runs. */
  msToFirstWriteMedian: number | null
  /** How many of this tool's runs wrote nothing at all. */
  runsThatWroteNothing: number
}

/** One project's share of what agents did. */
export interface ByProject {
  workspaceId: string | null
  calls: number
  refused: number
  writes: number
  bytes: number
  sessions: number
}

/** One reason calls were refused, with the operations it happened on. */
export interface Refusal {
  status: number
  reason: string
  /** `reason` as a code the usage page draws in its own language (src/shared/dev-sayings.ts). */
  reasonSaid: DevSaying
  count: number
  operations: { operation: string | null; count: number }[]
}

/** One run: when it arrived, and how long before it wrote anything anybody can read. */
export interface Arrival {
  sessionId: string
  /** The tool this run declared, or null because it declared none. */
  adaptedTool: AgentRuntime | null
  /** Which of the two joins answered, or null because neither declared a tool. */
  declaredBy: 'the session record' | 'the agent registry' | null
  /** The free word the run's session record holds, as it was written, or null when it holds none. */
  runtimeWord: string | null
  workspaceId: string | null
  arrivedAt: number
  calls: number
  firstWriteAt: number | null
  msToFirstWrite: number | null
  /** Said in words when there is no first write. */
  why?: string
}

/** Everything the usage page needs that the older reads do not answer. */
export interface AgentUsage {
  byFramework: ByFramework[]
  byProject: ByProject[]
  refusals: Refusal[]
  arrivals: Arrival[]
  /** What could not be attributed to a tool, and why. */
  notAttributed: { calls: number; sessions: number; why: string; whySaid: DevSaying }
}

/** Why calls are counted under "not declared": the one sentence the null row and the total both carry. */
const NOT_DECLARED_SAID = saying('usageNotDeclared', {})
const NOT_DECLARED = inEnglish(NOT_DECLARED_SAID)

/** The middle value, the same rule `usage-reads.ts` uses. */
function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]!
  return (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** What one session record says about its tool: the declared tool, and the free word as written. */
interface SessionTool {
  adaptedTool: AgentRuntime | null
  runtimeWord: string | null
}

/**
 * What each session record says about its tool, by that record's id.
 *
 * EVERY SESSION RECORD IS IN THE MAP, declared or not, because a run with a record answers for
 * itself: a record with no `adaptedTool` is "not declared", and the registry is not asked in its
 * place. A stored `adaptedTool` that is not on the list is not a declaration of an adapted tool; the
 * record door refuses one, so only a write around the door could leave one, and it is read as none.
 */
function toolBySession(): Map<string, SessionTool> {
  const rows = db
    .select({ id: records.id, data: records.data })
    .from(records)
    .where(sql`${records.kind} = 'session'`)
    .all()
  const out = new Map<string, SessionTool>()
  for (const row of rows) {
    const data = row.data as { runtime?: unknown; adaptedTool?: unknown } | null
    const declared = data?.adaptedTool
    const word = data?.runtime
    out.set(row.id, {
      adaptedTool: isAgentRuntime(declared) ? declared : null,
      runtimeWord: typeof word === 'string' && word.trim() !== '' ? word : null,
    })
  }
  return out
}

/**
 * Which tool each durable agent runs in, by the string a request log row stores for its actor.
 *
 * THAT STRING IS A STORED REFERENCE, so it is read the way every stored reference is: an exact id
 * first, then the one agent bearing it as a handle, and nobody where more than one agent bears it. A
 * handle can be borne by a retired agent and a live one (criterion I3), and they may run in
 * different tools.
 */
function runtimeByAgent(): Map<string, AgentRuntime> {
  // THE RECORD AND NOT THE ROW. This used to read `agents.runtime`, the second copy that no door
  // could change after registration (problem KVvt74765Na1); it reads the one store now, through
  // the one function the participants doors read.
  const rows = db.select({ id: agents.id, handle: agents.handle }).from(agents).all()
  const bearers = new Map<string, number>()
  for (const row of rows) bearers.set(row.handle, (bearers.get(row.handle) ?? 0) + 1)
  const ids = new Set(rows.map((row) => row.id))
  const out = new Map<string, AgentRuntime>()
  for (const row of rows) {
    // ONLY A WORD FROM THE ADAPTED LIST. The registry takes nothing else now, and a record written
    // before that check may still carry another word, `codex-cli` among them; that is not a
    // declared tool, so it answers nothing here.
    const runtime = runtimeOfTheAgentRecord(row.id)
    if (!isAgentRuntime(runtime)) continue
    out.set(row.id, runtime)
    if (bearers.get(row.handle) === 1 && !ids.has(row.handle)) out.set(row.handle, runtime)
  }
  return out
}

/** When each session first wrote something, in epoch milliseconds. */
function firstWriteBySession(): Map<string, number> {
  const rows = db
    .select({ sessionId: changes.sessionId, at: sql<string>`min(${changes.at})` })
    .from(changes)
    .where(sql`${changes.sessionId} is not null`)
    .groupBy(changes.sessionId)
    .all()
  const out = new Map<string, number>()
  for (const row of rows) {
    if (row.sessionId === null) continue
    const at = parseLocalStamp(row.at)
    if (at === null) continue
    out.set(row.sessionId, at)
  }
  return out
}

/** One row per session in the window, counted in SQL because there are too many calls to carry. */
interface SessionCounts {
  sessionId: string | null
  actorId: string | null
  workspaceId: string | null
  arrivedAt: number
  calls: number
  refused: number
  writes: number
  bytes: number
}

/**
 * What agents did in this window, split by the tool they ran in and by the project.
 *
 * COUNTED IN SQL, PER SESSION. There are hundreds of thousands of call rows and a few hundred
 * sessions, so the grouping happens in the database and only the sessions come back. The reading
 * that used to bring every row into memory took 162 seconds on the owner's corpus.
 */
export function agentUsage(fromMs: number, workspaceId: string | null): AgentUsage {
  const perSession = sqlite
    .prepare(
      'select session_id as sessionId, actor_id as actorId, workspace_id as workspaceId, ' +
        'min(at_ms) as arrivedAt, count(*) as calls, ' +
        'sum(case when status >= 400 and status < 500 then 1 else 0 end) as refused, ' +
        "sum(case when effect = 'write' then 1 else 0 end) as writes, " +
        'sum(coalesce(bytes, 0)) as bytes ' +
        `from api_calls where at_ms >= ?${workspaceId === null ? '' : ' and workspace_id = ?'} ` +
        'group by session_id, actor_id, workspace_id',
    )
    .all(...(workspaceId === null ? [fromMs] : [fromMs, workspaceId])) as SessionCounts[]

  const bySession = toolBySession()
  const byAgent = runtimeByAgent()
  const firstWrite = firstWriteBySession()

  const arrivals: Arrival[] = []
  const frameworks = new Map<string, ByFramework & { times: number[] }>()
  const projects = new Map<string, ByProject>()
  let unattributedCalls = 0
  let unattributedSessions = 0

  for (const row of perSession) {
    // A RUN WITH A SESSION RECORD ANSWERS FOR ITSELF; the registry answers only for calls whose
    // session id names no record. See `toolBySession`.
    const record = row.sessionId === null ? undefined : bySession.get(row.sessionId)
    const fromRegistry = record !== undefined || row.actorId === null ? undefined : byAgent.get(row.actorId)
    const adaptedTool = record !== undefined ? record.adaptedTool : (fromRegistry ?? null)
    const declaredBy =
      record !== undefined ? (record.adaptedTool === null ? null : 'the session record') : fromRegistry !== undefined ? 'the agent registry' : null

    if (adaptedTool === null) {
      unattributedCalls += row.calls
      unattributedSessions += 1
    }

    const wroteAt = row.sessionId === null ? undefined : firstWrite.get(row.sessionId)
    // THE TWO CLOCKS HAVE DIFFERENT RESOLUTIONS, AND A RUN CAN WRITE INSIDE ITS FIRST SECOND.
    // `api_calls.at_ms` is exact milliseconds; `changes.at` is a wall-clock stamp to the second, so
    // a write a tenth of a second after the first call can come back stamped before it. That is not
    // a negative duration, it is a difference too small for the change log to hold, and it is
    // reported as unmeasurable rather than as a number with a minus sign in front of it.
    const difference = wroteAt === undefined ? null : wroteAt - row.arrivedAt
    const msToFirstWrite = difference === null || difference < 0 ? null : difference
    const whyNoTime =
      wroteAt === undefined
        ? 'This run has not written anything anybody can read, so there is no first write to time.'
        : difference !== null && difference < 0
          ? 'This run wrote inside the same second it arrived. The change log stores whole seconds, so ' +
            'the difference is smaller than anything it can measure.'
          : null
    if (row.sessionId !== null) {
      arrivals.push({
        sessionId: row.sessionId,
        adaptedTool,
        declaredBy,
        runtimeWord: record?.runtimeWord ?? null,
        workspaceId: row.workspaceId,
        arrivedAt: row.arrivedAt,
        calls: row.calls,
        firstWriteAt: wroteAt ?? null,
        msToFirstWrite,
        ...(whyNoTime === null ? {} : { why: whyNoTime }),
      })
    }

    const key = adaptedTool ?? ''
    const seen = frameworks.get(key) ?? {
      adaptedTool,
      ...(adaptedTool === null ? { why: NOT_DECLARED } : {}),
      calls: 0,
      refused: 0,
      writes: 0,
      bytes: 0,
      sessions: 0,
      msToFirstWriteMedian: null,
      runsThatWroteNothing: 0,
      times: [],
    }
    seen.calls += row.calls
    seen.refused += row.refused
    seen.writes += row.writes
    seen.bytes += row.bytes
    seen.sessions += 1
    if (wroteAt === undefined) seen.runsThatWroteNothing += 1
    else if (msToFirstWrite !== null) seen.times.push(msToFirstWrite)
    frameworks.set(key, seen)

    const projectKey = row.workspaceId ?? ''
    const project = projects.get(projectKey) ?? {
      workspaceId: row.workspaceId,
      calls: 0,
      refused: 0,
      writes: 0,
      bytes: 0,
      sessions: 0,
    }
    project.calls += row.calls
    project.refused += row.refused
    project.writes += row.writes
    project.bytes += row.bytes
    project.sessions += 1
    projects.set(projectKey, project)
  }

  const byFramework: ByFramework[] = [...frameworks.values()]
    .map(({ times, ...rest }) => ({ ...rest, msToFirstWriteMedian: medianOf(times) }))
    .sort((a, b) => b.calls - a.calls)

  const refusalRows = sqlite
    .prepare(
      'select status, operation, count(*) as n from api_calls ' +
        `where at_ms >= ? and status >= 400 and status < 500${workspaceId === null ? '' : ' and workspace_id = ?'} ` +
        'group by status, operation order by n desc',
    )
    .all(...(workspaceId === null ? [fromMs] : [fromMs, workspaceId])) as {
    status: number
    operation: string | null
    n: number
  }[]
  const refusals = new Map<number, Refusal>()
  for (const row of refusalRows) {
    const seen = refusals.get(row.status) ?? { status: row.status, reason: whyRefused(row.status), reasonSaid: whyRefusedSaid(row.status), count: 0, operations: [] }
    seen.count += row.n
    seen.operations.push({ operation: row.operation, count: row.n })
    refusals.set(row.status, seen)
  }

  return {
    byFramework,
    byProject: [...projects.values()].sort((a, b) => b.calls - a.calls),
    refusals: [...refusals.values()].sort((a, b) => b.count - a.count),
    arrivals: arrivals.sort((a, b) => b.arrivedAt - a.arrivedAt),
    notAttributed: {
      calls: unattributedCalls,
      sessions: unattributedSessions,
      why: NOT_DECLARED,
      whySaid: NOT_DECLARED_SAID,
    },
  }
}
