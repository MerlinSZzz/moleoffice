// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * One read of presence, personal words and office-observed flow for explicitly requested identities.
 *
 * WITH scope 'home' EACH AGENT IS READ IN ITS HOME PROJECT, WHICHEVER PROJECT ASKS (wave 13y round 111). The chat belongs
 * to no project. On 30 October 2026 a secretary's chat opened from a project it is not registered in showed a grey dot
 * and no runs, because each read answered for the page's project only. An agent's home is the project of its own record,
 * the project of the session holding its handle, and each project where a run of it has not ended, or carries a message
 * to hand over and is still inside its wait (`theHomesOf`). It is read there as a read of that project reads it, and
 * each of its runs names its project. Only an agent no home answers for is read in every project. This is for every
 * agent, not secretaries only: the page's project decided what any agent read as, whatever its role. Without the scope
 * the read answers for the page's project as before.
 */
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { PLUGIN_READ_INTERFACE, type PluginAgentStatus, type PluginStatusFlow, type PluginStatusView } from '../../../shared/plugin-read.ts'
import { howARunStands } from '../../../shared/releasing.ts'
import { momentOfAStoredStamp } from '../../../shared/time.ts'
import { db, sqlite } from '../../db/client.ts'
import { records } from '../../db/schema.ts'
import { eachAgentsIdentityReadOnce } from '../agent-references.ts'
import { enteredOf } from '../entered-flows.ts'
import { theFlowRunsOf, type FlowRunStep } from '../flow-runs.ts'
import { theAgentsOfTheseRuns } from '../inspection.ts'
import { type RegisteredAgent } from '../participants.ts'
import { participantForActor } from '../participant-for-actor.ts'
import { theseAgentsInTheRegistrysOrder } from '../../db/these-agents-in-the-registrys-order.ts'
import { thePresenceOf, theRunsWhereOneOfTheseCanBeReached, theUnreleasedProcessRowsOnce, type ParticipantPresenceReading } from '../presence.ts'
import { theseAgentsOnly } from '../../db/these-agents-only.ts'
import { readTheOffice, type TheOfficeRead } from '../pixel-office.ts'
import { getRecord, type Actor } from '../records.ts'
import { theFiledAliasesReadOnce, type TheFiledAliases } from '../registry-aliases/runs.ts'
import { listWorkspaces } from '../../db/list-workspaces.ts'
import type { ParticipantRef } from '../../../shared/participants.ts'
import type { PanelRecord } from '../../../shared/types.ts'

/** Project references are kept in this project, including when a damaged record names another project's row. */
function observedFlow(record: PanelRecord, workspaceId: string, steps: readonly FlowRunStep[]): PluginStatusFlow {
  const named = record.data['flow']
  const held = typeof named === 'string' ? getRecord(named) : null
  const flow = held?.kind === 'flow' && held.deletedAt === null && held.workspaceId === workspaceId ? held : null
  const step = steps.at(-1)
  if (step !== undefined && (typeof step.does !== 'string' || typeof step.outcome !== 'string' || typeof (step.endedAt ?? step.startedAt) !== 'string')) {
    throw new Error('The last observed step could not be read.')
  }
  return {
    record: { id: record.id, title: record.title },
    flow: typeof named !== 'string' ? null : { id: named, title: flow?.title ?? null },
    lastStep: step === undefined ? null : { does: step.does, outcome: step.outcome, at: step.endedAt ?? step.startedAt, atMs: momentOfAStoredStamp(step.endedAt ?? step.startedAt, undefined) },
  }
}

