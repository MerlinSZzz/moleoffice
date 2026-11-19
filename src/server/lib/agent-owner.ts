// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
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
