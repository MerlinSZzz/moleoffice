// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO ANSWERS FOR AN AGENT, CHANGED BY THE PERSON'S PRESS. Wave 13u, round 186.
 *
 * An agent's starter answers for it: who may give it keys, where its letters and seal notices go, and who may ask for its
 * next round. The registry row holds the starter (agents.started_by_kind and started_by_id), and each of the agent's
 * records holds it as `startedBy`. No record write moves it (`checkNobodyIsMovingAStarter` in lib/records.ts); this is
 * the one way it moves, and each move is kept in agent_starter_changes.
 *
 * THE CHECKS, asked the same way by the preview and the press, so what the person read before pressing is what the press
 * does. The agent is registered, is not retired and is not Mole Office's own row. The new starter is the person, or a
 * registered agent that is not retired and is not the agent itself; another person is refused. It is not the starter
 * the agent has now. Following the starters up from it does not come back to the agent, and reaches the person.
 *
 * WHO MAY PRESS: the person, or inside a test world one who holds the person's authority there. A secretary's raise does
 * not carry it: the door is on the secretary card's `neverPresses`, so `aRaiseCarriesIt` refuses a raised secretary in
 * its own words. A secretary may be moved; the preview says when the agent is one.
 *
 * RUNS THAT HAVE NOT ENDED. A press waits until the last run ends, while new runs are held. The person may withdraw it
 * or make the same change at once. The history keeps the runs that were live when the change was requested.
 *
 * THE ROW IS WRITTEN FIRST, THEN THE RECORDS. Once the row holds the new starter, a record write carrying it is not a
 * change of starter, so `checkNobodyIsMovingAStarter` lets the record writes through without a door of its own. Each
 * record write is an ordinary revision. A deferred application is written by the office, while the history keeps the
 * original asker. All of it, with the history row and the lines, is one transaction.
 */

import { sqlite } from '../db/client.ts'
import { giveTheFill } from '../db/part-tables.ts'
import type { ANamedParticipant } from '@shared/agent-renames.ts'
import type { AStarterChange, AStarterMove, HowTheNewStarterWasRead, StarterChangeState, WhoAnswersForAnAgent } from '@shared/agent-starter.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { MOLE_OFFICE_IS_NOT_YOURS_TO_CHANGE, isMoleOffice, moleOffice, type ParticipantRef } from '@shared/participants.ts'
import { THE_PERSON } from '@shared/person.ts'
import { nowStamp } from '@shared/time.ts'
import { theRunsOfTheAgentThatHaveNotEnded } from './agent-move.ts'
import { announce } from './events.ts'
import { writeASystemLineToOne } from './groups.ts'
import { theLiveHoldOnSession } from './handles.ts'
import { anOfficeId } from './ids.ts'
import { theAgentOfARun } from './inspection.ts'
import { theRunHasEnded } from '@shared/run-has-ended.ts'
import { holdsTheSecretaryCard } from './holds-the-secretary-card.ts'
import { everyAgentASessionsDataNames } from './messages.ts'
import {
  type AStarter,
  type RegisteredAgent,
} from './participants.ts'
import { everyAgentOnTheRoster } from '../db/every-agent-on-the-roster.ts'
import { participantForActor } from './participant-for-actor.ts'
import { theAgentAnArrivingReferenceNames } from './the-agent-an-arriving-reference-names.ts'
import { theChainUpWith } from '@shared/the-chain-up-with.ts'
import { theStarterEachStringNames } from './the-starter-each-string-names.ts'
import { readParticipant } from '../db/read-participant.ts'
import { aRaiseCarriesIt, createRecord, patchRecord, type Actor } from './records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from './panel-error.ts'
import { theNameOf } from '@shared/participant-name.ts'

