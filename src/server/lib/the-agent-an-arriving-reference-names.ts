// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theAgentAnArrivingReferenceNames` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `whyAReferenceNamesTwoAgents` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `stateOf` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `whyAWriteMayNotFollowARetiredName` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `whyANameSeveralRetiredAgentsBoreIsRefused` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `theAgentAKeysHolderIs` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from '../db/client.ts'
import { type AgentIdentity, type TheIdentityOf, theOneAgentAStringNames } from './agent-references.ts'
import { everyAgentAReferenceCouldName } from '../db/agent-references.ts'
import { PanelError } from './panel-error.ts'
import type { WhatTheCallerIsDoing, TheAgentNamed } from './participants.ts'

/**
 * WHICH AGENT AN ARRIVING REFERENCE NAMES. Five steps, in this order, and the order is the criterion.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIVE STEPS
 * ---------------------------------------------------------------------------------------
 *
 *   1. THE CALLER'S KEY, WHERE IT HOLDS ONE AND THE KEY NAMES ONE OF THE CANDIDATES.
 *   2. AN EXACT ID MATCH.
 *   3. THE ONE LIVE AGENT BEARING THAT HANDLE.
 *   4. FOR A READ ONLY: the one retired agent bearing that handle, answered with its retirement date
 *      on the row. A write is refused instead, naming the retirement. Where several retired agents
 *      bear it (a handle freed and taken more than once, criterion I3), there is no one retired
 *      agent, and read or write is refused naming each of them.
 *   5. WHERE STEPS 2 AND 3 NAME DIFFERENT AGENTS AND NO KEY SETTLED IT: refused, naming both agents,
 *      the state each is in, and the id to send instead.
 *
 * Null means NOBODY bears that name, which is a real answer and not a refusal: a write from an agent
 * no registry holds has always been named rather than stopped (the F1 answer: only name it), and the
 * rule that does refuse one asks this and reads the null.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT STEP 1 ACTUALLY SETTLES, BECAUSE IT IS NOT "THE KEY IS THE ANSWER"
 * ---------------------------------------------------------------------------------------
 *
 * A key proves WHO IS CALLING. It does not say who the reference names. A door reading
 * `GET /api/participants/agent/:handle` holds the caller's own key and is being asked about somebody
 * else, and a step 1 that answered with the key's holder would hand back the caller every time.
 *
 * So the key settles the reference exactly when the key's holder is one of the agents the reference
 * could name. That is enough for the case step 5 exists for — an agent sending its own name, which
 * two agents answer to, while holding its own key — and it is right for the other doors as well.
 *
 * WHAT THE KEY NAMES IS RESOLVED, NOT ASSUMED. `held_keys.whose_id` for an agent holds its HANDLE
 * today; the piece that moves it to the minted id has not landed. So the holder's string goes through
 * the id step and the live-handle step itself, and this works whichever of the two it turns out to
 * be. Nothing here has to change on the day that piece lands.
 *
 * ---------------------------------------------------------------------------------------
 * WHY `doing` IS REQUIRED AND `keyProved` IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * Forgetting `doing` would let a write follow a name to a retired agent, which is the thing step 4
 * exists to stop, so the type system asks for it at every call site. Forgetting `keyProved` can only
 * turn an answer into a refusal, never a refusal into a wrong answer, so it is optional and the
 * ordinary caller — which holds no key — says nothing about it.
 *
 * ---------------------------------------------------------------------------------------
 * A RETIRED AGENT NAMED BY ITS OWN ID IS NOT REFUSED HERE
 * ---------------------------------------------------------------------------------------
 *
 * Step 2 does not ask whether an agent is retired, and step 4's refusal is only about following a
 * NAME. Whether a retired agent may take part at all is a different question, asked by the doors that
 * own it. An id is exact and says precisely which agent is meant, so answering it is not a guess.
 *
 * @param reference what arrived: an id, or a handle, or a string that is neither.
 * @param doing whether the caller is reading something or writing something.
 * @param keyProved the holder `howThisRequestProvedItself` named, where the request carried a key.
 * @throws PanelError 409 when the reference names two agents, when a write followed a retired name, or
 *   when several retired agents bear the name and no live agent does.
 */
