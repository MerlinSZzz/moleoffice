// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `thisAgentWasRegisteredWithNoKeyOfItsOwn` was moved byte for byte out of src/server/lib/run-keys-only.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from './client.ts'

/** Whether the agent with this registry id was registered with no key of its own. This is the one reader of its mark. */
export function thisAgentWasRegisteredWithNoKeyOfItsOwn(agentId: string): boolean {
  const row = sqlite.prepare('SELECT run_keys_only FROM agents WHERE id = ?').get(agentId) as { run_keys_only: number } | undefined
  return row?.run_keys_only === 1
}
