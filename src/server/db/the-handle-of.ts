// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HANDLE THE REGISTRY GIVES ONE STORED PARTICIPANT.
 * `theHandleOf` was moved byte for byte out of src/server/lib/merge-queue-page.ts, with no change of
 * behaviour. That file imports it back and re-exports it, so every caller keeps its import.
 */
import type { ParticipantRef } from '@shared/participants.ts'
import { readParticipant } from './read-participant.ts'

/** The handle the registry gives one stored participant, or null when no registry row answers it. Who pushed to main is named by it too. */
export function theHandleOf(who: { kind: string; id: string }): string | null {
  // A MOVER IS STORED AS ANY KIND OF PARTICIPANT (`MovedFirst['by']`); only an agent or a person has a registry row.
  const row = who.kind === 'agent' || who.kind === 'person' ? readParticipant(who as ParticipantRef) : null
  return row === null ? null : row.handle
}