export function theAgentAnArrivingReferenceNames(
  reference: string,
  doing: WhatTheCallerIsDoing,
  keyProved?: string | null,
  identityOf?: TheIdentityOf,
): TheAgentNamed | null {
  const said = reference.trim()
  if (said === '') return null
  const could = identityOf?.reference?.(said) ?? everyAgentAReferenceCouldName(sqlite, said)

  // ---- 1. THE CALLER'S KEY, where it holds one and it names one of the candidates.
  if (keyProved !== undefined && keyProved !== null && keyProved.trim() !== '') {
    const holder = theAgentAKeysHolderIs(keyProved.trim())
    if (holder !== null) {
      for (const candidate of [could.byId, could.liveByHandle, ...could.everyRetiredByHandle]) {
        if (candidate !== null && candidate.id === holder.id) return { agent: candidate, how: 'the-key' }
      }
    }
  }

  // ---- 5, ASKED BEFORE 2 AND 3 ANSWER, because it is about the two of them disagreeing. A refusal
  //      that came after one of them had already answered would never be reached.
  if (could.byId !== null && could.liveByHandle !== null && could.byId.id !== could.liveByHandle.id) {
    throw new PanelError(whyAReferenceNamesTwoAgents(said, could.byId, could.liveByHandle), 409)
  }

  // ---- 2. AN EXACT ID MATCH.
  if (could.byId !== null) return { agent: could.byId, how: 'an-id' }

  // ---- 3. THE ONE LIVE AGENT BEARING THAT HANDLE.
  if (could.liveByHandle !== null) return { agent: could.liveByHandle, how: 'a-live-handle' }

  // ---- 4. THE ONE RETIRED AGENT BEARING THAT HANDLE, for a read. A write is refused.
  if (could.retiredByHandle !== null) {
    if (doing === 'writing') {
      throw new PanelError(whyAWriteMayNotFollowARetiredName(said, could.retiredByHandle), 409)
    }
    return { agent: could.retiredByHandle, how: 'a-retired-handle' }
  }
  // ---- AND WHERE SEVERAL RETIRED AGENTS BORE IT, there is no one retired agent to answer with.
  if (could.everyRetiredByHandle.length > 1) {
    throw new PanelError(whyANameSeveralRetiredAgentsBoreIsRefused(said, could.everyRetiredByHandle), 409)
  }

  // ---- AND NOBODY BEARS THAT NAME, which is a real answer.
  return null
}
/**
 * WHY A BARE STRING THAT NAMES TWO AGENTS IS REFUSED, in the sentence the caller reads.
 *
 * Exported so the refusal is written once and read by whatever needs to show it. Step 5 of the
 * resolver is the honesty of this whole change: invariant 2 says no silent semantic fallback, and
 * invariant 5 says absence beats a guess. Ambiguity is neither absence nor an answer.
 *
 * The string names one agent by its registry id or permanent alias and another by its current handle.
 * An alias collision offers both canonical ids; an exact-id collision retains its existing key requirement.
 *
 * In an exact-id collision, that agent's id is the ambiguous string itself.
 * That is the one bounded cost a decision accepted, and the sentence says it rather
 * than offering an id that would be refused again.
 */