export function readAgentStatus(
  workspaceId: string, actor: Actor, asked: readonly string[], scope: 'workspace' | 'home' = 'workspace', aliases: TheFiledAliases = theFiledAliasesReadOnce(sqlite),
): Omit<PluginStatusView, 'narrowedByPermission'> {
  const ids = [...new Set(asked)]
  const base = { interface: PLUGIN_READ_INTERFACE, view: 'status' as const, project: workspaceId }
  if (ids.length === 0) return { ...base, agents: [], notAgents: [] }
  if (scope === 'workspace') {
    const agents = theStatusIn(readTheOffice(workspaceId, actor, 'workspace', ids, aliases), ids, false)
    return { ...base, agents, notAgents: ids.filter(id => !agents.some(agent => agent.id === id)) }
  }
  const homes = theHomesOf(ids, theAgentsAndTheirNeedles(ids, aliases))
  const answers = new Map<string, PluginAgentStatus[]>()
  for (const [project, homed] of byProject(ids, homes)) {
    for (const agent of theStatusIn(readTheOffice(project, actor, 'workspace', homed, aliases), homed, true)) answers.set(agent.id, [...answers.get(agent.id) ?? [], agent])
  }
  // AN AGENT NO HOME ANSWERS FOR IS READ IN EVERY PROJECT: one with no own record and no hold, or whose home projects are
  // gone, or where it has no record and no run. Each registered agent is answered, as the chat draws every one.
  const elsewhere = ids.filter(id => homes.has(id) && !answers.has(id))
  if (elsewhere.length > 0) for (const agent of theStatusIn(readTheOffice(workspaceId, actor, 'office', elsewhere, aliases), elsewhere, true)) answers.set(agent.id, [agent])
  const agents = ids.flatMap(id => {
    const read = answers.get(id)
    return read === undefined ? [] : [atHome(read)]
  })
  return { ...base, agents, notAgents: ids.filter(id => !answers.has(id)) }
}

/**
 * THE STATUS OF THESE AGENTS IN ONE READING OF THE OFFICE: of one project, or of every project. An agent the reading does
 * not draw is left out. `named` adds each run's project, for a read whose runs may be in a project other than the page's.
 */
function theStatusIn(office: TheOfficeRead, ids: readonly string[], named: boolean): PluginAgentStatus[] {
  const projects = office.projects.map(project => project.id)
  const selected = office.agents()
  const byId = new Map(selected.map(agent => [agent.id, agent]))
  const agents: PluginAgentStatus[] = ids.flatMap(id => {
    const agent = byId.get(id)
    if (agent === undefined) return []
    let presence: PluginAgentStatus['presence'] = { available: false }
    try {
      const read = office.presenceOf(agent)
      const reading = office.scope === 'office' ? read.presence : read.presenceByProject.find(one => one.workspaceId === projects[0])?.reading
      if (reading !== undefined) presence = { available: true, value: { colour: reading.colour, word: reading.word, says: reading.says } }
    } catch { /* A failed read carries no invented presence. */ }
    return [{ id, retired: agent.retired, personal: agent.state === null ? null : { text: agent.state, setAt: agent.stateAt, setBy: agent.stateBy }, presence, flow: { available: false } }]
  })
  try {
    // THE RUNS THE READING ALREADY HOLDS: those that could be these agents', found by the same needles, so a run stored
    // under an id filed as an alias is found. Of them, only the runs of the agents drawn are kept below.
    const sessions = office.sessions()
    const owners = theAgentsOfTheseRuns(sessions, () => selected, eachAgentsIdentityReadOnce(sqlite))
    const unsettled = sessions.filter(run => {
      if (!byId.has(owners.get(run.id) ?? '')) return false
      const standing = howARunStands(run.data).standing
      return standing !== 'closed' && standing !== 'superseded' && standing !== 'closed unchecked'
    })
    const runIds = unsettled.map(run => run.id)
    // Only entered flows of these runs. Each run's own log is read below, of every run in one statement.
    const entered = runIds.length === 0 ? [] : db.select().from(records).where(and(
      inArray(records.workspaceId, projects), eq(records.kind, 'flow_run'), isNull(records.deletedAt),
      inArray(sql<string>`json_extract(${records.data}, '$.run')`, runIds),
      sql`json_extract(${records.data}, '$.entered') IS NOT NULL`,
    )).orderBy(records.createdAt, records.id).all() as PanelRecord[]
    const ownFlows = theFlowRunsOf(runIds)
    for (const agent of agents) {
      const runs: Extract<PluginAgentStatus['flow'], { available: true }>['value']['runs'] = []
      for (const run of unsettled) {
        if (owners.get(run.id) !== agent.id) continue
        const flows: PluginStatusFlow[] = []
        const own = ownFlows.get(run.id)
        // A RUN'S FLOWS ARE READ IN THE RUN'S OWN PROJECT, which in a read of one project is that project.
        if (own !== undefined) {
          if (own.workspaceId !== run.workspaceId) throw new Error('The recorded flow belongs to another project.')
          const record = getRecord(own.id)
          if (record === null) throw new Error('The recorded flow could not be read.')
          flows.push(observedFlow(record, run.workspaceId, own.steps))
        }
        for (const record of entered) {
          if (record.data['run'] !== run.id || record.workspaceId !== run.workspaceId || enteredOf(record) === null || record.data['ended'] != null) continue
          const steps = record.data['stepsTaken']
          if (!Array.isArray(steps)) throw new Error('The observed steps could not be read.')
          flows.push(observedFlow(record, run.workspaceId, steps as FlowRunStep[]))
        }
        runs.push({
          run: {
            id: run.id, title: run.title,
            startedAt: typeof run.data['startedAt'] === 'string' ? run.data['startedAt'] : null,
            startedAtMs: momentOfAStoredStamp(run.data['startedAt'], run.data['startedTime']),
          },
          ...(named ? { project: run.workspaceId } : {}),
          standing: howARunStands(run.data).standing, flows,
        })
      }
      agent.flow = { available: true, value: { runs } }
    }
  } catch {
    // Presence and personal words still stand when a flow read fails. Partial flow reads are never called complete.
    for (const agent of agents) agent.flow = { available: false }
  }
  return agents
}

