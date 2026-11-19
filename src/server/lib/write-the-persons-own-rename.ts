// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `writeThePersonsOwnRename` was moved byte for byte out of src/server/lib/agent-names.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from '../db/client.ts'
import { anOfficeId } from './ids.ts'
import { nowStamp } from '@shared/time.ts'
import type { ParticipantRef } from '@shared/participants.ts'

/**
 * THE ROW FOR AN AGENT THE PERSON RENAMED AT ONCE, through the participants PATCH door. The person
 * is the proposer, the approver and the one who answered, and the answer is 'approved' at the same moment. `because` is
 * the reason the person gave beside the name, or null when they gave none.
 *
 * IT IS CALLED BEFORE THE NAME IS WRITTEN, so it reads the old name from the row. A name that does not change writes
 * nothing, because nothing was renamed. The caller's transaction holds the row and the name together.
 */
export function writeThePersonsOwnRename(agentId: string, newName: string, by: ParticipantRef, because: string | null): void {
  if (by.kind !== 'person') {
    throw new Error(`Only the person renames an agent at once, and this rename was asked for by "${by.id}", who is not the person.`)
  }
  const held = sqlite.prepare('SELECT name FROM agents WHERE id = ?').get(agentId) as { name: string } | undefined
  if (held === undefined) throw new Error(`The agent "${agentId}" was renamed, and no registry row has that id.`)
  if (held.name === newName) return
  const at = nowStamp()
  sqlite
    .prepare(
      'INSERT INTO agent_renames (id, agent_id, way, old_name, new_name, proposed_by_kind, proposed_by_id, ' +
        'proposed_because, proposed_at, approver_kind, approver_id, answer, answered_by_kind, answered_by_id, answered_at) ' +
        "VALUES (?, ?, 'at once', ?, ?, 'person', ?, ?, ?, 'person', ?, 'approved', 'person', ?, ?)",
    )
    .run(anOfficeId(), agentId, held.name, newName, by.id, because, at, by.id, by.id, at)
}
