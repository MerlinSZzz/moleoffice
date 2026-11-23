// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TWO DOORS THAT MOVE AN AGENT TO ANOTHER PROJECT. Wave 13u, round 184.
 *
 * GET reads what the press would move and what would stay, and writes nothing. POST is the person's press. Both answer
 * the same shape, worked out in one place (lib/agent-move.ts), so what the person read before pressing is what the
 * press does. The press sends back the preview's `needsAlso` as `also`, as the record door asks, so a record the
 * preview did not show is never moved.
 *
 * AND THREE DOORS THAT CHANGE WHO ANSWERS FOR AN AGENT, its starter (wave 13u, round 186): who answers for it now with
 * each change, the preview of a change, and the person's press. The preview and the press answer one shape, worked out
 * in lib/agent-starter.ts.
 *
 * AND THE OWNER DOOR, which hands an agent to another owner, AND THE READ OF EVERY HAND-OVER IT KEPT (wave 13s round
 * 281). The door keeps each hand-over through lib/agent-owner-changes.ts, in the same write as the new owner, and the
 * read gives them back from there.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { sqlite } from '../db/client.ts'
import { readParticipant } from '../db/read-participant.ts'
import { theOneAgentAStringNames } from '../lib/agent-references.ts'
import { theRecordedOwner } from '../lib/agent-owner.ts'
import { theOwnerHandOversOf, writeAnOwnerHandOver } from '../lib/agent-owner-changes.ts'
import { theAgentAnArrivingReferenceNames } from '../lib/the-agent-an-arriving-reference-names.ts'
import { anAgentItsOwnKeyProves } from '../lib/who-may-act.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { aRaiseCarriesIt } from '../lib/records.ts'
import { theRoleCards } from '../lib/roles.ts'
import { PanelError } from '../lib/panel-error.ts'
import type { RegisteredAgent } from '../lib/participants.ts'
import { moveAnAgentToAProject } from '../lib/agent-move.ts'
import { changeWhoAnswersFor, whoAnswersFor, withdrawAWaitingStarterChange, theAgentOrARefusal } from '../lib/agent-starter.ts'
import { participantForActor } from '../lib/participant-for-actor.ts'
import { writeASystemLineToAgents } from '../lib/groups.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'

const pressBody = z.object({
  to: z.string().min(1, 'Name the project the agent is to move to.'),
  also: z.array(z.string().min(1)).optional(),
})

const PREVIEW_NOTE =
  "What moving this agent from this project to `to` would do, and NOTHING IS WRITTEN. It names the agent's record " +
  'and its ended runs that would move, each record the move needs named in `also` and why, each link that would cross ' +
  "the boundary and refuse the move, and every record of the agent's that would stay, with why: a run still going, " +
  'paused, left without its process or in no known state stays where it was filed, and a secretary\'s duties stay ' +
  'with the project that granted them. Anybody who may read this project may read it.'

const MOVE_NOTE =
  "Moves this agent from this project to `to`: its record, its ended runs, and what the record move says goes with " +
  'them, in one transaction. A run still going is not moved under its own feet; it stays where it was filed, and the ' +
  'same press moves it once it has ended, even after the agent\'s record went ahead. A run that names the agent by its ' +
  'record is rewritten to name it in the new project. Send the preview\'s `needsAlso` as `also`. Only the person ' +
  'presses it, or a secretary their raise carries it for; an agent moving itself or another agent is refused. A link ' +
  'that would cross the boundary refuses the whole move, and nothing is written.'

const starterBody = z.union([z.object({withdraw: z.literal(true)}), z.object({
  to: z.string().min(1, 'Name the new starter: the person, or an agent by its id or handle.'),
  because: z.string().min(1, 'Say why the starter changes.'),
  atOnce: z.boolean().optional(),
})])

const STARTER_NOTE =
  'Who answers for this agent now, its starter, and every change of it, newest first, with who pressed it and why. It ' +
  'says whether following the starters up from the agent reaches the person. Anybody who may read this project may ' +
  'read it.'

