// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { actorFrom, actorWithTheWordsItActsOn } from '../lib/http.ts'
import { assertMayRestartOrPause, theRestartGrantOf, theRestartWay, writeTheRestartGrant } from '../lib/office-restart.ts'
import {officePauseState,changeOfficePause} from '../lib/office-pause.ts'
import { sqlite } from '../db/client.ts'
import { getRecord, theSecretaryActingForThePerson, theLastChangeOfASetting, writeDownASettingChange } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { type RegisteredAgent } from '../lib/participants.ts'
import { theAgentAnArrivingReferenceNames } from '../lib/the-agent-an-arriving-reference-names.ts'
import { readParticipant } from '../db/read-participant.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { warrantBody } from './records.ts'
import { aSecretaryWithItsOwnKey } from './runtime-settings.ts'
import { sayASecretaryChangedItForThem } from '../lib/changed-from-another-computer.ts'

function refuse(reason: string, code: 'officeRestartNotAllowed' | 'officeRestartBadGrant' | 'officeRestartBadWarrant' | 'officeRestartBadReason' | 'officeRestartNoManager', status = 400): never { throw new PanelError(reason, status, undefined, undefined, undefined, { code, values: { reason } }) }
const instance = randomUUID()
function grantHistory() {
  const rows = sqlite.prepare("SELECT record_id,actor_type,actor_id,at,old_value,new_value FROM changes WHERE record_id GLOB 'setting:restart-grant:*' ORDER BY append_order DESC LIMIT 20").all() as {record_id:string;actor_type:string;actor_id:string;at:string;old_value:string|null;new_value:string|null}[]
  return rows.map((row) => {
    const agent = readParticipant({kind:'agent',id:row.record_id.slice('setting:restart-grant:'.length)})
    const by = row.actor_type === 'human' ? readParticipant({kind:'person',id:row.actor_id}) : row.actor_type === 'agent' ? readParticipant({kind:'agent',id:row.actor_id}) : null
    return {agent:agent?.name ?? null,by:by?.name ?? null,at:row.at,from:row.old_value,to:row.new_value}
  })
}
function grants() {
  return (sqlite.prepare('SELECT agent_id,decision_id FROM office_restart_grants ORDER BY agent_id').all() as { agent_id: string; decision_id: string }[]).map((row) => {
    const agent = readParticipant({ kind: 'agent', id: row.agent_id }) as RegisteredAgent | null
    const decision = getRecord(row.decision_id)
    return { agent: { id: row.agent_id, name: agent?.name ?? null }, decision: { id: row.decision_id, title: decision?.title ?? null },
      live: agent !== null && agent.retired !== true && decision?.kind === 'decision' && decision.deletedAt === null,
      lastChange: theLastChangeOfASetting(`restart-grant:${row.agent_id}`) }
  })
}
export async function officeRestartRoutes(app: FastifyInstance): Promise<void> {
  app.get('/office/pause',route('office.pause-state','remote','Read the office worker pause, its actor, time and reason. The API remains alive.'),async()=>officePauseState())
  for(const paused of [true,false]){
    app.post(paused?'/office/pause':'/office/resume',route(paused?'office.pause':'office.resume','remote','Pause or resume office work without closing the API. Owner, an agent with a live restart-and-pause grant and its own key, or a secretary under the person’s grant where this office’s list of what the grant carries lets it press. While the gate who-pauses-the-office is off, any agent proved by its own key may also press, and is counted. Body {why}. Pause stops the worker before pausing office-started runs. Resume follows the configured worker mode; paused runs still wait for their usual press. Every change records who, when and why.'),async(req)=>{
      const actor=actorFrom(req)
      assertMayRestartOrPause(actor,'a pause or resume')
      const sent=z.strictObject({why:z.string().trim().min(1).max(500)}).safeParse(req.body)
      if(!sent.success)refuse('Give a reason of 1 to 500 characters. No pause or resume was requested.','officeRestartBadReason')
      return changeOfficePause(actor,paused,sent.data.why,workspaceOf(req))
    })
  }

  app.get('/office/restart', route('office.restart-state', 'remote', 'Read whether this office has a restart manager, and the explicit grants alongside the owner permission. Query agentWords optionally finds up to ten live agents by name or handle for the grant press. No grant is inferred from a handle or decision prose.'), async (req) => {
    const query = z.strictObject({agentWords:z.string().trim().min(1).max(200).optional()}).safeParse(req.query)
    if (!query.success) refuse('Find an agent by one to 200 characters of its name.', 'officeRestartBadGrant')
    const words = query.data.agentWords
    const agents = words === undefined ? [] : sqlite.prepare("SELECT id,name,handle FROM agents WHERE retired_at IS NULL AND (instr(lower(name),lower(?))>0 OR instr(lower(handle),lower(?))>0) ORDER BY name,id LIMIT 10").all(words,words) as {id:string;name:string;handle:string}[]
    return {instance,mode:theRestartWay()?.mode ?? null,grants:grants(),agents,history:grantHistory()}
  })
  app.post('/office/restart-grant', route('office.set-restart-grant', 'remote', 'Give or remove a restart and pause grant. Body {agent,decision:liveDecision|null,because,warrant?}. The owner may press. A secretary needs its own key and exact words bound to office.set-restart-grant: plus JSON {agent:resolvedRegistryId,decision:decisionOrNull}. A raise alone does not carry it. Changes name who, when, why and previous and new grants.'), async (req) => {
    let actor = actorFrom(req)
    const owner = thePersonIsProved(actor) || actor.theOwnersAuthority?.holds === true
    if (!owner && !aSecretaryWithItsOwnKey(actor)) refuse('Only the owner or a secretary carrying the exact words may give or remove this grant.', 'officeRestartNotAllowed', 403)
    const sent = z.strictObject({ agent: z.string().min(1), decision: z.string().min(1).nullable(), because: z.string().trim().min(1).max(500), warrant: warrantBody.optional() }).safeParse(req.body)
    if (!sent.success) refuse('Choose an agent, a live decision or null to remove the grant, and a reason of 1 to 500 characters.', 'officeRestartBadGrant')
    const body = sent.data
    const found = theAgentAnArrivingReferenceNames(body.agent, 'writing')
    if (found === null) refuse('Choose a registered agent.', 'officeRestartBadGrant')
    const agent = found.agent.id
    if (body.decision !== null) { const decision = getRecord(body.decision); if (decision?.kind !== 'decision' || decision.deletedAt !== null) refuse('Choose a live decision.', 'officeRestartBadGrant') }
    if (!owner) {
      try { actor = actorWithTheWordsItActsOn(req, body.warrant, `office.set-restart-grant:${JSON.stringify({ agent, decision: body.decision })}`) }
      catch (error) { if (!(error instanceof PanelError)) throw error; refuse(error.message, 'officeRestartBadWarrant', error.status) }
      if (actor.warrant === undefined || !theSecretaryActingForThePerson(actor)) refuse('A secretary needs the owner’s words for this exact agent and decision. A raise alone is not enough.', 'officeRestartNotAllowed', 403)
    }
    sqlite.transaction(() => {
      const old = theRestartGrantOf(agent)
      writeTheRestartGrant(old.ids, body.decision)
      writeDownASettingChange(actor, { setting: `restart-grant:${agent}`, field: 'permission to restart or pause the office', before: { decision: old.decision }, after: { decision: body.decision, because: body.because }, workspaceId: workspaceOf(req) })
      sayASecretaryChangedItForThem(req,actor,'Permission to restart or pause the office was changed')
    })()
    return { grants: grants() }
  })
  app.post('/office/restart', route('office.restart', 'remote', 'Request a restart, without pausing agent runs. Owner or exact agent with a stored live grant and its own key. Body {because}. Refuses before acting if this server has no restart manager. The response is sent before the manager restarts it. Checkout uses serve-dev’s existing drain and held socket; installed service uses its existing stop/start command.'), async (req, reply) => {
    const actor = actorFrom(req)
    assertMayRestartOrPause(actor)
    const sent = z.strictObject({ because: z.string().trim().min(1).max(500) }).safeParse(req.body)
    if (!sent.success) refuse('Give a reason of 1 to 500 characters.', 'officeRestartBadReason')
    const way = theRestartWay()
    if (way === null) refuse('This server was started without a restart manager. No restart was requested. Start a checkout through its supervisor, or an installed office through its service.', 'officeRestartNoManager', 409)
    let commit: () => void
    try { commit = await way.prepare(sent.data.because) }
    catch (error) {
      if (error instanceof PanelError) throw error
      refuse(`${error instanceof Error ? error.message : String(error)} No restart was requested.`, 'officeRestartNoManager', 503)
    }
    writeDownASettingChange(actor, { setting: 'office-restart', field: 'a restart was requested', before: null, after: { because: sent.data.because, mode: way.mode }, workspaceId: workspaceOf(req) })
    reply.raw.once('finish', commit)
    return { requested: true, mode: way.mode, instance }
  })
}