interface AStarterChangeRow {
  id: string
  agent_id: string
  from_kind: 'person' | 'agent' | null
  from_id: string | null
  to_kind: 'person' | 'agent'
  to_id: string
  asked_by_kind: 'person' | 'agent'
  asked_by_id: string
  because: string
  asked_at: string
  state: StarterChangeState
  applied_at: string | null
  refused_because: string | null
  runs_not_ended: string
}

function named(who: ParticipantRef): ANamedParticipant {
  return { kind: who.kind, id: who.id, name: theNameOf(readParticipant(who), who.id) }
}

function onTheWire(row: AStarterChangeRow): AStarterChange {
  return {
    id: row.id,
    agent: row.agent_id,
    from: row.from_kind === null || row.from_id === null ? null : named({ kind: row.from_kind, id: row.from_id }),
    to: named({ kind: row.to_kind, id: row.to_id }),
    askedBy: named({ kind: row.asked_by_kind, id: row.asked_by_id }),
    because: row.because,
    askedAt: row.asked_at,
    state: row.state,
    appliedAt: row.applied_at,
    refusedBecause: row.refused_because,
    runsNotEnded: JSON.parse(row.runs_not_ended) as string[],
  }
}

function theChangesOf(agentId: string): AStarterChange[] {
  const rows = sqlite
    .prepare('SELECT * FROM agent_starter_changes WHERE agent_id = ? ORDER BY asked_at DESC, rowid DESC')
    .all(agentId) as AStarterChangeRow[]
  return rows.map(onTheWire)
}

/** The waiting change's words, shared by the run create gate and the next-round reader. */
export function aWaitingStarterChangeSays(agentId: string): string | null {
  const row = sqlite.prepare("SELECT * FROM agent_starter_changes WHERE agent_id = ? AND state = 'waiting'").get(agentId) as AStarterChangeRow | undefined
  if (row === undefined) return null
  const to = named({ kind: row.to_kind, id: row.to_id })
  return `Starter change ${row.id} waits to make "${to.name}" the new starter. To withdraw it, the person sends {"withdraw":true} to POST /api/agents/${agentId}/starter.`
}

/** The person takes back a waiting change; the recorded request remains as history. */
export function withdrawAWaitingStarterChange(reference: string, actor: Actor): AStarterChange {
  if (!thePersonIsProved(actor) && actor.theOwnersAuthority?.holds !== true && !aRaiseCarriesIt(actor)) {
    throw new PanelError('Only the person may withdraw a waiting starter change. Nothing was changed.', 403)
  }
  return sqlite.transaction(() => {
    const agent = theAgentOrARefusal(reference, ' Nothing was changed.')
    const row = sqlite.prepare("SELECT * FROM agent_starter_changes WHERE agent_id = ? AND state = 'waiting'").get(agent.id) as AStarterChangeRow | undefined
    if (row === undefined) throw new PanelError(`No starter change is waiting for "${agent.name}". Nothing was changed.`, 409)
    sqlite.prepare("UPDATE agent_starter_changes SET state = 'withdrawn' WHERE id = ?").run(row.id)
    return onTheWire(sqlite.prepare('SELECT * FROM agent_starter_changes WHERE id = ?').get(row.id) as AStarterChangeRow)
  })()
}

/** An already-ended session was never a new live run and does not need the hold. */
export function refuseANewRunWhileAStarterChangeWaits(data: unknown, actor: Actor): void {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return
  const run = data as Record<string, unknown>
  if (theRunHasEnded(run['state'])) return
  const agents = everyAgentASessionsDataNames(data)
  if (run['heldByItsFiler'] === true) {
    const filer = participantForActor(actor)
    if (filer?.kind === 'agent' && !agents.some((one) => one.id === filer.id)) agents.push(filer)
  }
  for (const agent of agents) {
    const waiting = aWaitingStarterChangeSays(agent.id)
    if (waiting !== null) throw new PanelError(`${waiting} No new run was filed.`, 409)
  }
}