const STARTER_PREVIEW_NOTE =
  'What making `to` the starter of this agent would do, and NOTHING IS WRITTEN. `to` is the person, or an agent by its ' +
  'id or handle. It says how `to` was read, the starter it would replace, whether the agent holds the secretary card, ' +
  'how many agents have it on their chain of starters, the first secretary up its chain before and after, its runs ' +
  'that have not ended, and its records that would name the new starter. A change the press would refuse is refused ' +
  'here in the same words. Anybody who may read this project may read it.'

const STARTER_MOVE_NOTE =
  "Makes `to` the starter of this agent: the registry row and the agent's records in every project name it, and the " +
  'change is kept with `because`. Refused, with nothing written: another person, a retired agent, the agent itself, ' +
  'the starter it has now, and an agent whose starters come back to this one or reach nobody. A press for an agent with ' +
  'a run that has not ended waits until the last run ends, unless it sends `"atOnce": true`. Send `{"withdraw":true}` ' +
  'to withdraw a waiting change. The agent and both starters ' +
  'are told, each that is an agent. Only the person presses it; a secretary\'s raise does not carry it.'

const OWNER_CHANGES_NOTE =
  "EVERY HAND-OVER OF ONE AGENT'S OWNER that POST /api/agents/:id/owner made, newest first: the owner before and after, " +
  'who made it, the grant it was made under, the reason and when. An owner before is held, absent where the row held ' +
  'none, or broken where it cannot be read, as the read of one agent says its owner. A name is null where the id names ' +
  'nobody registered. `since` is the moment this office began to keep them, null until it was written; a hand-over ' +
  'before it is not listed. The agent is named by its id or its handle. The reply is {agent, since, handOvers}.'

const agentParams = z.strictObject({ id: z.string().min(1) })

