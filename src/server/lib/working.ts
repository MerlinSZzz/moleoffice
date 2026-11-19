// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO IS WORKING ON WHAT, AS ONE READING, AND WHY IT IS EMPTY WHEN IT IS EMPTY.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS ANSWERS
 * ---------------------------------------------------------------------------------------
 *
 * The owner's brief, section 21, asks for a human projection over machinery round ten built and
 * never drew: the durable agents that are still being given work, what each one is supposed to be
 * doing, whether it can be reached, what it says it is doing, its work domain, the code that domain
 * touches, whose work it overlaps, which of those overlaps are write conflicts, when it last made
 * meaningful progress and for how long, and which run is serving it now.
 *
 * ---------------------------------------------------------------------------------------
 * IT JOINS TWO DIMENSIONS AND DERIVES NEITHER FROM THE OTHER
 * ---------------------------------------------------------------------------------------
 *
 * Presence and work state are two readings taken by two files — `presence.ts` and `lifecycle.ts` —
 * and this one calls both and puts them side by side. It never reads one to decide the other.
 * `@shared/lifecycle.ts` says why in full: all fifteen pairs occur, and the pair a builder wants to
 * call impossible, **Offline and Working**, is what a provider dying mid-work looks like.
 *
 * ---------------------------------------------------------------------------------------
 * THE HARD PART IS THE EMPTY CASE, AND IT IS THE POINT OF THE FILE
 * ---------------------------------------------------------------------------------------
 *
 * On the corpus this was written against there are almost no agents, no work domains and no
 * work-state transitions at all — the table that would hold them is not even on the database, and
 * `transitionStoreExists()` says so. So the roster is empty, and an empty roster can mean three
 * completely different things:
 *
 *   nothing has been recorded    Somebody could have filed one and nobody has. The store was read.
 *   nothing is there             The store was read and it is genuinely empty of this thing.
 *   nobody has looked            There is nothing to look with. No reader exists, or the store the
 *                                reader needs is not on this database.
 *
 * **The third is not the first two and must never be drawn as them.** *Nobody has recorded an agent
 * yet* and *there are no agents* are different sentences; *no agent has said what it is doing* and
 * *Mole Office cannot read what any agent said* are different sentences again. Every absence in the
 * reply below therefore carries one of the three words and a sentence saying which, and the words
 * are `InputAnswer` from `presence.ts` — the same three that file already publishes — rather than a
 * second vocabulary meaning the same thing.
 *
 * **Nothing here invents a row to fill the page.** There is no fixture agent, no example domain and
 * no placeholder work state. A screenshot of an empty page that says why it is empty is the honest
 * picture; a screenshot of invented agents is fabricated evidence.
 */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm'

import { theMoleOfficeTest } from '@shared/participants.ts'
import { nowStamp, parseAnyStamp } from '@shared/time.ts'
import { NOBODY_HAS_SAID, WORK_STATE, type WorkState } from '@shared/lifecycle.ts'
import { overlapMarkOf, rankOf, type OverlapClass } from '@shared/workdomain.ts'
import { db, sqlite } from '../db/client.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { records, theProjectOfARowFoundById } from '../db/schema.ts'
import { agentsIn } from './inbox.ts'
import { unregisteredAgentsSeen, type UnregisteredAgent } from './participants.ts'
import { agentsForRecords } from '../db/agents-for-records.ts'
import { avatarsOnOffer, pictureShownFor, theAssetRowsFor } from './avatars.ts'
import { listAttachments, listAttachmentsAndOpenIds, type AttachmentView } from './attachments.ts'
import { transitionStoreExists, workStateOf } from './lifecycle.ts'
import { presenceOf, type InputAnswer, type PresenceReading, type WhatARosterReadOnce } from './presence.ts'
import { newestRequestOfEachRun } from './arrivals.ts'
import { overlapsFor, RESOLVER_VERSION, type OpenDomain } from './workdomain.ts'
import type { PanelRecord } from '@shared/types.ts'

// ============================================================================ saying an absence

/**
 * ONE THING THAT IS NOT THERE, AND WHICH OF THE THREE KINDS OF NOT-THERE IT IS.
 *
 * `answer` is `InputAnswer` from `presence.ts` and is not redeclared here. That file already had to
 * separate *a reader nobody built* from *a reader that found nothing*, and the distinction this
 * page turns on is the same one. A second three-word vocabulary spelt slightly differently is this
 * repository's recurring defect with a new name on it.
 */
export interface Absence {
  /** Which absence this is. The page draws its name from the words files by this code (wave 13y round 121). */
  code: AbsenceCode
  /** What is missing, in the server's English. The page does not draw it; it is kept for other readers of the answer. */
  what: string
  answer: InputAnswer
  /** How many there are. Zero for every absence; kept so a caller never counts the list itself. */
  count: number
  /** One plain sentence saying which of the three this is, and what would change it. */
  says: string
}

/** The five things the page can find missing. */
export type AbsenceCode = 'registeredAgent' | 'assignableAgent' | 'statedWork' | 'openDomain'

// ============================================================================ one row

