// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BOARD'S PEOPLE AND PACKAGES, WORKED OUT EACH TIME THEY ARE ASKED: line by line, the agents whose runs act now,
 * each worker under the supervisor whose run started it, the packages each one holds, and the line's packages counted
 * by state. Nothing is stored. The shapes are in src/shared/project-people.ts, and
 * `GET /api/projects/<project>/people-and-packages` answers it.
 *
 * EACH VALUE IS READ WHERE THE OFFICE ALREADY WORKS IT OUT, never from a second copy:
 *   - which runs act: the board's `theRunsActingNow` (./project-board.ts), with the same `idleReminderHours()`;
 *   - an agent's line: `theLineOfAHandle` of its run's `servingAgent`; a package's lines: its `package.lines`;
 *   - a line's department: `readTheDepartments` and `theBoardDepartment` (./departments.ts), as the board reads it;
 *   - an agent's post: the role card on its registry row, read by `readParticipant`;
 *   - a package's state: `thePackagesCounted` (./delegation.ts), which states each package by `packageStateOf` as the
 *     delegation column draws it, a live claim included;
 *   - a worker's package: its run's `workerPackage`, read by `readTheWorkerPackage`;
 *   - which run started a worker: `started.run` on an entry of a run's `workerRuns`, read by `readTheWorkerRun`.
 *
 * NO QUERY READS A WHOLE TABLE. The requests are read by time through an index, the runs, agents and records by id, and
 * the packages and departments by kind: tests/the-project-board-reads-no-whole-table.test.ts holds every statement to
 * that. Nothing here writes.
 */
import type { PackageState } from '@shared/delegation.ts'
import { liveHere } from '@shared/live-here.ts'
import { theLineOfAHandle } from '@shared/project-board.ts'
import type {
  PackageCounts,
  PeopleAgent,
  PeopleAndPackages,
  PeopleLine,
  PeoplePackage,
  PeopleRun,
  RunningCounts,
} from '@shared/project-people.ts'
import { localStamp, parseAnyStamp } from '@shared/time.ts'
import type { PanelRecord } from '@shared/types.ts'
import { WORKER_PACKAGE, WORKER_RUNS, readTheWorkerPackage, readTheWorkerRun } from '@shared/worker-runs.ts'

import { theOneAgentAStringNames } from '../db/agent-references.ts'
import { sqlite } from '../db/client.ts'
import { idleReminderHours } from '../db/env.ts'
import { readParticipant } from '../db/read-participant.ts'
import type { RegisteredAgent } from '../db/types/participants.ts'
import { thePackagesCounted, type CountedPackage } from './delegation.ts'
import { readTheDepartments, theBoardDepartment } from './departments.ts'
import { theMasterPipeline } from './master-pipeline.ts'
import { theRunsActingNow, type AnActingRun } from './project-board.ts'
import { getRecordsWithIds } from './records.ts'

/** The two role cards this reading places by: design/permissions/roles.json names them. */
const SUPERVISOR = 'supervisor'
const WORKER = 'worker'

/** Which of a line's counts a package's state goes in, when its task is not blocked. */
const COUNTED_AS: Readonly<Record<PackageState, 'notTaken' | 'inProgress' | 'handedBack' | 'accepted'>> = {
  to_do: 'notTaken',
  taken: 'inProgress',
  aligned: 'inProgress',
  returned: 'inProgress',
  handed_back: 'handedBack',
  done: 'accepted',
}

/** The state word of a package a worker's run names that is not a readable package of this project. */
const NOT_READ = 'not-read'

function noCounts(): PackageCounts {
  return { all: 0, notTaken: 0, inProgress: 0, handedBack: 0, accepted: 0, blocked: 0 }
}

function noRunning(): RunningCounts {
  return { all: 0, supervisors: 0, workers: 0, others: 0, otherCards: [] }
}