/** Gate only agents newly reached by a live session, including a current handle hold. */
export function refuseARunEnteringALiveSet(runId: string, before: unknown, after: unknown): void {
  if (before === null && after === null) return
  const agents = (data: unknown): ParticipantRef[] => {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return []
    if (theRunHasEnded((data as Record<string, unknown>)['state'])) return []
    const named = everyAgentASessionsDataNames(data)
    const held = theLiveHoldOnSession(runId, true)
    if (held !== null && !named.some((one) => one.id === held.agent.id)) named.push({kind: 'agent', id: held.agent.id})
    return named
  }
  const was = new Set(agents(before).map((one) => one.id))
  const workspace = (sqlite.prepare('SELECT workspace_id FROM records WHERE id = ?').get(runId) as {workspace_id: string}).workspace_id
  const selected = (data: unknown): string | null => {
    if (typeof data !== 'object' || data === null || Array.isArray(data) || theRunHasEnded((data as Record<string, unknown>)['state'])) return null
    return theAgentOfARun({workspaceId: workspace, data: data as Record<string, unknown>})?.id ?? theLiveHoldOnSession(runId, true)?.agent.id ?? null
  }
  const beforeSelected = selected(before)
  const afterSelected = selected(after)
  const arriving = agents(after)
  if (afterSelected !== null && !arriving.some((one) => one.id === afterSelected)) arriving.push({kind: 'agent', id: afterSelected})
  for (const agent of arriving) {
    if (was.has(agent.id) && !(afterSelected === agent.id && beforeSelected !== afterSelected)) continue
    const waiting = aWaitingStarterChangeSays(agent.id)
    if (waiting !== null) throw new PanelError(`${waiting} No new run was filed.`, 409)
  }
}

/** The agent a reference names, or the refusal: none registered, Mole Office's own row, or retired. */
export function theAgentOrARefusal(reference: string, nothing: string): RegisteredAgent {
  const found = theAgentAnArrivingReferenceNames(reference, 'reading')
  if (found === null) throw new PanelError(`No agent is registered as "${reference}".${nothing}`, 404)
  if (isMoleOffice({ kind: 'agent', id: found.agent.id })) throw new PanelError(`${MOLE_OFFICE_IS_NOT_YOURS_TO_CHANGE}${nothing}`, 403)
  const row = readParticipant({ kind: 'agent', id: found.agent.id }) as RegisteredAgent | null
  if (row === null) throw new PanelError(`No agent is registered as "${reference}".${nothing}`, 404)
  if (row.retired) {
    throw new PanelError(`"${row.name}" is retired, and nobody answers for a retired agent's work any more.${nothing}`, 409)
  }
  return row
}

/** A starter as the registry reads it: an agent by the id of the row its stored string names, or a person as stored. */
function asTheRegistryReadsIt(who: ParticipantRef | null, reader: (id: string) => AStarter | null): ParticipantRef | null {
  if (who === null || who.kind === 'person') return who
  const row = reader(who.id)
  return row === null ? who : { kind: 'agent', id: row.id }
}

/** The new starter a press names, read as the doors read a reference, or the refusal of it. */
function theNewStarter(said: string, agent: RegisteredAgent, nothing: string): { to: ParticipantRef; readAs: HowTheNewStarterWasRead } {
  const reference = said.trim()
  if (reference === '') throw new PanelError(`Name the new starter in "to": the person, or an agent by its id or handle.${nothing}`, 400)
  if (reference === THE_PERSON) return { to: { kind: 'person', id: THE_PERSON }, readAs: 'the person' }
  if (readParticipant({ kind: 'person', id: reference }) !== null) {
    throw new PanelError(
      `"${reference}" is a person other than the one this office is for. Only that person, or an agent whose starters ` +
        `lead up to them, answers for an agent here.${nothing}`,
      400,
    )
  }
  const found = theAgentAnArrivingReferenceNames(reference, 'reading')
  if (found === null) throw new PanelError(`No agent is registered as "${reference}", so it cannot answer for "${agent.name}".${nothing}`, 404)
  if (found.agent.id === agent.id) throw new PanelError(`"${agent.name}" cannot answer for itself.${nothing}`, 400)
  if (found.agent.retired) {
    throw new PanelError(`"${found.agent.name}" is retired, and a retired agent cannot answer for "${agent.name}".${nothing}`, 409)
  }
  return { to: { kind: 'agent', id: found.agent.id }, readAs: found.how === 'an-id' ? 'an agent by its id' : 'the one live agent with this handle' }
}