/**
 * ONE AGENT'S STATUS FROM THE READS OF ITS HOME PROJECTS, in the order of its homes. The dot is the first green one, or
 * else the first home's, as the office map picks a dot from many projects. Its runs are those of every home, and are
 * whole only when every home's were read.
 */
function atHome(read: readonly PluginAgentStatus[]): PluginAgentStatus {
  const [first] = read
  const presence = read.find(one => one.presence.available && one.presence.value.colour === 'green')?.presence ?? first!.presence
  const runs = read.flatMap(one => one.flow.available ? one.flow.value.runs : [])
  return { ...first!, presence, flow: read.every(one => one.flow.available) ? { available: true, value: { runs } } : { available: false } }
}

/** The registered agents among these ids, the filed aliases, and the needles that find the runs that could be theirs. */
function theAgentsAndTheirNeedles(ids: readonly string[], aliases: TheFiledAliases = theFiledAliasesReadOnce(sqlite)) {
  const registered = theseAgentsInTheRegistrysOrder(ids)
  return { aliases, registered, named: theseAgentsOnly(registered.map(agent => agent.id), registered.map(agent => agent.handle), aliases) }
}

/**
 * EACH REGISTERED AGENT'S HOME PROJECTS: the projects of its own records, newest first, then the project of the session
 * holding its handle, in one statement, and then each project where a run of it has not ended, or carries a message to
 * hand over and is still inside its wait, newest run first. Only projects the office still has are kept. An id no
 * registry holds is not in the answer. An agent with no own record, no hold and no such run, or whose home projects are
 * gone, has none.
 *
 * A RUN IS THE AGENT'S AS THE FLOW LINE COUNTS IT (`theAgentsOfTheseRuns`), among the rows its needles find in every
 * project (`theRunsWhereOneOfTheseCanBeReached`). Wave 13y round 111: an agent with its own record in one project and a
 * run going in another read grey from every project, where that project read it green. A running run is where the agent
 * is, and so is a run still inside its wait. A run whose message was handed over and whose wait is over is not: counted,
 * it made every project a home on the made-up office, where every agent has such runs in every project.
 */