/** What an agent's work state reads as here, including the case where Mole Office cannot read one. */
export interface WorkStateOnScreen {
  /** One of the five, or null — and `answer` says which kind of null it is. */
  state: WorkState | null
  /** What a person reads. Null when there is no word to read. */
  word: string | null
  /** The sentence a person reads, in every case including both empty ones. */
  says: string
  answer: InputAnswer
  since: string | null
  because: string | null
  saidBy: { type: 'human' | 'agent'; id: string } | null
}

/** One work domain as this page draws it: what it is for, where it stands, and what it touches. */
export interface DomainOnScreen {
  id: string
  title: string
  objective: string
  stage: string
  /** `accepted` when the machine's answer was taken, `stated` when only the agent has spoken. */
  basis: 'accepted' | 'stated'
  /** The repository, module, pipeline or block paths this domain says it writes or creates. */
  touches: string[]
  /** The records this domain is about, by `about` link. */
  aboutRecords: { id: string; title: string; kind: string }[]
  /** The newest sign of work on it, and which of two stored facts said so. */
  lastSign: { at: string | null; from: string }
}

/** One overlap with somebody else's open work, as a person reads it. */
export interface OverlapOnScreen {
  /** The other domain in the pair. */
  otherDomainId: string
  otherDomainTitle: string
  /** The durable agent that other domain belongs to, or null when it named none. */
  otherAgentId: string | null
  /** What the two share: a path, a record id. */
  subject: string
  overlapClass: OverlapClass
  rank: number
  /** The word a person reads for that rank, from the shared table. Null when the rank is undrawn. */
  word: string | null
  /** Why this pair is reported, in the classifier's own words. */
  says: string
  /** True when Mole Office could not tell whether these overlap. Not the same as no overlap. */
  unknown: boolean
}

/** One durable agent, on the page. */
export interface WorkingRow {
  agentId: string
  handle: string
  title: string
  /** `active` or `retired`. Whether it may be given new work — a third question, not a work state. */
  agentState: string
  runtime: string | null
  /** Why the agent exists right now, or why Mole Office cannot say. */
  workState: WorkStateOnScreen
  /** Whether it can be reached right now, and which of three inputs answered. */
  presence: PresenceReading
  /** What it says it is doing, in its own words, from the run serving it. Null when it never said. */
  doing: string | null
  /** The attachment that said it, so the claim is attributable. */
  doingFrom: string | null
  /** The run serving it now, newest first. Null when none is open. */
  attachment: AttachmentView | null
  /** Every open work domain this agent owns. */
  domains: DomainOnScreen[]
  /** Overlaps between this agent's open domains and anybody else's. Worst first. */
  overlaps: OverlapOnScreen[]
  /** How many of those overlaps are write conflicts — two open domains writing one thing. */
  writeConflicts: number
  /** The newest meaningful thing this agent did, and what said so. */
  lastProgress: { at: string | null; from: string; agoMinutes: number | null }
  /** How long the current work state has been held, in whole minutes. Null when nobody has said. */
  inThisStateMinutes: number | null
  /**
   * The registry row this agent record is, or null because nothing has mapped it.
   *
   * TWO NAMES, ON PURPOSE, AND THE PAGE DRAWS THE REGISTRY'S. `title` above is the record's title;
   * `participant.name` is the name a person gave the agent through the registry, and criterion M3
   * gives them the right to change it without touching the record. Null here means the record was
   * written round the door — the migration and both write paths map one — and the page draws what
   * the record says instead of inventing a picture for it.
   */
  participant: {
    id: string
    name: string
    avatarUrl: string
    /** Short free text the agent set itself, or null because nobody has said. */
    state: string | null
    stateAt: string | null
    retired: boolean
    retiredBecause: string | null
    /**
     * WHO STARTED IT, or null because nobody was recorded. Criterion P1.
     *
     * Null is what every agent registered before migration 0135 holds, and it is not harmless: the
     * registration route refuses to file anybody under an agent whose chain of starters reaches
     * nobody, so a null here is why a whole tree of builders cannot be registered. The page draws
     * the press that mends it, which is why the row carries the fact.
     */
    startedBy: { kind: string; id: string } | null
  } | null
}

// ============================================================================ the reply

/** What `GET /api/working` answers. */
export interface WhoIsWorking {
  workspaceId: string
  computedAt: string
  /** The active durable agents, one row each. Retired ones are counted and not drawn. */
  rows: WorkingRow[]
  counts: {
    agents: number
    active: number
    retired: number
    /** Of the active ones, how many have a work state anybody has said. */
    withWorkState: number
    openDomains: number
    overlaps: number
    writeConflicts: number
  }
  /**
   * The agent actor ids that have written here and answer to no registry row, most recent first.
   *
   * Criterion M14. NAMED AND NOTHING ELSE: nothing on this list is retired or stopped over it, which
   * is the owner's F1 answer of 3 September 2026 applied to identity. A NEW write from an unknown
   * agent is refused at the door since 16 September 2026 (`whyAnUnregisteredAgentMayNotWrite` in
   * lib/records/unregistered-agent.ts), so the rows are the writers that may write without a registration and the
   * unknown agents that wrote before then. An empty list means every agent that has written is
   * registered, which is what a database whose agents all came through the record door holds.
   *
   * ALL OF THEM, so the page can say how many there are. It used to be the first twenty with no
   * count of the rest, and the page drew twenty of a hundred and ten under a sentence that read as
   * covering all of them. Problem `yKFPQXucwshV`.
   */
  unregistered: UnregisteredAgent[]
  /** Everything this reading could not find, each saying which kind of not-found it is. */
  absences: Absence[]
  /** What this reading says about itself, in one paragraph. */
  note: string
  /** The machinery a developer asks for, and Normal mode never draws. */
  machinery: {
    resolverVersion: string
    transitionStore: { exists: boolean; says: string }
  }
}

