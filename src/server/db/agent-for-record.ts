// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `agentForRecord` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from './client.ts'
import { asAgent } from './read-participant.ts'
import type { RegisteredAgent } from '../lib/participants.ts'

/** The registry row a record of kind `agent` is, or null because nothing has mapped it. */
export function agentForRecord(recordId: string): RegisteredAgent | null {
  const row = sqlite
    .prepare('SELECT a.* FROM agent_records m JOIN agents a ON a.id = m.agent_id WHERE m.record_id = ?')
    .get(recordId) as Record<string, unknown> | undefined
  return row === undefined ? null : asAgent(row)
}