/** The first agent on this chain that holds the secretary card, or null where none does. */
function theFirstSecretaryOn(chain: readonly ParticipantRef[]): ANamedParticipant | null {
  const first = chain.find((who) => who.kind === 'agent' && holdsTheSecretaryCard(who))
  return first === undefined ? null : named(first)
}

/** How many live agents have this agent on their chain of starters, read with the one walk the routing reads. */
function theAgentsBelow(agentId: string, reader: (id: string) => AStarter | null): number {
  let below = 0
  for (const one of everyAgentOnTheRoster()) {
    if (one.retired || one.id === agentId) continue
    if (theChainUpWith(one.startedBy, reader).chain.some((who) => who.kind === 'agent' && who.id === agentId)) below += 1
  }
  return below
}

/** The agent's live records, in every project, which hold its starter as `startedBy`. */
function theRecordsOf(agentId: string): { id: string; project: string }[] {
  return sqlite
    .prepare(
      `SELECT r.id AS id, r.workspace_id AS project FROM agent_records a JOIN records r ON r.id = a.record_id
        WHERE a.agent_id = ? AND r.deleted_at IS NULL ORDER BY r.workspace_id, r.id`,
    )
    .all(agentId) as { id: string; project: string }[]
}

/** WHO ANSWERS FOR AN AGENT NOW, and each change of it, newest first. Anybody who may read the office may read it. */
export function whoAnswersFor(reference: string): WhoAnswersForAnAgent {
  const found = theAgentAnArrivingReferenceNames(reference, 'reading')
  const agent = found === null ? null : (readParticipant({ kind: 'agent', id: found.agent.id }) as RegisteredAgent | null)
  if (agent === null) throw new PanelError(`No agent is registered as "${reference}".`, 404)
  const reader = theStarterEachStringNames()
  const starter = asTheRegistryReadsIt(agent.startedBy, reader)
  const chain = theChainUpWith(agent.startedBy, reader)
  return {
    agent: { id: agent.id, handle: agent.handle, name: agent.name },
    starter: starter === null ? null : named(starter),
    reachesThePerson: chain.reachesThePerson,
    chainSays: chain.says,
    changes: theChangesOf(agent.id),
  }
}

/**
 * CHANGE WHO ANSWERS FOR AN AGENT, or with `dryRun` say what the change would do and write nothing.
 *
 * `reference` is the agent's id or handle; `to` is the person's id, or an agent's id or handle. A preview needs no
 * reason and anybody may read it. A press needs a reason in `because`. It waits for live runs unless `atOnce` is set.
 */
export function changeWhoAnswersFor(
  reference: string,
  input: { to: string; because?: string; atOnce?: boolean; dryRun?: boolean },
  actor: Actor,
  workspaceId: string,
): AStarterMove {
  return changeWhoAnswersForInternal(reference, input, actor, workspaceId, false)
}