function countIn(counts: PackageCounts, state: PackageState, blocked: boolean): void {
  counts.all += 1
  counts[blocked ? 'blocked' : COUNTED_AS[state]] += 1
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/**
 * THE PACKAGED TASKS WHOSE OWN `data.state` IS `blocked`, by id. `thePackagesCounted` reads only the four fields the
 * delegation column reads, so the blocked ones are read here, by kind through an index, in the same project.
 */
function theBlockedPackages(project: string): Set<string> {
  const rows = sqlite
    .prepare(
      "SELECT id FROM records WHERE workspace_id = ? AND kind = 'task' AND deleted_at IS NULL " +
        "AND json_type(data, '$.package') IS NOT NULL AND json_extract(data, '$.state') = 'blocked'",
    )
    .all(project) as { id: string }[]
  return new Set(rows.map((row) => row.id))
}

/** One acting run's agent, with what places it: its run, its card and its line. */
interface AnAgentNow {
  run: PanelRecord
  agent: PeopleAgent
  card: string | null
  line: string | null
}

/**
 * THE AGENT A RUN SERVES: the registry row its `servingAgentId` names, or, when it names none, the one agent its
 * `servingAgent` handle names. A run whose agent has no registry row is still listed, by the handle it gives, with
 * no post.
 */
function theAgentOf(run: PanelRecord): { id: string; handle: string; name: string; card: string | null } {
  const handle = text(run.data['servingAgent'])
  const handleNames = handle === null ? null : (theOneAgentAStringNames(sqlite, handle)?.id ?? null)
  const id = text(run.data['servingAgentId']) ?? handleNames
  const who = id === null ? null : (readParticipant({ kind: 'agent', id }) as RegisteredAgent | null)
  if (who === null) return { id: id ?? handle ?? '', handle: handle ?? '', name: handle ?? '', card: null }
  return { id: who.id, handle: who.handle, name: who.name, card: who.role ?? null }
}

/**
 * WHO TOOK A PACKAGE INSIDE: the agent its newest `takenInside` entry names, by registry id, or null when that entry
 * names no agent or there is none. A writer's id is read as `theOneAgentAStringNames` reads it, so an entry written
 * under a handle and one written under the id are the same agent.
 */
function theTakerOf(one: CountedPackage, agentNamed: (reference: string) => string | null): string | null {
  const take = one.inside?.takenInside?.at(-1)
  if (take === undefined || take.by.actorType !== 'agent') return null
  return agentNamed(take.by.actorId)
}

const inNameOrder = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true })
const byTitle = (a: PeoplePackage, b: PeoplePackage) => inNameOrder(a.title, b.title) || a.id.localeCompare(b.id)
const byHandle = (a: PeopleAgent, b: PeopleAgent) => inNameOrder(a.handle, b.handle) || a.runs[0]!.id.localeCompare(b.runs[0]!.id)
const byStart = (a: PeopleRun, b: PeopleRun) => {
  const aTime = a.startedAt === null ? null : parseAnyStamp(a.startedAt)?.getTime() ?? null
  const bTime = b.startedAt === null ? null : parseAnyStamp(b.startedAt)?.getTime() ?? null
  if (aTime === null && bTime !== null) return 1
  if (aTime !== null && bTime === null) return -1
  return (aTime ?? 0) - (bTime ?? 0) || a.id.localeCompare(b.id)
}

/** Join only agents named by id; an unnamed run always keeps its own entry. */
function putAgent(agents: PeopleAgent[], agent: PeopleAgent): void {
  const found = agent.id === '' ? undefined : agents.find((one) => one.id === agent.id)
  if (found === undefined) agents.push({ ...agent, runs: [...agent.runs] })
  else found.runs.push(...agent.runs)
}

function orderAgents(agents: PeopleAgent[]): void {
  for (const agent of agents) {
    agent.runs.sort(byStart)
    for (const run of agent.runs) orderAgents(run.workers)
  }
  agents.sort(byHandle)
}