// ============================================================================ reading one agent

/** A string key of a record's data, or null when it is missing or is not a usable string. */
function text(data: Record<string, unknown>, key: string): string | null {
  const value = data[key]
  return typeof value === 'string' && value !== '' ? value : null
}

/** How many whole minutes ago a stamp was, or null when the stamp cannot be read. */
function minutesAgo(stamp: string | null, now: Date): number | null {
  if (stamp === null) return null
  const at = parseAnyStamp(stamp)
  if (at === null) return null
  return Math.max(0, Math.floor((now.getTime() - at.getTime()) / 60_000))
}

/**
 * WHAT THIS AGENT'S WORK STATE READS AS, WITH THE TWO EMPTY CASES KEPT APART.
 *
 * `workStateOf` throws a 503 when the transitions table is not on this database, which is the right
 * answer to a caller asking about one agent and the wrong shape for a roster — one missing table
 * would take the whole page down. So the store is asked once, by the caller, and this function is
 * told: **absent store is `reader-not-built`, and an empty history is `nothing-recorded`.** They
 * read as two different sentences because they are two different facts. Collapsing them would tell
 * the owner that their agents have said nothing when the truth is that Mole Office cannot hear them.
 */
export function workStateOnScreen(agentId: string, workspaceId: string, storeExists: boolean): WorkStateOnScreen {
  if (!storeExists) {
    return {
      state: null,
      word: null,
      says: 'Mole Office cannot read the work state: its table is not on this database.',
      answer: 'reader-not-built',
      since: null,
      because: null,
      saidBy: null,
    }
  }
  const reading = workStateOf(agentId, workspaceId)
  if (reading.state === null) {
    return {
      state: null,
      word: null,
      says: NOBODY_HAS_SAID,
      answer: 'nothing-recorded',
      since: null,
      because: null,
      saidBy: null,
    }
  }
  return {
    state: reading.state,
    word: WORK_STATE[reading.state].word,
    says: reading.says,
    answer: 'answered',
    since: reading.since,
    because: reading.because,
    saidBy: reading.saidBy,
  }
}

/**
 * WHAT AN AGENT SAYS IT IS DOING, IN ITS OWN WORDS, OR NOTHING.
 *
 * It is `data.doing` on the run serving it — the sentence the run wrote about itself. It is NOT
 * composed from the work-state word, from the domain's objective, or from the record's title: each
 * of those is somebody else's sentence, and printing one of them under "what it says it is doing"
 * would be Mole Office putting words in an agent's mouth.
 */
function doingOf(attachment: AttachmentView | null, record: PanelRecord | undefined): string | null {
  if (attachment === null || record === undefined) return null
  return text(record.data, 'doing')
}

/**
 * THE PATHS A DOMAIN SAYS IT TOUCHES, as the agent wrote them.
 *
 * `writes` and `creates` are the hypothesis fields — what the agent said before Mole Office resolved
 * anything — so these are printed as written and never as resolved paths. A resolved path is the
 * machine's answer and belongs in Developer, beside the resolver that produced it.
 */
function touchesOf(domain: OpenDomain): string[] {
  const out: string[] = []
  for (const key of ['writes', 'creates'] as const) {
    const held = domain.data[key]
    if (!Array.isArray(held)) continue
    for (const one of held) if (typeof one === 'string' && one !== '') out.push(one)
  }
  return [...new Set(out)]
}

/** The records a domain is about, by `about` link, with enough to draw a row. */
function aboutRecordsOf(domainId: string, workspaceId: string): { id: string; title: string; kind: string }[] {
  const rows = db
    .select({ id: records.id, title: records.title, kind: records.kind })
    .from(records)
    .where(
      and(
        eq(records.workspaceId, workspaceId),
        isNull(records.deletedAt),
        sql`${records.id} IN (SELECT to_id FROM links WHERE from_id = ${domainId} AND type = 'about')`,
      ),
    )
    .all()
  return rows
}