function changeWhoAnswersForInternal(
  reference: string,
  input: { to: string; because?: string; atOnce?: boolean; dryRun?: boolean },
  actor: Actor,
  workspaceId: string,
  deferred: boolean,
): AStarterMove {
  const dryRun = input.dryRun ?? false
  const nothing = dryRun ? '' : ' Nothing was changed.'
  if (!dryRun && !deferred && !thePersonIsProved(actor) && actor.theOwnersAuthority?.holds !== true && !aRaiseCarriesIt(actor)) {
    throw new PanelError(
      "Only the person changes who answers for an agent, on the agent's page. An agent may not change its own starter or " +
        'another agent\'s. Nothing was changed.',
      403,
    )
  }
  const askedBy: ParticipantRef | null = deferred ? moleOffice() : thePersonIsProved(actor) ? { kind: 'person', id: THE_PERSON } : participantForActor(actor)
  if (!dryRun && askedBy === null) {
    throw new PanelError(`This request was made by "${actor.id}", and no person or agent answers to it. Nothing was changed.`, 403)
  }
  const because = (input.because ?? '').trim()
  if (!dryRun && because === '') {
    throw new PanelError('Say in "because" why the starter changes. The agent and both starters are told it. Nothing was changed.', 400)
  }

  const work = (): AStarterMove => {
    const agent = theAgentOrARefusal(reference, nothing)
    const { to, readAs } = theNewStarter(input.to, agent, nothing)
    const reader = theStarterEachStringNames()
    const from = asTheRegistryReadsIt(agent.startedBy, reader)
    const toNamed = named(to)
    if (from !== null && from.kind === to.kind && from.id === to.id) {
      throw new PanelError(`"${toNamed.name}" already answers for "${agent.name}".${nothing}`, 409)
    }
    const chain = theChainUpWith(to, reader)
    if (chain.chain.some((who) => who.kind === 'agent' && who.id === agent.id)) {
      throw new PanelError(
        `Following the starters up from "${toNamed.name}" comes to "${agent.name}" itself, so making it the starter would ` +
          `make a loop, and a chain that goes round reaches nobody.${nothing}`,
        409,
      )
    }
    if (!chain.reachesThePerson) {
      throw new PanelError(`"${toNamed.name}" cannot answer for "${agent.name}": ${chain.says}${nothing}`, 409)
    }
    const pending = sqlite.prepare("SELECT * FROM agent_starter_changes WHERE agent_id = ? AND state = 'waiting'").get(agent.id) as AStarterChangeRow | undefined
    if (!dryRun && pending !== undefined && (input.atOnce !== true || pending.to_kind !== to.kind || pending.to_id !== to.id)) {
      throw new PanelError(`Starter change ${pending.id} already waits. Withdraw it before asking for another change, or press at once for the same starter.${nothing}`, 409)
    }
    const runsNotEnded = theRunsOfTheAgentThatHaveNotEnded(agent.id)
    const records = theRecordsOf(agent.id)
    const answer: AStarterMove = {
      agent: { id: agent.id, handle: agent.handle, name: agent.name },
      dryRun,
      from: from === null ? null : named(from),
      to: toNamed,
      toWasReadAs: readAs,
      isASecretary: holdsTheSecretaryCard({ kind: 'agent', id: agent.id }),
      agentsBelow: theAgentsBelow(agent.id, reader),
      firstSecretaryUp: {
        before: theFirstSecretaryOn(theChainUpWith(agent.startedBy, reader).chain),
        after: theFirstSecretaryOn(chain.chain),
      },
      runsNotEnded,
      records,
      change: null,
      told: [],
      note: '',
    }
    if (dryRun) {
      answer.note =
        `Pressed, "${toNamed.name}" would answer for "${agent.name}" in place of ` +
        `${answer.from === null ? 'nobody, since nobody recorded a starter' : `"${answer.from.name}"`}, and ` +
        `${records.length === 1 ? 'its record says' : `its ${records.length} records say`} so. Nothing was written.`
      return answer
    }

    if (runsNotEnded.length > 0 && input.atOnce !== true) {
      const id = anOfficeId()
      const pressedBy = askedBy as ParticipantRef
      sqlite.prepare(
        'INSERT INTO agent_starter_changes (id, agent_id, from_kind, from_id, to_kind, to_id, asked_by_kind, asked_by_id, ' +
          "because, asked_at, state, applied_at, refused_because, runs_not_ended) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting', NULL, NULL, ?)",
      ).run(id, agent.id, from?.kind ?? null, from?.id ?? null, to.kind, to.id, pressedBy.kind, pressedBy.id, because, nowStamp(), JSON.stringify(runsNotEnded.map((run) => run.id)))
      answer.change = onTheWire(sqlite.prepare('SELECT * FROM agent_starter_changes WHERE id = ?').get(id) as AStarterChangeRow)
      answer.note = aWaitingStarterChangeSays(agent.id) as string
      return answer
    }

    // THE ROW FIRST, so the record writes below carry the starter the row holds and are not a change of starter.
    sqlite.prepare('UPDATE agents SET started_by_kind = ?, started_by_id = ? WHERE id = ?').run(to.kind, to.id, agent.id)
    for (const record of records) patchRecord(record.id, { dataPatch: { startedBy: to } }, actor)
    const at = nowStamp()
    const id = pending?.id ?? anOfficeId()
    const pressedBy = askedBy as ParticipantRef
    if (pending !== undefined) {
      sqlite.prepare("UPDATE agent_starter_changes SET state = 'applied', applied_at = ? WHERE id = ?").run(at, id)
    } else sqlite
      .prepare(
        'INSERT INTO agent_starter_changes (id, agent_id, from_kind, from_id, to_kind, to_id, asked_by_kind, asked_by_id, ' +
          "because, asked_at, state, applied_at, refused_because, runs_not_ended) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'applied', ?, NULL, ?)",
      )
      .run(
        id,
        agent.id,
        from?.kind ?? null,
        from?.id ?? null,
        to.kind,
        to.id,
        pressedBy.kind,
        pressedBy.id,
        because,
        at,
        at,
        JSON.stringify(runsNotEnded.map((run) => run.id)),
      )
    // EVERY PAGE IS TOLD, because the participants page draws each agent's starter.
    announce({
      name: 'list.changed',
      workspaceId: null,
      lists: ['participants', 'contacts'],
      about: null,
      groupId: null,
      participant: { kind: 'agent', id: agent.id },
      because: `"${toNamed.name}" answers for the agent "${agent.name}" now, so the registry of agents changed.`,
    })

    // THE AGENT AND BOTH STARTERS ARE TOLD, each that is a live agent and did not press. A person starter is not, since
    // the person is who presses.
    const fromName = answer.from === null ? null : answer.from.name
    const tell: { who: ParticipantRef; as: 'the agent' | 'the new starter' | 'the old starter' }[] = [
      { who: { kind: 'agent', id: agent.id }, as: 'the agent' },
      { who: to, as: 'the new starter' },
      ...(from === null ? [] : [{ who: from, as: 'the old starter' as const }]),
    ]
    for (const one of tell) {
      if (one.who.kind !== 'agent' || (one.who.kind === pressedBy.kind && one.who.id === pressedBy.id)) continue
      const row = readParticipant(one.who) as RegisteredAgent | null
      if (row === null || row.retired) continue
      const told = writeASystemLineToOne(
        one.who,
        workspaceId,
        SYSTEM_LINES.theStarterOfAnAgentChanged(agent.name, fromName, toNamed.name, pending?.because ?? because, one.as, runsNotEnded.length),
        { type: 'system', id: moleOffice().id },
      )
      answer.told.push({ who: named(one.who), message: told.id })
    }

    const row = sqlite.prepare('SELECT * FROM agent_starter_changes WHERE id = ?').get(id) as AStarterChangeRow
    answer.change = onTheWire(row)
    answer.note =
      `"${toNamed.name}" answers for "${agent.name}" now, in place of ` +
      `${answer.from === null ? 'nobody, since nobody recorded a starter' : `"${answer.from.name}"`}. ` +
      `${records.length === 1 ? 'Its record says' : `Its ${records.length} records say`} so. ` +
      (runsNotEnded.length === 0
        ? ''
        : `${runsNotEnded.length === 1 ? 'A run of it had' : `${runsNotEnded.length} runs of it had`} not ended, and the change was made at once. `) +
      (answer.told.length === 0 ? 'Nobody was told.' : `Told: ${answer.told.map((one) => `"${one.who.name}"`).join(', ')}.`)
    return answer
  }
  return dryRun ? work() : sqlite.transaction(work)()
}

