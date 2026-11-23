// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sameParticipant } from '@shared/messages.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import type { RegisteredAgent } from './participants.ts'

/** Validate the two stored fields together without guessing from a starter. */
export function theRecordedOwner(agent: Pick<RegisteredAgent, 'ownerId' | 'ownerKind'>):
  | { state: 'absent' }
  | { state: 'broken' }
  | { state: 'held'; owner: ParticipantRef } {
  const { ownerId, ownerKind } = agent
  if (ownerId === null && ownerKind === null) return { state: 'absent' }
  if ((ownerKind === 'person' || ownerKind === 'agent') && typeof ownerId === 'string' && ownerId.trim() !== '') {
    return { state: 'held', owner: { kind: ownerKind, id: ownerId } }
  }
  return { state: 'broken' }
}

/**
 * WHETHER `who` IS THE AGENT RECORDED AS THIS AGENT'S LEADER: the owner is held, is an agent, and is the same
 * participant. An absent or broken owner leads nobody, and the leader's own leader is not asked. A person recorded as
 * the owner is not read here: the doors that ask this take the person on their own line. The session check
 * (lib/records/may-write.ts) and the next-round door (lib/next-round.ts) ask this.
 */
export function isItsRecordedLeader(agent: Pick<RegisteredAgent, 'ownerId' | 'ownerKind'>, who: ParticipantRef): boolean {
  const recorded = theRecordedOwner(agent)
  return recorded.state === 'held' && recorded.owner.kind === 'agent' && sameParticipant(recorded.owner, who)
}
