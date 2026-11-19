// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `whoIsToldOfASeal` was moved byte for byte out of src/server/lib/sealed-tip.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from '../db/client.ts'
import { theOneAgentAStringNames } from './agent-references.ts'
import type { RegisteredAgent } from './participants.ts'
import { readParticipant } from '../db/read-participant.ts'
import { theRecordedOwner } from './agent-owner.ts'
import type { TheStarterNotice } from './sealed-tip.ts'

/**
 * WHO IS TOLD OF A SEAL: THE STARTER RECORDED ON THE AGENT THE RUN SERVED. Problem VJom2joVhqjM, part 1.
 *
 * This is the reading the check uses to tell a starter of its result (`reads.agent?.startedBy` in
 * ./inspection.ts), and the reading that says who may close a run as superseded. It names a participant,
 * and a message goes to a participant. A run's `parentAttachment` names the starting RUN instead, and only
 * on an agent's first run (criterion P11), so it is not read here.
 *
 * `startedBy` IS A STORED REFERENCE, so an agent is read with the stored reader: exact id, then the one
 * agent bearing the string as a handle, and nobody where the string names none or more than one. A person
 * must be one the registry holds. Where no starter can be named, nobody is told and the reason is kept on
 * the seal, because a message sent to a guess is worse than none.
 */
export function whoIsToldOfASeal(agent: RegisteredAgent): TheStarterNotice {
  const starter = agent.startedBy
  if (starter === null) return { because: `Nobody is recorded as having started ${agent.handle}, so no starter was told of this seal.` }
  if (starter.kind === 'agent') {
    const one = theOneAgentAStringNames(sqlite, starter.id)
    if (one === null) {
      return {
        because:
          `The starter recorded on ${agent.handle} is the agent "${starter.id}", and not exactly one registered agent ` +
          'answers to that name, so no starter was told of this seal.',
      }
    }
    return { to: { kind: 'agent', id: one.id } }
  }
  if (readParticipant(starter) === null) {
    return { because: `The starter recorded on ${agent.handle} is "${starter.id}", and nobody registered answers to that name, so no starter was told of this seal.` }
  }
  return { to: starter }
}

/** Read the current owner for notices, keeping the original starter for history and authorization. */
export function whoIsToldOfTheRun(agent: RegisteredAgent): TheStarterNotice {
  const reading = theRecordedOwner(agent)
  if (reading.state === 'absent') return { because: `No owner is recorded for ${agent.handle}, so nobody was told.` }
  if (reading.state === 'broken') return { because: `The recorded owner of ${agent.handle} is incomplete, so nobody was told.` }
  if (reading.owner.kind === 'person') {
    return readParticipant(reading.owner) === null
      ? { because: `The recorded owner of ${agent.handle} could not be found, so nobody was told.` }
      : { to: reading.owner }
  }
  const owner = theOneAgentAStringNames(sqlite, reading.owner.id)
  return owner === null
    ? { because: `The recorded owner of ${agent.handle} does not name one registered agent, so nobody was told.` }
    : { to: { kind: 'agent', id: owner.id } }
}
