// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `participantForActor` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from '../db/client.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { theAgentAnArrivingReferenceNames } from './the-agent-an-arriving-reference-names.ts'
import { everyAgentsIdentityWithReferencesReadOnce, type TheIdentityOf } from '../db/agent-references.ts'

/**
 * WHICH REGISTRY ROW THE ACTOR ON A REQUEST IS, OR NULL BECAUSE NOTHING SAYS.
 *
 * Criterion M14, the registry half: *An actor id on a request is looked up in the registries.* This
 * is that lookup, and null is a real answer with a real meaning — nobody has registered whoever is
 * calling. Nothing is refused by this lookup and nothing is minted by it. When this was written, a
 * write from an unknown agent was accepted exactly as before, and the surfaces named it as
 * unregistered with its own id: the F1 answer applied to identity, which is to name it and never
 * stop it. Since 16 September 2026 a record write under an agent id with no registry
 * row is refused at the door, by `whyAnUnregisteredAgentMayNotWrite` in lib/records/unregistered-agent.ts, which asks
 * this lookup; the surfaces still name the ids that wrote before then.
 *
 * AN AGENT IS FOUND BY ITS ID OR BY ITS HANDLE, because an actor header carries whatever the caller
 * types and both of those are things a caller reasonably types. A person is found by id alone: there
 * is one person, and the id on their rows is the constant this product has always had for them.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO ANSWERS THIS GIVES, AND WHY NEITHER IS THE OTHER
 * ---------------------------------------------------------------------------------------
 *
 * NULL STILL MEANS NOBODY IS REGISTERED. About thirty doors are built on that, and the F1 answer
 * above is why: name it, never stop it. Nothing about that answer moved.
 *
 * AN AMBIGUOUS NAME IS REFUSED RATHER THAN ANSWERED NULL. A string that is one agent's id and
 * another live agent's handle is not an absence: two things are registered under it. Answering null
 * would make `whyAnUnregisteredAgentMayNotWrite` refuse the write saying *nothing is registered as
 * the agent X* when two things are — a refusal that stops the right write for a reason that is
 * false. Invariant 2 and invariant 5: no silent semantic fallback, and absence beats a guess, but
 * ambiguity is neither.
 *
 * IT ASKS AS A READ. This function answers *which registry row is calling*, not *may it write*, and
 * a retired agent is somebody this question knows — the comment on
 * `whyAnUnregisteredAgentMayNotWrite` in lib/records/unregistered-agent.ts says so outright, and the rules that do
 * refuse a retired agent are asked by the doors that own them. Asking as a write would refuse a
 * retired agent's own name here and take that decision away from those doors.
 *
 * ---------------------------------------------------------------------------------------
 * THE CALLER'S KEY IS STEP 1
 * ---------------------------------------------------------------------------------------
 *
 * `keyHolder` is the holder the request's agent key proved, which `actorFrom` in lib/http.ts puts on
 * the actor. It is handed to the resolver's step 1, so an agent that sends its handle and its key is
 * resolved to itself even where the handle is also a retired legacy agent's id (criterion I3 frees
 * that handle; plan be2Z8l-GArM2, block b9). Without a key such a string is refused naming both.
 */
export function participantForActor(actor: { type: string; id: string; keyHolder?: string | undefined }, read?: TheActorsReadOnce): ParticipantRef | null {
  const id = actor.id.trim()
  if (id === '') return null
  if (actor.type === 'human') {
    if (read !== undefined) return read.people().has(id) ? { kind: 'person', id } : null
    const row = sqlite.prepare('SELECT id FROM people WHERE id = ?').get(id) as { id: string } | undefined
    return row === undefined ? null : { kind: 'person', id: row.id }
  }
  if (actor.type !== 'agent') return null
  // THE ONE RESOLVER, replacing `SELECT id FROM agents WHERE id = ? OR handle = ?` — one statement
  // with no ordering, which hands back whichever row SQLite reaches first. Criterion I2.
  const found = theAgentAnArrivingReferenceNames(id, 'reading', actor.keyHolder ?? null, read?.identityOf)
  return found === null ? null : { kind: 'agent', id: found.agent.id }
}

/**
 * WHAT `participantForActor` READS, READ ONCE FOR A CALLER THAT ASKS ABOUT MANY ACTORS: every person's id, the first
 * time a person is asked about, and every agent's identity, through `everyAgentsIdentityWithReferencesReadOnce`. The
 * delegation column hands one to every row it draws. Keep it for one synchronous request only: a person or an agent
 * registered after it was read is not in it.
 */
export interface TheActorsReadOnce {
  people: () => ReadonlySet<string>
  identityOf: TheIdentityOf
}

export function theActorsReadOnce(): TheActorsReadOnce {
  let people: ReadonlySet<string> | null = null
  return {
    people: () => (people ??= new Set((sqlite.prepare('SELECT id FROM people').all() as { id: string }[]).map((row) => row.id))),
    identityOf: everyAgentsIdentityWithReferencesReadOnce(sqlite),
  }
}
