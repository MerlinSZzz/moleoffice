// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `whyReadingSomebodyElsesIsRefused` was moved byte for byte out of src/server/lib/messages.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import type { ParticipantRef } from '@shared/participants.ts'

/**
 * THE OWNER READING A CONVERSATION BETWEEN TWO AGENTS, AS ONE OF THEM SEES IT.
 *
 * As the user with high permission, the person can switch to an
 * agent's view. Criterion M12.
 *
 * READING WRITES NOTHING ON ANY MESSAGE. No mark moves, nothing is marked seen, and neither agent's
 * conversation changes because somebody read it: the reader is reading it, not taking part in it. What IS
 * recorded is the read itself, and it is recorded the way every other request is — the row this call
 * leaves in `api_calls` carries who asked, when, and which pair they asked about. A second table
 * saying the same thing would be the same fact in two places.
 */
export function whyReadingSomebodyElsesIsRefused(me: ParticipantRef | null): string | null {
  if (me === null) {
    return (
      'This reader is in neither registry, so it may not read this conversation. GET /api/participants lists every ' +
      'person and every agent that keeps a standing inbox.'
    )
  }
  if (me.kind !== 'person') {
    return (
      'Only a person may read a conversation they are not part of. An agent reads what was said to it and what it ' +
      'said, and nothing else.'
    )
  }
  return null
}