/** The newest ledger change from any run of each agent, read together for the whole roster. */
function newestProgressOfAgents(agents: readonly { id: string; runs: readonly string[] }[]): ReadonlyMap<string, string> {
  const agentOfRun = new Map<string, string>()
  for (const agent of agents) for (const run of agent.runs) agentOfRun.set(run, agent.id)
  const byAgent = new Map<string, string>()
  if (agentOfRun.size === 0) return byAgent
  // ONE STATEMENT OVER EVERY RUN THE ROSTER DRAWS, not one per agent and not one per piece: the runs
  // are one JSON list (9,420 on the made-up office), and the index on `changes.session_id` answers each.
  // The per-agent read was 1,548 statements for the same rows.
  const rows = sqlite
    .prepare(`
      SELECT session_id AS run, max(at) AS at FROM changes
       WHERE session_id IN (SELECT value FROM json_each(?))
       GROUP BY session_id
    `)
    .all(JSON.stringify([...agentOfRun.keys()])) as { run: string; at: string }[]
  for (const row of rows) {
    const agentId = agentOfRun.get(row.run)
    if (agentId === undefined) continue
    const previous = byAgent.get(agentId)
    if (previous === undefined || row.at > previous) byAgent.set(agentId, row.at)
  }
  return byAgent
}

/**
 * THE NEWEST MEANINGFUL THING THIS AGENT DID, AND WHAT SAID SO.
 *
 * Meaningful means a write in the change ledger from one of this agent's runs — the same signal
 * `workdomain.ts` uses for *did anything happen*, and deliberately NOT the signal presence uses.
 * The brief's section 19 draws the line: *"Progress means semantic progress, not heartbeat/API
 * noise."* An agent that reads for an hour is present and has made no progress, and those two
 * questions want opposite inputs.
 */
function lastProgressOf(
  attachmentIds: readonly string[],
  now: Date,
  newest: string | undefined,
): { at: string | null; from: string; agoMinutes: number | null } {
  if (attachmentIds.length === 0) {
    return {
      at: null,
      from: 'this agent has no run recorded, so there is nothing to read a change from',
      agoMinutes: null,
    }
  }
  if (newest === undefined) {
    return {
      at: null,
      from: 'no run of this agent has written anything, so nothing has been seen',
      agoMinutes: null,
    }
  }
  return { at: newest, from: 'a change by one of its runs', agoMinutes: minutesAgo(newest, now) }
}

// ============================================================================ the projection

/**
 * THE ACTIVE AGENTS OF ONE PROJECT, THEIR OPEN RUNS AND WHAT PRESENCE READS, READ ONCE FOR THE WHOLE ROSTER.
 *
 * Both readings of the roster start here: the whole one for the page about who is working, and the
 * one Home draws (`theRosterHomeDraws` below). Which agent is active and what its presence is are
 * worked out here once, so the two cannot disagree about either. The runs that ended are not read
 * here: only the whole roster draws anything from them, and it reads them itself.
 */
interface TheActiveAgents {
  everyAgent: ReturnType<typeof agentsIn>
  active: ReturnType<typeof agentsIn>
  retired: number
  readOnce: WhatARosterReadOnce
}

/**
 * WHETHER AN AGENT RECORD IS ACTIVE: one that may still be given work. Every reading in this file asks this, so the
 * roster, Home's roster and Home's doing lines cannot disagree about who is at work.
 */
function isActiveAgent(record: PanelRecord): boolean {
  // ABSENT IS NOT ASSUMED ACTIVE. The kind requires `state`, so an agent without one is a record
  // that was written round the validator, and drawing it as active would be a guess about
  // whether the owner may still give it work.
  return record.data['state'] === 'active'
}

function readTheActiveAgents(
  workspaceId: string,
  openRuns: readonly AttachmentView[] = listAttachments({ workspaceId, openOnly: true, namingAnAgentOnly: true }),
): TheActiveAgents {
  const everyAgent = agentsIn(workspaceId)
  const active = everyAgent.filter(isActiveAgent)
  const retired = everyAgent.length - active.length

  // EVERY ACTIVE AGENT'S OPEN RUNS, AND THE NEWEST REQUEST OF EACH, READ ONCE FOR THE WHOLE ROSTER.
  // `presenceOf` read both again for every agent, and that was 7.4 of the 7.5 seconds a call took on
  // a copy of the owner's office (see `WhatARosterReadOnce` in presence.ts). The open runs come from the
  // same reading `openAttachmentsFor` makes, newest first, so each agent is handed exactly the runs
  // `presenceOf` would have read for it.
  const activeIds = new Set(active.map((record) => record.id))
  const openRunsByAgent = new Map<string, AttachmentView[]>()
  for (const run of openRuns) {
    if (run.agentId === null || !activeIds.has(run.agentId)) continue
    const list = openRunsByAgent.get(run.agentId)
    if (list === undefined) openRunsByAgent.set(run.agentId, [run])
    else list.push(run)
  }
  // AND EACH ACTIVE AGENT'S RECORD AND REGISTRY ROW, read once (wave 13r round 11). `presenceOf` and the rows below read
  // both again for every agent, which was the largest cost of the roster Home waits for.
  const recordsById = new Map(active.map((record) => [record.id, record]))
  const registeredById = agentsForRecords(active.map((record) => record.id))
  const readOnce: WhatARosterReadOnce = {
    openRunsOf: (agentId) => openRunsByAgent.get(agentId) ?? [],
    newestRequests: newestRequestOfEachRun([...openRunsByAgent.values()].flat().map((run) => run.id)),
    recordOf: (agentId) => recordsById.get(agentId),
    registeredOf: (agentId) => registeredById.get(agentId) ?? null,
  }
  return { everyAgent, active, retired, readOnce }
}