export async function agentMoveRoutes(app: FastifyInstance): Promise<void> {
  app.post('/agents/:id/owner', route('agent.owner-move', 'remote', 'Change the agent responsible for this agent. The starter remains recorded.'), async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(z.object({ owner: z.object({ kind: z.string(), id: z.string().min(1) }), because: z.string().trim().min(1) }), req.body ?? {}, 'The owner was not changed:')
    const subject = theOneAgentAStringNames(sqlite, id)
    if (subject === null) throw new PanelError('No registered agent answers to that name. Nothing was changed.', 404)
    const target = theAgentOrARefusal(subject.id, ' Nothing was changed.')
    const actor = actorFrom(req)
    const caller = anAgentItsOwnKeyProves(actor)
    const recorded = theRecordedOwner(target)
    const current = recorded.state === 'held' && recorded.owner.kind === 'agent' ? theOneAgentAStringNames(sqlite, recorded.owner.id) : null
    if (!thePersonIsProved(actor) && (caller === null || caller === target.id || (caller !== current?.id && !aRaiseCarriesIt(actor)))) {
      throw new PanelError('Only the person, the current owner, or a secretary acting under the person\'s grant may change this ownership. Nothing was changed.', 403)
    }
    if (body.owner.kind !== 'agent') throw new PanelError('The new owner must be a secretary. Nothing was changed.', 400)
    const found = theOneAgentAStringNames(sqlite, body.owner.id)
    const next = found === null ? null : readParticipant({ kind: 'agent', id: found.id }) as RegisteredAgent | null
    if (next === null || next.retired || next.role !== theRoleCards().elevation.onlyThisCardCanHoldIt || next.id === target.id) {
      throw new PanelError('Choose another active secretary as the new owner. Nothing was changed.', 400)
    }
    const seen = new Set<string>([target.id])
    let cursor: RegisteredAgent | null = next
    while (cursor !== null) {
      if (seen.has(cursor.id)) throw new PanelError('That ownership would make a loop. Nothing was changed.', 400)
      seen.add(cursor.id)
      const owner = theRecordedOwner(cursor)
      if (owner.state === 'absent' || (owner.state === 'held' && owner.owner.kind === 'person')) break
      if (owner.state === 'broken') throw new PanelError('The new owner has an unresolved ownership chain. Nothing was changed.', 400)
      const above = theOneAgentAStringNames(sqlite, owner.owner.id)
      if (above === null) throw new PanelError('The new owner has an unresolved ownership chain. Nothing was changed.', 400)
      cursor = readParticipant({ kind: 'agent', id: above.id }) as RegisteredAgent | null
      if (cursor === null) throw new PanelError('The new owner has an unresolved ownership chain. Nothing was changed.', 400)
    }
    const acting = participantForActor(actor)
    if (acting === null) throw new PanelError('The person or agent making the change could not be read. Nothing was changed.', 403)
    const actingRow = readParticipant(acting)
    if (actingRow === null) throw new PanelError('The person or agent making the change could not be read. Nothing was changed.', 403)
    const former = current === null ? null : readParticipant({ kind: 'agent', id: current.id }) as RegisteredAgent | null
    const formerPerson = recorded.state === 'held' && recorded.owner.kind === 'person' ? readParticipant(recorded.owner) : null
    const fromName = recorded.state === 'absent' ? null : former?.name ?? formerPerson?.name ?? 'an owner whose name could not be found'
    const recipients = [target, next, ...(former === null || former.retired ? [] : [former])]
      .filter((one, index, all) => all.findIndex((other) => other.id === one.id) === index)
      .filter((one) => acting.kind !== 'agent' || acting.id !== one.id)
      .map((one) => ({ kind: 'agent' as const, id: one.id }))
    sqlite.transaction(() => {
      writeAnOwnerHandOver({
        agent: target.id,
        to: { kind: 'agent', id: next.id },
        by: acting,
        underTheGrant: acting.kind === 'agent' && actor.elevationUsed === true && actor.elevation !== undefined ? actor.elevation.id : null,
        because: body.because,
      })
      writeASystemLineToAgents(
        recipients,
        workspaceOf(req),
        SYSTEM_LINES.theOwnerOfAnAgentChanged(target.name, fromName, next.name, actingRow.name, body.because, actor.elevationUsed === true),
        actor,
      )
    })()
    return { agent: target.id, owner: { kind: 'agent', id: next.id } }
  })

  app.get('/participants/agent/:id/owner-changes', route('agent-owner-change.list', 'remote', OWNER_CHANGES_NOTE), async (req) => {
    const { id } = parse(agentParams, req.params, 'The agent asked for')
    const named = theAgentAnArrivingReferenceNames(id, 'reading')
    if (named === null) throw new PanelError(`No agent in this installation answers to "${id}".`, 404)
    return theOwnerHandOversOf(named.agent.id)
  })

  app.get('/agents/:id/project-move', route('agent.project-move-preview', 'remote', PREVIEW_NOTE), async (req) => {
    const { id } = req.params as { id: string }
    const { to } = req.query as { to?: string }
    if (to === undefined || to === '') {
      throw Object.assign(new Error('Name the project the agent would move to, as ?to=<project>. Nothing was read.'), { statusCode: 400 })
    }
    return moveAnAgentToAProject(id, workspaceOf(req), { to, dryRun: true }, actorFrom(req))
  })

  app.post('/agents/:id/project-move', route('agent.project-move', 'remote', MOVE_NOTE), async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(pressBody, req.body ?? {}, 'The agent was not moved:')
    return moveAnAgentToAProject(id, workspaceOf(req), { to: body.to, ...(body.also === undefined ? {} : { also: body.also }) }, actorFrom(req))
  })

  app.get('/agents/:id/starter', route('agent.starter-read', 'remote', STARTER_NOTE), async (req) => {
    const { id } = req.params as { id: string }
    return whoAnswersFor(id)
  })

  app.get('/agents/:id/starter-preview', route('agent.starter-preview', 'remote', STARTER_PREVIEW_NOTE), async (req) => {
    const { id } = req.params as { id: string }
    const { to } = req.query as { to?: string }
    if (to === undefined || to === '') {
      throw Object.assign(new Error('Name the new starter, as ?to=<the person, or an agent>. Nothing was read.'), { statusCode: 400 })
    }
    return changeWhoAnswersFor(id, { to, dryRun: true }, actorFrom(req), workspaceOf(req))
  })

  app.post('/agents/:id/starter', route('agent.starter-move', 'remote', STARTER_MOVE_NOTE), async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(starterBody, req.body ?? {}, 'The starter was not changed:')
    if ('withdraw' in body) return withdrawAWaitingStarterChange(id, actorFrom(req))
    return changeWhoAnswersFor(
      id,
      { to: body.to, because: body.because, ...(body.atOnce === undefined ? {} : { atOnce: body.atOnce }) },
      actorFrom(req),
      workspaceOf(req),
    )
  })
}