/**
 * READ ONE PROJECT'S PEOPLE AND PACKAGES AS THEY STAND NOW. A project that is not there is the master reader's coded
 * 404: `theMasterPipeline` is asked only for that check, and its answer is not used.
 */
export function readThePeopleAndPackages(project: string, nowMs: number = Date.now()): PeopleAndPackages {
  theMasterPipeline(project)
  const withinHours = idleReminderHours()
  const acting = theRunsActingNow(project, nowMs, withinHours)
  const counted = thePackagesCounted(project).packages
  const countedById = new Map(counted.map((one) => [one.recordId, one]))
  const blocked = theBlockedPackages(project)

  // THE AGENTS ACTING NOW, one for each acting run.
  const now: AnAgentNow[] = acting.map(({ run }: AnActingRun) => {
    const who = theAgentOf(run)
    const agent: PeopleAgent = {
      id: who.id,
      handle: who.handle,
      name: who.name,
      post: who.card,
      packages: [],
      runs: [{
        id: run.id,
        title: run.title,
        startedAt: typeof run.data['startedAt'] === 'string' ? run.data['startedAt'] : null,
        model: text(run.data['model']),
        runtime: text(run.data['runtime']),
        packages: [],
        workers: [],
      }],
    }
    return { run, agent, card: who.card, line: theLineOfAHandle(text(run.data['servingAgent'])) }
  })

  // A SUPERVISOR'S PACKAGES: those whose newest inside take names it, the accepted ones left out. A writer's id is
  // resolved once, and only when a supervisor acts.
  const named = new Map<string, string | null>()
  const agentNamed = (reference: string): string | null => {
    if (!named.has(reference)) named.set(reference, theOneAgentAStringNames(sqlite, reference)?.id ?? null)
    return named.get(reference)!
  }
  const supervisors = now.filter((one) => one.card === SUPERVISOR)
  if (supervisors.length > 0) {
    const takenBy = new Map<string, PeoplePackage[]>()
    for (const one of counted) {
      if (one.state === 'done') continue
      const taker = theTakerOf(one, agentNamed)
      if (taker === null) continue
      const list = takenBy.get(taker) ?? []
      list.push({ id: one.recordId, title: one.title, state: one.state, points: [...(one.inside?.pointIds ?? [])] })
      takenBy.set(taker, list)
    }
    for (const one of supervisors) one.agent.packages = [...(takenBy.get(one.agent.id) ?? [])].sort(byTitle)
  }

  // EVERY OTHER AGENT'S PACKAGE: the one its run's `workerPackage` names, with that field's points, or none. A task
  // that is not a readable package of this project is named by its title, when one is found, as not read.
  const notCounted = new Set<string>()
  const asked = new Map<AnAgentNow, { task: string; points: string[] }>()
  for (const one of now) {
    if (one.card === SUPERVISOR) continue
    const given = readTheWorkerPackage(one.run.data[WORKER_PACKAGE])
    if (given === null) continue
    asked.set(one, { task: given.task, points: [...given.points] })
    if (!countedById.has(given.task)) notCounted.add(given.task)
  }
  const elsewhere = notCounted.size === 0 ? new Map<string, PanelRecord>() : getRecordsWithIds(notCounted)
  for (const [one, given] of asked) {
    const held = countedById.get(given.task)
    if (held !== undefined) {
      one.agent.runs[0]!.packages = [{ id: held.recordId, title: held.title, state: held.state, points: given.points }]
    } else {
      const record = elsewhere.get(given.task)
      const title = liveHere(record, project) ? record.title : ''
      one.agent.runs[0]!.packages = [{ id: given.task, title, state: NOT_READ, points: given.points }]
    }
  }

  // WHICH ACTING SUPERVISOR'S RUN STARTED EACH WORKER'S RUN, read from the `started.run` of each entry of its
  // `workerRuns`, which keeps one entry for each worker by its registry id. A worker whose starting run does not act
  // stands under no supervisor.
  const startedBy = new Map<string, AnAgentNow>()
  for (const one of supervisors) {
    const entries = one.run.data[WORKER_RUNS]
    if (entries === null || typeof entries !== 'object' || Array.isArray(entries)) continue
    for (const entry of Object.values(entries as Record<string, unknown>)) {
      const started = readTheWorkerRun(entry)?.started?.run
      if (started !== undefined) startedBy.set(started, one)
    }
  }

  // THE LINES. Each package counts on each line it names and once in the total; each agent stands in its own line,
  // except a worker, which stands under the supervisor that started it.
  const lines = new Map<string | null, PeopleLine>()
  const lineOf = (line: string | null): PeopleLine => {
    let found = lines.get(line)
    if (found === undefined) {
      found = {
        line,
        department: null,
        secretary: null,
        running: noRunning(),
        counts: noCounts(),
        supervisors: [],
        workersUnderNoSupervisor: [],
      }
      lines.set(line, found)
    }
    return found
  }
  const total = noCounts()
  const running = noRunning()
  const projectSeen = new Set<string>()
  const lineSeen = new Map<PeopleLine, Set<string>>()
  /** Count a named agent once in this scope; an unnamed agent counts once for each run. */
  const countRunning = (counts: RunningCounts, seen: Set<string>, one: AnAgentNow): void => {
    const key = one.agent.id === '' ? `run:${one.run.id}` : `agent:${one.agent.id}`
    if (seen.has(key)) return
    seen.add(key)
    counts.all += 1
    if (one.card === SUPERVISOR) counts.supervisors += 1
    else if (one.card === WORKER) counts.workers += 1
    else {
      counts.others += 1
      const card = counts.otherCards.find((entry) => entry.card === one.card)
      if (card === undefined) counts.otherCards.push({ card: one.card, count: 1 })
      else card.count += 1
    }
  }
  const countOnLine = (line: PeopleLine, one: AnAgentNow): void => {
    let seen = lineSeen.get(line)
    if (seen === undefined) { seen = new Set<string>(); lineSeen.set(line, seen) }
    countRunning(line.running, seen, one)
  }
  for (const one of counted) {
    const itsLines = [...new Set(one.lines)]
    if (itsLines.length === 0) continue
    const isBlocked = blocked.has(one.recordId)
    for (const line of itsLines) countIn(lineOf(line).counts, one.state, isBlocked)
    countIn(total, one.state, isBlocked)
  }
  for (const one of now) {
    countRunning(running, projectSeen, one)
    if (one.card === WORKER) {
      const starter = startedBy.get(one.run.id)
      if (starter !== undefined) {
        putAgent(starter.agent.runs[0]!.workers, one.agent)
        countOnLine(lineOf(starter.line), one)
      } else {
        const line = lineOf(one.line)
        putAgent(line.workersUnderNoSupervisor, one.agent)
        countOnLine(line, one)
      }
      continue
    }
    const line = lineOf(one.line)
    putAgent(line.supervisors, one.agent)
    countOnLine(line, one)
  }
  const orderCards = (counts: RunningCounts): void => {
    counts.otherCards.sort((a, b) => a.card === null ? (b.card === null ? 0 : 1) : b.card === null ? -1 : inNameOrder(a.card, b.card))
  }
  orderCards(running)

  // EACH LINE'S DEPARTMENT, read once for the project, and the order: name order, the line not recorded last.
  const departments = [...lines.keys()].some((line) => line !== null) ? readTheDepartments(project) : null
  const ordered = [...lines.values()].sort((a, b) => (a.line === null ? 1 : b.line === null ? -1 : inNameOrder(a.line, b.line)))
  for (const line of ordered) {
    if (line.line !== null && departments !== null) line.department = theBoardDepartment(departments.aCodeNames(line.line))
    orderCards(line.running)
    orderAgents(line.supervisors)
    orderAgents(line.workersUnderNoSupervisor)
  }

  return { project, at: localStamp(new Date(nowMs)), actingWithinHours: withinHours, lines: ordered, running, total }
}