/**
 * THE RUN SERVING AN AGENT NOW: the newest of its open runs, or null when none is open. `runs` are newest first, as
 * `listAttachments` answers them. The whole roster and Home's doing lines both ask this, so the run whose sentence
 * Home draws is the run the roster names.
 */
function servingRunOf(agentId: string, runs: readonly AttachmentView[]): AttachmentView | null {
  return runs.find((one) => one.agentId === agentId && one.open) ?? null
}

/**
 * EVERY RUN OF EACH AGENT, newest first as `listAttachments` answers them, grouped once for the whole roster. Each agent
 * went through every run of the project to find its own, which on the made-up office shaped to the live counts of 31
 * October 2026 was 974 agents through 16,548 runs (wave 13y round 114).
 */
function theRunsOfEachAgent(runs: readonly AttachmentView[]): Map<string, AttachmentView[]> {
  const byAgent = new Map<string, AttachmentView[]>()
  for (const run of runs) {
    if (run.agentId === null) continue
    const list = byAgent.get(run.agentId)
    if (list === undefined) byAgent.set(run.agentId, [run])
    else list.push(run)
  }
  return byAgent
}

/** Every run of this agent, newest first, and the open one serving it now or null. */
function theRunsOf(
  agentId: string,
  runsByAgent: ReadonlyMap<string, AttachmentView[]>,
): { mine: AttachmentView[]; serving: AttachmentView | null } {
  const mine = runsByAgent.get(agentId) ?? []
  return { mine, serving: servingRunOf(agentId, mine) }
}

/**
 * THE STORED RECORDS OF SOME RUNS OF ONE PROJECT, by id: what `doingOf` reads a run's sentence from. Both readings that
 * draw a doing line ask this for the runs whose line they draw, and for no other run. The whole roster read every run
 * of the project whole a third time for its lines (wave 13y round 114).
 *
 * The runs are found by their ids, and the project is asked with `theProjectOfARowFoundById`. Asked with `eq`, SQLite
 * walked every record of the project through `records_title_idx` for each piece of ids: 114 ms for the 1,105 runs of
 * a made-up office at the size of 4 November 2026, and 0.7 ms this way, each the median of 5 warm reads (wave 13y
 * round 133).
 */
function theRecordsOfRuns(workspaceId: string, runIds: readonly string[]): Map<string, PanelRecord> {
  // IN PIECES (src/server/db/in-pieces.ts): one run serves each active agent, and nothing caps how many are active.
  const rows = readInPieces(runIds, (piece) =>
    db
      .select()
      .from(records)
      .where(and(theProjectOfARowFoundById(workspaceId), inArray(records.id, piece)))
      .all(),
  )
  return new Map(rows.map((row) => [row.id, row as unknown as PanelRecord] as const))
}

/**
 * WHO IS WORKING ON WHAT, IN ONE PROJECT, RIGHT NOW.
 *
 * Computed at read and stored nowhere. There is no roster table, no cached current state and no
 * `lastSeen` column — every number here is derived from rows that already exist, so the page cannot
 * go stale and cannot disagree with the record it is drawn from.
 *
 * `now` is injectable so a test can put the clock where it needs it. Nothing here writes.
 */