/** Called after the run state is stored, inside the transaction that ends it. */
export function applyAWaitingStarterChangeForARunEnded(runId: string, beforeData: Record<string, unknown>, workspaceId: string): void {
  try {
    const agents = everyAgentASessionsDataNames(beforeData)
    const selected = theAgentOfARun({workspaceId, data: beforeData})?.id
    if (selected != null && !agents.some((one) => one.id === selected)) agents.push({kind: 'agent', id: selected})
    const held = theLiveHoldOnSession(runId, true)
    if (held !== null && !agents.some((one) => one.id === held.agent.id)) agents.push({kind: 'agent', id: held.agent.id})
    for (const agent of agents) {
      const pending = sqlite.prepare("SELECT * FROM agent_starter_changes WHERE agent_id = ? AND state = 'waiting'").get(agent.id) as AStarterChangeRow | undefined
      if (pending === undefined) continue
      try {
        if (theRunsOfTheAgentThatHaveNotEnded(agent.id).length > 0) continue
        changeWhoAnswersForInternal(agent.id, {to: pending.to_id, because: pending.because, atOnce: true}, {type: 'system', id: moleOffice().id}, workspaceId, true)
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        sqlite.prepare("UPDATE agent_starter_changes SET state = 'refused', refused_because = ? WHERE id = ? AND state = 'waiting'").run(reason, pending.id)
        try {
          createRecord({kind: 'message', workspaceId, title: 'A starter change was refused', data: {body: `Starter change ${pending.id} was refused: ${reason}`, to: [{kind: 'person', id: THE_PERSON}], sentBy: moleOffice()}, actor: {type: 'system', id: moleOffice().id}, senderIsMoleOffice: true})
        } catch (noticeError) {
          console.error('The person could not be told that a starter change was refused:', noticeError)
        }
      }
    }
  } catch (error) {
    console.error('A waiting starter change could not be checked when a run ended:', error)
  }
}

