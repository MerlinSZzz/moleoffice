// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `whomAnAgentIsReplyingTo` was moved byte for byte out of src/server/lib/turn-drafts.ts, with no change of behaviour.
 * `HELD_FOR` was moved byte for byte out of src/server/lib/turn-drafts.ts, with no change of behaviour.
 * `FROM_THE_HELD` was moved byte for byte out of src/server/lib/turn-drafts.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from './client.ts'
import { TURN } from '@shared/turn-drafts.ts'
import { STORED_FIELDS, theWordsOfAStoredField } from './schema.ts'
import { DRAFT_KIND } from '@shared/drafts.ts'

/**
 * WHOM AN AGENT IS REPLYING TO: the readers of every draft it holds now, each key as readersOf makes it. This is the
 * one fact the chat's "Replying" is drawn from. It reads only the agent's held drafts, through the index.
 */
export function whomAnAgentIsReplyingTo(agentId: string): string[] {
  const rows = sqlite
    .prepare(
      `SELECT DISTINCT json_extract(data, '$.${TURN}.readers') AS readers ${FROM_THE_HELD} AND ${HELD_FOR} = ? AND deleted_at IS NULL`,
    )
    .all(agentId) as { readers: string }[]
  return rows.map((one) => one.readers).sort()
}
/**
 * THE AGENT A DRAFT IS HELD FOR, in the words of its index (`STORED_FIELDS.heldTurnDraftAgentId` in db/schema.ts,
 * migration 0328): null once the draft is sent or was refused when it went. Every read below names `kind` and this,
 * and reads through that index by name, so none reads every draft: the read of every held draft has no agent to look up,
 * and without the name SQLite read it through the kind's index and every draft ever kept.
 */
export const HELD_FOR = theWordsOfAStoredField(STORED_FIELDS.heldTurnDraftAgentId, 'data')
export const FROM_THE_HELD = `FROM records INDEXED BY records_held_turn_draft_agent_idx WHERE kind = '${DRAFT_KIND}' AND ${HELD_FOR} IS NOT NULL`