export function whoIsWorking(workspaceId: string, now: Date = new Date()): WhoIsWorking {
  const storeExists = transitionStoreExists()
  // EVERY RUN OF THE PROJECT AND THE SQL OPEN RULE'S ANSWER, IN ONE READ. The open runs go to
  // `readTheActiveAgents` as its own open-only read gave them; every run stays here, because an
  // agent's last progress is read over all of its runs and Home's roster draws no run that ended.
  const everyRun = listAttachmentsAndOpenIds({ workspaceId, namingAnAgentOnly: true })
  const { everyAgent, active, retired, readOnce } = readTheActiveAgents(
    workspaceId,
    everyRun.runs.filter((run) => everyRun.openIds.has(run.id)),
  )
  const runsByAgent = theRunsOfEachAgent(everyRun.runs)
  const theirRuns = active.map((record) => ({ record, registered: readOnce.registeredOf?.(record.id) ?? null, ...theRunsOf(record.id, runsByAgent) }))
  const progressByAgent = newestProgressOfAgents(theirRuns.map(({ record, mine }) => ({ id: record.id, runs: mine.map((one) => one.id) })))
  const servingRecords = theRecordsOfRuns(
    workspaceId,
    theirRuns.flatMap(({ serving }) => (serving === null ? [] : [serving.id])),
  )

  const overlapReading = overlapsFor(workspaceId)
  const domains = overlapReading.domains
  const domainTitles = new Map(domains.map((one) => [one.id, one.title]))
  const domainAgents = new Map(domains.map((one) => [one.id, one.agentId === '' ? null : one.agentId]))

  // THE TWO PICTURE DIRECTORIES ARE READ ONCE FOR THE WHOLE ROSTER, not once per row.
  // `pictureShownFor` needs the list to answer which picture an agent that chose none is given.
  const onOffer = avatarsOnOffer()
  const officeTest = theMoleOfficeTest()
  // EVERY AGENT'S PICTURE ROW IS READ ONCE, not once per agent: a roster of agents that still wear an
  // earlier drawn default asked for 1,597 rows separately on the 13 November office.
  const avatarIds = theirRuns.flatMap(({ registered }) => registered === null ? [] : [registered.avatarAssetId])
  const avatarAssets = theAssetRowsFor(avatarIds)
  const rows: WorkingRow[] = []
  for (const { record, registered, mine, serving: attachment } of theirRuns) {
    const agentId = record.id
    const myDomains = domains.filter((one) => one.agentId === agentId)
    const myDomainIds = new Set(myDomains.map((one) => one.id))

    const overlaps: OverlapOnScreen[] = []
    for (const finding of overlapReading.overlaps) {
      const mineIsA = myDomainIds.has(finding.a.id)
      const mineIsB = myDomainIds.has(finding.b.id)
      if (!mineIsA && !mineIsB) continue
      const otherId = mineIsA ? finding.b.id : finding.a.id
      const mark = overlapMarkOf(finding.rank)
      overlaps.push({
        otherDomainId: otherId,
        otherDomainTitle: domainTitles.get(otherId) ?? otherId,
        otherAgentId: domainAgents.get(otherId) ?? null,
        subject: finding.subject,
        overlapClass: finding.overlapClass,
        rank: finding.rank,
        word: mark?.word ?? null,
        says: mineIsA ? finding.forA : finding.forB,
        unknown: finding.unknown === true,
      })
    }
    overlaps.sort((a, b) => b.rank - a.rank)

    const workState = workStateOnScreen(agentId, workspaceId, storeExists)
    rows.push({
      agentId,
      participant:
        registered === null
          ? null
          : {
              id: registered.id,
              name: registered.name,
              avatarUrl: pictureShownFor({ kind: 'agent', id: registered.id }, registered.avatarAssetId, onOffer, null, officeTest, (id) => avatarAssets.get(id)),
              state: registered.state,
              stateAt: registered.stateAt,
              retired: registered.retired,
              retiredBecause: registered.retiredBecause,
              startedBy: registered.startedBy,
            },
      handle: text(record.data, 'handle') ?? '',
      title: record.title,
      agentState: 'active',
      runtime: text(record.data, 'runtime'),
      workState,
      presence: presenceOf(agentId, workspaceId, now, readOnce),
      doing: doingOf(attachment, attachment === null ? undefined : servingRecords.get(attachment.id)),
      doingFrom: attachment?.id ?? null,
      attachment,
      domains: myDomains.map((one) => ({
        id: one.id,
        title: one.title,
        objective: one.objective,
        stage: one.stage,
        basis: one.basis,
        touches: touchesOf(one),
        aboutRecords: aboutRecordsOf(one.id, workspaceId),
        lastSign: one.lastSign,
      })),
      overlaps,
      // A WRITE CONFLICT IS THE TOP RANK AND THE RANK IS READ FROM THE SHARED TABLE. Writing `4`
      // here would be the same fact in two places, and the day a class is inserted above
      // `write_write` this line would go on counting the wrong one.
      writeConflicts: overlaps.filter((one) => one.rank === rankOf('write_write')).length,
      lastProgress: lastProgressOf(mine.map((one) => one.id), now, progressByAgent.get(agentId)),
      inThisStateMinutes: minutesAgo(workState.since, now),
    })
  }

  const absences: Absence[] = []
  if (everyAgent.length === 0) {
    absences.push({
      code: 'registeredAgent',
      what: 'a durable agent',
      answer: 'nothing-recorded',
      count: 0,
      says: 'No registered agent in this project. The store was read and holds none; agents filed elsewhere are not counted.',
    })
  } else if (active.length === 0) {
    absences.push({
      code: 'assignableAgent',
      what: 'an agent that may be given new work',
      answer: 'nothing-recorded',
      count: 0,
      says:
        `${everyAgent.length === 1 ? '1 agent recorded, and it is retired.' : `${String(everyAgent.length)} agents recorded, all retired.`} ` +
        'A retired agent keeps its inbox and can be made active again.',
    })
  }
  if (!storeExists) {
    absences.push({
      code: 'statedWork',
      what: 'what any agent said it was doing',
      answer: 'reader-not-built',
      count: 0,
      says: 'The work-state table is not on this database, so no work state was read.',
    })
  } else if (rows.length > 0 && rows.every((one) => one.workState.state === null)) {
    absences.push({
      code: 'statedWork',
      what: 'what any agent said it was doing',
      answer: 'nothing-recorded',
      count: 0,
      says: 'The work-state history was read and holds no entry for these agents.',
    })
  }
  if (domains.length === 0) {
    absences.push({
      code: 'openDomain',
      what: 'an open work domain',
      answer: 'nothing-recorded',
      count: 0,
      says: 'No open work domain in this project, so no overlap or write conflict can be found.',
    })
  }
  const withWorkState = rows.filter((one) => one.workState.state !== null).length
  return {
    workspaceId,
    computedAt: nowStamp(),
    rows,
    counts: {
      agents: everyAgent.length,
      active: active.length,
      retired,
      withWorkState,
      openDomains: domains.length,
      overlaps: overlapReading.overlaps.length,
      writeConflicts: rows.reduce((sum, one) => sum + one.writeConflicts, 0),
    },
    unregistered: unregisteredAgentsSeen(),
    absences,
    note: noteFor(everyAgent.length, active.length, domains.length, storeExists),
    machinery: {
      resolverVersion: RESOLVER_VERSION,
      transitionStore: {
        exists: storeExists,
        says: storeExists
          ? 'On this database, and read.'
          : 'Not on this database. Its migration waits in held-migrations/agent-lifecycle-tables.sql until the person opens the window.',
      },
    },
  }
}

