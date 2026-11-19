// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theAgentRowAnIdNames` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from '../db/client.ts'
import { AGENT_REGISTRY_NAMESPACE, registryAliasTarget } from './registry-aliases/index.ts'
import { readParticipant } from '../db/read-participant.ts'
import type { RegisteredAgent } from './participants.ts'

/**
 * ONE AGENT'S REGISTRY ROW, BY ITS REGISTRY ID OR BY AN OLD ID FILED AS ITS PERMANENT ALIAS, or null because neither
 * names an agent. The id is asked exactly as it was sent, and a handle is never followed. A write door that is handed an
 * agent's id reads the agent with this, so a writer that kept an old id while the office was closed for the re-mint
 * lands on the agent the old id was. The row carries the canonical id.
 */
export function theAgentRowAnIdNames(id: string): RegisteredAgent | null {
  return readParticipant({ kind: 'agent', id: registryAliasTarget(sqlite, { namespace: AGENT_REGISTRY_NAMESPACE, id }) ?? id }) as RegisteredAgent | null
}