/**
 * THE RESTORE PROOF'S CHANGE OF STARTER, written by the product's own writer: the person makes themselves the starter
 * of a live agent that another starter answered for, at once.
 */
export async function fillTheStarterChangeProof(): Promise<string> {
  const said = 'A live agent whose starter the person changed to themselves, at once.'
  if (sqlite.prepare('SELECT 1 FROM agent_starter_changes LIMIT 1').get() !== undefined) return said
  const { MESSAGE_CENTRE } = await import('@shared/workspaces.ts')
  const agent = sqlite
    .prepare(
      `SELECT id FROM agents WHERE retired = 0 AND id <> ? AND NOT (started_by_kind IS 'person' AND started_by_id IS ?)
        ORDER BY id LIMIT 1`,
    )
    .get(moleOffice().id, THE_PERSON) as { id: string } | undefined
  if (agent === undefined) {
    throw new Error('The restore proof changes the starter of a live agent the person does not answer for, and its corpus holds none.')
  }
  changeWhoAnswersFor(agent.id, { to: THE_PERSON, because: 'The restore proof carries a change of starter.', atOnce: true }, { type: 'human', id: THE_PERSON }, MESSAGE_CENTRE)
  return said
}
// The schema part of agent_starter_changes names this file for its fill, so the database folder imports nothing above itself.
giveTheFill('src/server/lib/agent-starter.ts', fillTheStarterChangeProof)