/**
 * THE ROSTER AS HOME DRAWS IT: WHO IS ACTIVE, THE NAME, WHO STARTED IT, THE DOT AND WHETHER IT WAITS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Home's Agents at work drew four fields of each roster row and asked for the whole row. On an office
 * of the live shape made up for round 31 of wave 13k (400 active agents in four projects, 1,536 open
 * runs, 200,000 request rows; tests/an-office-of-the-live-shape.ts), the four whole rosters came to
 * 975 KB, 681 KB of it for the 280 agents of one project: every row carried its presence inputs, its
 * open runs, its work state, its domains and its picture. This answers the same rows with the fields
 * Home draws and nothing else, and it skips the per-agent work Home never draws: the last progress, the
 * domains, the overlaps, the picture and the run's own sentence. Since the column is folded by who
 * started each agent (src/web/components/home/AgentGroups.tsx), a row carries the starter, which says
 * which group it sits in. It carries neither the run's sentence nor the work state:
 *   - the run's sentence is drawn only in a group the person opens, and is read for that group's agents
 *     alone, by `theDoingLinesHomeDraws` below (round 31b of wave 13k);
 *   - whether an agent waits for the person is read from the waiting list Home's Needs you box reads
 *     (`WaitingItem.fromAgent` in lib/waiting.ts), so the mark and the box are one reading. Round 31
 *     marked it from the work state, and its pictures showed groups needing the person beside a box
 *     that said nothing did.
 *
 * IT IS THE SAME ROSTER, NOT A SECOND ONE. The active agents and their presence come from
 * `readTheActiveAgents` and `presenceOf`, which `whoIsWorking` reads too, so a row here and the same
 * agent's row there cannot disagree. Each field keeps the path it has on the whole row
 * (`participant.name`, `participant.startedBy`, `presence.presence`), so a screen drawing one can draw
 * the other. The counts say how many agents there are, so an empty `rows` cannot be read as nobody.
 */
export interface HomeRosterRow {
  agentId: string
  /** The registry row's id and the name a person gave the agent, or null because nothing mapped it. */
  participant: { id: string; name: string; startedBy: { kind: string; id: string } | null } | null
  /** The presence reading's word, from `presenceOf`, the same reading the whole roster carries. */
  presence: { presence: PresenceReading['presence'] }
}

export interface HomeRoster {
  workspaceId: string
  computedAt: string
  /** The active agents, one row each. Retired ones are counted and not drawn. */
  rows: HomeRosterRow[]
  counts: { agents: number; active: number; retired: number }
  note: string
}

export const HOME_ROSTER_NOTE =
  'WHO IS ACTIVE IN THIS PROJECT, AS HOME DRAWS IT: one row per active durable agent with its registry name and ' +
  'starter and its presence word, and nothing else. It is the same roster as GET /api/working without ' +
  '`shape=home`, read from the same rows; ask that for the work state, the domains, the overlaps and the last ' +
  'progress. Add `doing=<id>,<id>` to read what the runs serving those agents say they are doing, and nothing else.'

export function theRosterHomeDraws(workspaceId: string, now: Date = new Date()): HomeRoster {
  const read = readTheActiveAgents(workspaceId)
  const rows: HomeRosterRow[] = read.active.map((record) => {
    const registered = read.readOnce.registeredOf?.(record.id) ?? null
    return {
      agentId: record.id,
      participant: registered === null ? null : { id: registered.id, name: registered.name, startedBy: registered.startedBy },
      presence: { presence: presenceOf(record.id, workspaceId, now, read.readOnce).presence },
    }
  })
  return {
    workspaceId,
    computedAt: nowStamp(),
    rows,
    counts: { agents: read.everyAgent.length, active: read.active.length, retired: read.retired },
    note: HOME_ROSTER_NOTE,
  }
}

/**
 * WHAT THE RUNS SERVING SOME AGENTS SAY THEY ARE DOING, FOR ONE GROUP HOME HAS OPENED.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Home drew each agent's doing line, the sentence the run serving it wrote about itself, until round 31
 * folded the column and dropped the line with the whole roster. The release check
 * refused that. A folded group draws no agent, so it needs no line; a group the person opens draws its
 * agents, and asks this for theirs and for nobody else's. A folded Home asks for none.
 *
 * IT IS THE ROSTER'S OWN READING, NARROWED. The line is `doingOf` on the run `servingRunOf` names, the
 * same two `whoIsWorking` uses, so the line here and the line on the page about who is working cannot
 * differ. Only the open runs are read, once, and only the serving runs' records are read for their line.
 *
 * AN ID THAT IS NOT AN ACTIVE AGENT OF THIS PROJECT IS NAMED BACK in `notActiveHere`, not answered with a
 * null line: "its run said nothing" and "there is no such agent at work here" are two different facts.
 * The route checks the ids' shape and how many are asked at once (`DOING_ASKED_AT_ONCE`).
 */
