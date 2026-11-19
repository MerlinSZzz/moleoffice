// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S NEW NAME, PROPOSED AND THEN APPROVED OR REFUSED BY ITS APPROVER, OVER HTTP. Item 42 of wave 13s.
 *
 *   POST /api/participants/agent/:id/renames   {"name": "…", "because": "…"}   propose a new name
 *   GET  /api/participants/agent/:id/renames                                   every rename of the agent
 *   POST /api/renames/:id/approve              {"because": "…"}                 approve a waiting new name
 *   POST /api/renames/:id/refuse               {"because": "…"}                 refuse a waiting new name
 *
 * The rules are in src/server/lib/agent-renames.ts; what is here is the door. An agent's `:id` may be its id or its
 * handle, read by the one resolver every participant door uses.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { approveARename, proposeARename, refuseARename, theRenamesOf } from '../lib/agent-renames.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { theAgentAnArrivingReferenceNames } from '../lib/the-agent-an-arriving-reference-names.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'

const PROPOSE_NOTE =
  'PROPOSE A NEW NAME FOR AN AGENT: {"name": "<the new name>", "because": "<your reason>"}. The name is the display name; ' +
  'the handle and the id never change, so a message sent to the agent as before still reaches it. The agent itself, an ' +
  'agent up its chain of starters (each proved by its own key) or the person may propose. The new name waits for the ' +
  'approver: the first secretary up the chain of starters, or the person for a secretary and for an agent with no live ' +
  'secretary above it. The approver is told once. One new name waits at a time, and a name another live agent bears is ' +
  'refused; case and spacing do not make two names differ. The reply is {rename, says}.'

const LIST_NOTE =
  'EVERY RENAME OF ONE AGENT, newest first: each proposal with its approver and answer, and each rename the person made ' +
  'at once through PATCH /api/participants/agent/:id. `waiting` names the proposal that waits, if one does, and says ' +
  'whether this caller may answer it. The reply is {agent, renames, waiting}.'

const APPROVE_NOTE =
  'APPROVE A WAITING NEW NAME: {"because": "<your reason>"}. The approver the proposal names, proved by its own key, or ' +
  'the person may approve it. A secretary the person has raised may approve a new name that waits for the person, by its ' +
  'own key, with {"forThePerson": {"reason": "<why you press it for them>"}} beside `because`, unless the secretary card ' +
  "or this office's list keeps this door for the person; the rename row then keeps the grant. The agent being renamed " +
  'never may, raised or not. The agent bears the new name from this write on, and the rename row keeps who proposed and ' +
  'who approved it, the old and the new name, and both reasons. It is refused if the name changed since the proposal or ' +
  'another live agent bears the new name now. The reply is {rename}.'

const REFUSE_NOTE =
  'REFUSE A WAITING NEW NAME: {"because": "<your reason>"}. Who may is as for approve. The agent keeps its name, and the ' +
  'refusal is kept on the rename row with its reason. The reply is {rename}.'

const agentParams = z.strictObject({ id: z.string().min(1) })
const renameParams = z.strictObject({ id: z.string().min(1) })
const proposeBody = z.strictObject({
  name: z.string({ error: 'name is the new name, as text' }),
  because: z.string({ error: 'because is your reason for the new name, as text' }),
})
const answerBody = z.strictObject({ because: z.string({ error: 'because is your reason, as text' }) })

/** The agent a `:id` names, by its id or its handle, or the door's 404. */
function theAgentThePathNames(id: string, doing: 'reading' | 'writing'): string {
  const named = theAgentAnArrivingReferenceNames(id, doing)
  if (named === null) throw new PanelError(`No agent in this installation answers to "${id}".`, 404)
  return named.agent.id
}

export async function agentRenameRoutes(app: FastifyInstance): Promise<void> {
  app.post('/participants/agent/:id/renames', route('agent-rename.propose', 'remote', PROPOSE_NOTE), async (req, reply) => {
    const { id } = parse(agentParams, req.params, 'The agent asked for')
    const body = parse(proposeBody, req.body ?? {}, 'The proposal')
    const proposed = proposeARename(theAgentThePathNames(id, 'writing'), body, actorFrom(req), workspaceOf(req))
    reply.code(201)
    return proposed
  })

  app.get('/participants/agent/:id/renames', route('agent-rename.list', 'remote', LIST_NOTE), async (req) => {
    const { id } = parse(agentParams, req.params, 'The agent asked for')
    return theRenamesOf(theAgentThePathNames(id, 'reading'), actorFrom(req))
  })

  app.post('/renames/:id/approve', route('agent-rename.approve', 'remote', APPROVE_NOTE), async (req) => {
    const { id } = parse(renameParams, req.params, 'The rename asked for')
    const { because } = parse(answerBody, req.body ?? {}, 'The approval')
    return approveARename(id, because, actorFrom(req))
  })

  app.post('/renames/:id/refuse', route('agent-rename.refuse', 'remote', REFUSE_NOTE), async (req) => {
    const { id } = parse(renameParams, req.params, 'The rename asked for')
    const { because } = parse(answerBody, req.body ?? {}, 'The refusal')
    return refuseARename(id, because, actorFrom(req))
  })
}
