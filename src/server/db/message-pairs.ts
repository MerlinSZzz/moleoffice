// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PAIR OF AGENTS AS ONE STRING: ITS SEPARATOR, ITS READER AND ITS WRITER. This file opens nothing. Loading messages.ts
 * opens the store, and the re-mint reads pairs inside `npm run db:migrate` (registry-aliases/historical-reader.ts) and
 * writes them again (registry-aliases/remint-plain.ts), so the three were moved here unchanged, and messages.ts gives them
 * on as a re-export.
 */
import type { ParticipantRef } from '@shared/participants.ts'

/** The separator between the two ids of a pair. Not a character a handle may hold, so it cannot be ambiguous. */
export const PAIR_SEPARATOR = '~'

/** Read a pair back, or null when the string is not one. Both sides of a pair are agents. */
export function pairFrom(said: string): [ParticipantRef, ParticipantRef] | null {
  const parts = said.split(PAIR_SEPARATOR)
  if (parts.length !== 2) return null
  const [a, b] = parts
  if (a === undefined || b === undefined || a === '' || b === '' || a === b) return null
  return [
    { kind: 'agent', id: a },
    { kind: 'agent', id: b },
  ]
}

/** The pair as one string, for a path and for the row that says which one was read. */
export function pairKey(a: ParticipantRef, b: ParticipantRef): string {
  return [a.id, b.id].sort().join(PAIR_SEPARATOR)
}