export interface HomeDoingRow {
  agentId: string
  /** What the run serving it says it is doing, in its own words. Null when no run serves it or its run never said. */
  doing: string | null
  /** The run that said it, or null when no run serves it. */
  doingFrom: string | null
}

export interface HomeDoing {
  workspaceId: string
  computedAt: string
  /** One row per asked id that is an active agent here, in the order asked. */
  rows: HomeDoingRow[]
  /** The asked ids that are not an active agent of this project. */
  notActiveHere: string[]
  note: string
}

export const HOME_DOING_NOTE =
  'WHAT THE RUNS SERVING THE ASKED AGENTS SAY THEY ARE DOING, for one group Home has opened: one row per asked ' +
  'active agent, with the sentence the run serving it wrote about itself, or null when no run serves it or its run ' +
  'never wrote one. An asked id that is not an active agent of this project is named in `notActiveHere`. It is the ' +
  'same line GET /api/working carries as `doing`, read the same way.'

export function theDoingLinesHomeDraws(workspaceId: string, asked: readonly string[]): HomeDoing {
  const active = new Set(agentsIn(workspaceId).filter(isActiveAgent).map((record) => record.id))
  const here = asked.filter((id) => active.has(id))
  const runs = listAttachments({ workspaceId, openOnly: true, namingAnAgentOnly: true })
  const serving = new Map(here.map((agentId) => [agentId, servingRunOf(agentId, runs)] as const))
  const runRecords = theRecordsOfRuns(
    workspaceId,
    [...serving.values()].flatMap((run) => (run === null ? [] : [run.id])),
  )
  return {
    workspaceId,
    computedAt: nowStamp(),
    rows: here.map((agentId) => {
      const run = serving.get(agentId) ?? null
      return { agentId, doing: doingOf(run, run === null ? undefined : runRecords.get(run.id)), doingFrom: run?.id ?? null }
    }),
    notActiveHere: asked.filter((id) => !active.has(id)),
    note: HOME_DOING_NOTE,
  }
}

/**
 * THE NARROWED READING: THE AGENTS NOBODY REGISTERED, AND NOTHING ABOUT WHO IS WORKING.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/working` answers the whole roster, and on a copy of the owner's database it took 1.65 s alone
 * (13 September 2026). Almost all of that is the per-agent work: for each of 52 active agents it
 * runs a presence reading and a last-progress query, so the roster is 52 presence readings and 52
 * queries. The front page draws none of it. Its `UnregisteredAgentsHere` panel draws exactly one
 * field of the reply, `unregistered`, which is one grouped read over `changes` and answers in 13 ms.
 *
 * So the cost was paid for rows nothing drew. This is the front page's ask, narrowed to the list it
 * draws; `whoIsWorking` above is unchanged for the page about who is working. It is NOT a cached
 * roster and NOT a second reading of the same rows: it reads `changes` once, exactly as the full
 * reply does, and it carries none of the fields it did not read — no empty `rows` a reader could
 * mistake for "nobody is working", and no zeroed counts.
 */
export interface UnregisteredSeen {
  workspaceId: string
  computedAt: string
  /** Every agent actor id that has written here and answers to no registry row, most recent first. */
  unregistered: UnregisteredAgent[]
  /** What this narrow reading is, in one paragraph, so a caller cannot read it as the whole roster. */
  note: string
}

export const UNREGISTERED_SEEN_NOTE =
  'THE AGENTS NOBODY REGISTERED, in this reading and nothing else. It carries every agent actor id that has ever ' +
  'written here and answers to no registry row, newest first, with how many writes each made. It does NOT carry ' +
  'the roster: there are no rows, no presence readings and no counts of who is working. Ask GET /api/working ' +
  'without `only=unregistered` for that.'

export function unregisteredSeen(workspaceId: string): UnregisteredSeen {
  return {
    workspaceId,
    computedAt: nowStamp(),
    unregistered: unregisteredAgentsSeen(),
    note: UNREGISTERED_SEEN_NOTE,
  }
}

/**
 * WHAT THE READING SAYS ABOUT ITSELF, IN ONE PARAGRAPH.
 *
 * The page prints this rather than counting the rows a second time. A browser that recomputed the
 * sentence could disagree with the reply it is describing, which is this repository's own defect.
 */
export function noteFor(agents: number, active: number, domains: number, storeExists: boolean): string {
  const head =
    agents === 0
      ? 'No registered agent in this project.'
      : active === 0
        ? agents === 1 ? '1 agent recorded, and it is retired.' : `${String(agents)} agents recorded, all retired.`
        : `${String(active)} of ${String(agents)} agent${agents === 1 ? '' : 's'} active.`
  const work =
    domains === 0
      ? ' No open work domain, so no overlap can be found.'
      : ` ${String(domains)} work domain${domains === 1 ? ' is' : 's are'} open.`
  const store = storeExists
    ? ''
    : ' No work state read: its table is not on this database.'
  return `${head}${work}${store}`
}
