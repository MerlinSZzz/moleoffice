// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT REGISTERED WITH NO KEY OF ITS OWN, AND THE ONE RULE THAT FOLLOWS FROM IT.
 *
 * A supervisor registers its own worker at POST /api/agents/started with `noKey: true`, through its own key. No key is
 * made for the worker. The office makes the worker a run key for each run it starts, or a hand start naming a live run of its
 * registered starter with --asked-by and --brief, proved by the starter's own key (`mintARunKey` in src/server/api/records.ts), and the worker writes with that key. The mark is the
 * column `run_keys_only` (migration 0273), written in the same transaction as the registration.
 *
 * THE RULE. A request whose actor is such an agent is answered only with a run key or the office's key, for reads and
 * writes alike, whether the key window is open or closed. A run key is one of the agent's own run keys, or a
 * supervisor's run key acting for the agent's run (lib/acting-for.ts). Refused are a request with no key, and a request
 * with any key of the agent's that was not made for a run. `actorFrom` in lib/http.ts asks it on every request that
 * names an agent. Which keys were made for a run is read in lib/keys.ts.
 *
 * AND NO DOOR GIVES SUCH AN AGENT A KEY OF ITS OWN. The doors in lib/newkey.ts ask `whyThisAgentIsGivenNoKeyOfItsOwn`
 * before they write: the first key, the new-key ask and its collection, the grant of such an ask, and a starter's
 * re-key. A refusal of a new-key ask makes no key, so it is still answered.
 *
 * WHAT THIS DOES NOT DO. A read that does not name an agent is answered as before.
 */
import type { FastifyRequest } from 'fastify'

import { sqlite } from '../db/client.ts'
import { everyAgentAReferenceCouldName } from '../db/agent-references.ts'
import { theKeyOnThisRequestWasMadeForARun } from '../db/the-key-on-this-request-was-made-for-a-run.ts'
import { participantForActor } from './participant-for-actor.ts'
import { type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { thisAgentWasRegisteredWithNoKeyOfItsOwn } from '../db/this-agent-was-registered-with-no-key-of-its-own.ts'

/**
 * MARK THE AGENT WITH THIS REGISTRY ID AS REGISTERED WITH NO KEY OF ITS OWN. The registration door calls it inside the
 * transaction that writes the row, so a registration that is refused leaves no mark, and a mark never lands without
 * its row. A row that is not there is a broken assumption, and it is said rather than passed over.
 */
export function markAsSigningOnlyWithRunKeys(agentId: string): void {
  const changed = sqlite.prepare('UPDATE agents SET run_keys_only = 1 WHERE id = ?').run(agentId).changes
  if (changed !== 1) {
    throw new PanelError(`The registration wrote no registry row with the id "${agentId}", so it could not be marked as having no key of its own.`, 500)
  }
}

/** Why this write is refused, or null because the rule above does not refuse it. The caller has decided it is a write. */
export function whyThisWriteNeedsARunKey(req: FastifyRequest, actor: Actor): string | null {
  const handle = theMarkedAgentThisRequestNamesWithNoRunKey(req, actor)
  if (handle === undefined) return null
  return (
    `"${handle}" was registered with no key of its own, so a write in its name is taken only with a run key or ` +
    "the office's key, and this request carried neither, so nothing was written."
  )
}

/** Why this read is refused, or null because the rule above does not refuse it. The caller has decided it is a read. */
export function whyThisReadNeedsARunKey(req: FastifyRequest, actor: Actor): string | null {
  const handle = theMarkedAgentThisRequestNamesWithNoRunKey(req, actor)
  if (handle === undefined) return null
  return (
    `"${handle}" was registered with no key of its own, so a read in its name is answered only with a run key or ` +
    "the office's key, and this request carried neither, so nothing was read."
  )
}

/**
 * WHY NO DOOR GIVES THIS AGENT A KEY OF ITS OWN, or null because it has no mark. Each door in lib/newkey.ts that makes
 * a key, files an ask for one or grants one asks it before it writes anything.
 */
export function whyThisAgentIsGivenNoKeyOfItsOwn(agent: { id: string; handle: string }): string | null {
  if (!theMarkOn(agent.id)) return null
  return (
    `"${agent.handle}" was registered with no key of its own, so no door makes it a key, files an ask for one or ` +
    "grants one. It writes and reads only with a run key or the office's key. Nothing was written."
  )
}

/**
 * THE HANDLE OF THE MARKED AGENT THIS REQUEST NAMES WITHOUT A RUN KEY, or undefined because the rule does not refuse it.
 *
 * THE OFFICE'S KEY IS ANSWERED FIRST, and nothing is looked up for it: the office files and patches the runs it starts
 * under the agent's name.
 *
 * THEN EVERY AGENT THE NAME COULD MEAN IS READ, and the rule goes on only where one of them has the mark. Those are the
 * candidates the one resolver chooses among, and reading them raises nothing. So a name that cannot mean a marked agent
 * is passed exactly as it was before the mark existed. Where one can, the one resolver says which agent the name means,
 * and a name it cannot settle raises its own refusal, because the office then cannot tell whether the request is in the
 * marked agent's name.
 */
function theMarkedAgentThisRequestNamesWithNoRunKey(req: FastifyRequest, actor: Actor): string | undefined {
  if (actor.type !== 'agent' || actor.provedBy === 'the-office-key') return undefined
  const could = everyAgentAReferenceCouldName(sqlite, actor.id)
  const marked = new Map<string, string>()
  for (const one of [could.byId, could.liveByHandle, ...could.everyRetiredByHandle]) {
    if (one !== null && theMarkOn(one.id)) marked.set(one.id, one.handle)
  }
  if (marked.size === 0) return undefined
  const who = participantForActor(actor)
  const handle = who === null || who.kind !== 'agent' ? undefined : marked.get(who.id)
  if (handle === undefined) return undefined
  if (actor.provedBy === 'an-agent-key' && theKeyOnThisRequestWasMadeForARun(req)) return undefined
  return handle
}

/** Whether the agent with this registry id has the mark. */
function theMarkOn(agentId: string): boolean {
  return thisAgentWasRegisteredWithNoKeyOfItsOwn(agentId)
}

export { thisAgentWasRegisteredWithNoKeyOfItsOwn } from '../db/this-agent-was-registered-with-no-key-of-its-own.ts'