export function theHomesOf(agentIds: readonly string[], theirs: { registered: readonly RegisteredAgent[]; named: { needles: readonly string[] } }): Map<string, string[]> {
  const rows = sqlite.prepare(
    'SELECT a.id AS agent, NULL AS project, 0 AS place, NULL AS at, 0 AS n FROM agents a WHERE a.id IN (SELECT value FROM json_each(?)) ' +
      'UNION ALL SELECT m.agent_id, r.workspace_id, 1, r.created_at, r.rowid FROM agent_records m CROSS JOIN records r ON r.id = m.record_id ' +
      'WHERE m.agent_id IN (SELECT value FROM json_each(?)) AND r.deleted_at IS NULL ' +
      'UNION ALL SELECT h.agent_id, s.workspace_id, 2, NULL, 0 FROM handle_holds h CROSS JOIN records s ON s.id = h.session_record_id ' +
      'WHERE h.agent_id IN (SELECT value FROM json_each(?)) AND h.released_at IS NULL AND s.deleted_at IS NULL ' +
      'ORDER BY place ASC, at DESC, n DESC',
  ).all(...Array.from({ length: 3 }, () => JSON.stringify(agentIds))) as { agent: string; project: string | null }[]
  const kept = new Set(listWorkspaces().map(project => project.id))
  const homes = new Map<string, string[]>()
  for (const { agent, project } of rows) {
    const held = homes.get(agent)
    if (project === null) homes.set(agent, [])
    else if (held !== undefined && kept.has(project) && !held.includes(project)) held.push(project)
  }
  if (theirs.registered.length === 0) return homes
  const identityOf = eachAgentsIdentityReadOnce(sqlite)
  const reached = theRunsWhereOneOfTheseCanBeReached(theirs.named.needles, identityOf)
  const owners = theAgentsOfTheseRuns(reached, () => theirs.registered, identityOf)
  for (const run of reached) {
    const held = homes.get(owners.get(run.id) ?? '')
    if (held !== undefined && kept.has(run.workspaceId) && !held.includes(run.workspaceId)) held.push(run.workspaceId)
  }
  return homes
}

/** The ids each project is home to, in the order asked, for one reading of each project. */
function byProject(ids: readonly string[], homes: ReadonlyMap<string, readonly string[]>): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const id of ids) for (const project of homes.get(id) ?? []) out.set(project, [...out.get(project) ?? [], id])
  return out
}

/**
 * THE DOTS OF THESE PARTICIPANTS, EACH AGENT READ IN ITS HOME PROJECT (wave 13y round 111), for GET
 * /api/presence?of=…&scope=home. Each registered agent's dot is read as a read of its home project reads it, by the same
 * home and the same pick as `readAgentStatus` with that scope. An agent no home answers for is read in every project, from
 * the reading of the office `readAgentStatus` makes for it. A person, and an id no registry holds, is read in the project
 * asked from, as without the scope.
 *
 * Each project reads only the runs its dots read that could be the runs of the agents asked (`theirRunsTheDotsRead` in
 * lib/presence.ts), with one reading of the filed aliases and the process rows for every project. Fifty contact rows can
 * be at home in ten projects, and reading every run of each was ten times today's one project.
 */
export function thePresenceAtHome(whos: readonly ParticipantRef[], workspaceId: string, actor: Actor, now: Date): ParticipantPresenceReading[] {
  const askedBy = participantForActor(actor)
  const agentIds = [...new Set(whos.filter(who => who.kind === 'agent').map(who => who.id))]
  const { aliases, registered, named } = theAgentsAndTheirNeedles(agentIds)
  const homes = theHomesOf(agentIds, { registered, named })
  const theirRunsOnly = { named, aliases, processes: theUnreleasedProcessRowsOnce(named.recordsOf, aliases) }
  const homeOf = (who: ParticipantRef) => who.kind === 'agent' ? homes.get(who.id) : undefined
  const asked = new Map<string, ParticipantRef[]>()
  const ask = (project: string, who: ParticipantRef) => {
    const there = asked.get(project) ?? []
    if (!there.includes(who)) asked.set(project, [...there, who])
  }
  for (const who of whos) {
    const home = homeOf(who)
    if (home === undefined) ask(workspaceId, who)
    else for (const project of home) ask(project, who)
  }
  const read = new Map<ParticipantRef, ParticipantPresenceReading[]>()
  for (const [project, there] of asked) {
    thePresenceOf(there, project, now, askedBy, false, undefined, undefined, theirRunsOnly).forEach((reading, at) => read.set(there[at]!, [...read.get(there[at]!) ?? [], reading]))
  }
  const elsewhere = [...new Set(whos.filter(who => homeOf(who)?.length === 0).map(who => who.id))]
  const office = elsewhere.length === 0 ? null : readTheOffice(workspaceId, actor, 'office', elsewhere)
  const acrossTheOffice = new Map((office?.agents() ?? []).map(agent => [agent.id, office!.presenceOf(agent).presence]))
  return whos.map(who => {
    const readings = read.get(who)
    if (readings !== undefined) return readings.find(one => one.colour === 'green') ?? readings[0]!
    const across = acrossTheOffice.get(who.id)
    if (across === undefined) throw new Error(`The reading of every project did not draw the registered agent ${who.id}, which it draws whatever its projects.`)
    return across
  })
}