export function whyAReferenceNamesTwoAgents(reference: string, byId: AgentIdentity, live: AgentIdentity): string {
  if (reference !== byId.id) return `"${reference}" is a permanent registry alias for ${byId.name} and the handle of ${live.name}. Send the canonical id "${byId.id}" for ${byId.name}, or "${live.id}" for ${live.name}, or prove the intended identity with its key.`
  return (
    `"${reference}" names two agents, so nobody can tell which one you mean. ` +
    `It is the id of ${byId.name}, ${stateOf(byId)}. ` +
    `It is the handle of ${live.name}, ${stateOf(live)}. ` +
    `Send the id ${live.id} to mean ${live.name}. ` +
    `The id of ${byId.name} is "${reference}" itself, so a name alone cannot mean ${byId.name}, ` +
    'and a caller that means it has to prove itself with its key.'
  )
}
/** What one agent is, in a clause a refusal can put in the middle of a sentence. */
export function stateOf(agent: AgentIdentity): string {
  if (!agent.retired) return 'which is active'
  if (agent.retiredAt === null) return 'which was retired on a date nobody recorded'
  return `which was retired on ${agent.retiredAt}`
}
/**
 * WHY A WRITE MAY NOT FOLLOW A NAME TO A RETIRED AGENT, in the sentence the caller reads.
 *
 * The agent's own id is always a different string here: an arriving reference that WAS its id would
 * have been answered by step 2, which does not ask whether an agent is retired. So the id this
 * sentence offers is one that works.
 */
export function whyAWriteMayNotFollowARetiredName(reference: string, retired: AgentIdentity): string {
  return (
    `"${reference}" is the handle of ${retired.name}, ${stateOf(retired)}. ` +
    'A name is followed to a retired agent when something is read, and never when something is written. ' +
    `Send the id ${retired.id} if ${retired.name} is really who you mean.`
  )
}
/**
 * WHY A NAME SEVERAL RETIRED AGENTS BORE IS REFUSED, in the sentence the caller reads.
 *
 * A handle is unique among live agents only (criterion I3), so after it has been freed and taken
 * more than once, several retired agents may bear it and no live one. Step 4 answers "the one
 * retired agent", and here there is not one. Answering null would say nobody bears the name, which is
 * false; picking one would name the wrong agent in silence. So the reader is told which agents the
 * name could mean and the id that names each.
 */
export function whyANameSeveralRetiredAgentsBoreIsRefused(reference: string, retired: readonly AgentIdentity[]): string {
  const each = retired.map((one) => `${one.name}, ${stateOf(one)}, has the id ${one.id}`).join('; ')
  return (
    `"${reference}" is the handle of ${String(retired.length)} retired agents, so nobody can tell which one you mean: ` +
    `${each}. Send the id of the one you mean.`
  )
}
/**
 * WHICH AGENT THE HOLDER A KEY NAMES IS, WITHOUT ASKING WHICH SHAPE THAT NAME IS IN.
 *
 * `held_keys.whose_id` holds an agent's HANDLE today and holds its minted id after the piece that
 * moves it. This reads either, by the id step and then the handle steps, so step 1 above is right on
 * both sides of that landing and needs no edit on the day.
 *
 * ---------------------------------------------------------------------------------------
 * A HOLDER STRING THAT NAMES TWO AGENTS PROVES NOTHING
 * ---------------------------------------------------------------------------------------
 *
 * The holder is stored as a string, so while it is a handle it can be ambiguous in exactly the way an
 * arriving reference can: one agent's id and another agent's name. Picking the id half would be a
 * silent semantic fallback — invariant 2 — and this is the worst place in the product to put one,
 * because the thing it would settle is who somebody is allowed to be.
 *
 * So an ambiguous holder answers null, the resolver falls through to its ordinary steps, and the
 * caller gets the step 5 refusal naming both agents. A key that cannot say who holds it is not a
 * proof of anything.
 *
 * THIS GAP CLOSES ON ITS OWN. Once `held_keys.whose_id` holds the minted id, every holder string is
 * an id, an id is exact, and no key is ambiguous again. Nothing here changes on that day.
 *
 * IT REFUSES NOTHING ITSELF. A key whose holder no row answers to proves nothing here either, and the
 * resolver falls through exactly as it does for a keyless request.
 */
export function theAgentAKeysHolderIs(whoseId: string): AgentIdentity | null {
  return theOneAgentAStringNames(sqlite, whoseId)
}
