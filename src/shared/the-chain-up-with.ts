// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theChainUpWith` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { participantWord, type ParticipantRef } from '@shared/participants.ts'
import type { ChainReading, AStarter } from '../server/lib/participants.ts'

/**
 * THE SAME WALK, WITH THE STORED READER GIVEN. `theChainUpFrom` gives the reader over a list it holds, and so does the
 * roster; a caller that walks one chain gives `theStarterEachStringNames`, which reads only the rows a string can name.
 * There is one walk, so the page and the route cannot follow two different chains.
 */
export function theChainUpWith(from: ParticipantRef | null, theAgentThisNames: (id: string) => AStarter | null): ChainReading {
  const chain: ParticipantRef[] = []
  const seen = new Set<string>()
  let at = from

  while (at !== null) {
    // THE RUNG READ WITH THE STORED READER, so a stored handle and a stored id name the same agent
    // the participants page draws. A person and a name no single agent answers keep the ref they
    // arrived as, because there is no registry row to resolve them to.
    const held = at.kind === 'agent' ? theAgentThisNames(at.id) : null
    if (at.kind === 'agent' && held !== null) at = { kind: 'agent', id: held.id }
    // THE SENTENCES NAME AN AGENT BY THE HANDLE ON ITS ROW, because its id may be a minted one a
    // person would not recognise. Where no row answers, the stored string is shown as it is. The
    // refs returned beside the sentence keep the ids.
    const shown = held === null ? at.id : held.handle
    const key = `${at.kind}:${at.id}`
    if (seen.has(key)) {
      return {
        chain,
        reachesThePerson: false,
        loopAt: at,
        stopsAt: null,
        says: `The starters go round: following them up comes back to the ${participantWord(at.kind)} "${shown}". A chain that goes round reaches nobody, so nobody answers for what is at the bottom of it.`,
      }
    }
    seen.add(key)
    chain.push(at)
    if (at.kind === 'person') {
      return {
        chain,
        reachesThePerson: true,
        loopAt: null,
        stopsAt: null,
        says: `The starters reach ${at.id} in ${String(chain.length)} step${chain.length === 1 ? '' : 's'}.`,
      }
    }
    if (held === null) {
      return {
        chain,
        reachesThePerson: false,
        loopAt: null,
        stopsAt: at,
        says: `Nothing is registered as the agent "${at.id}", so the chain of starters stops there and reaches nobody.`,
      }
    }
    if (held.startedBy === null) {
      return {
        chain,
        reachesThePerson: false,
        loopAt: null,
        stopsAt: at,
        says: `Nobody recorded who started "${shown}", so the chain of starters stops there and reaches nobody.`,
      }
    }
    at = held.startedBy
  }

  return {
    chain,
    reachesThePerson: false,
    loopAt: null,
    stopsAt: null,
    says: 'Nobody recorded a starter, so there is no chain to follow.',
  }
}
