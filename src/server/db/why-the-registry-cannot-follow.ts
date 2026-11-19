// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `whyTheRegistryCannotFollow` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { whyHandleIsRefused } from '@shared/participants.ts'
import { agentForRecord } from './agent-for-record.ts'
import { agentByHandle } from './agent-by-handle.ts'

/**
 * WHY THE REGISTRY CANNOT FOLLOW THIS AGENT RECORD, in the sentence the writer reads, or null
 * because it can.
 *
 * Criterion I3: two live agents never share a handle. The index `agents_live_handle_idx` refuses
 * such a row with a raw database error, so the record write asks this first and refuses in words,
 * before anything is written. `keepTheAgentRegistryInStep` asks it again, because it is the function
 * that writes the row.
 *
 * `record.id` is null on a create, because no record exists yet to be mapped.
 *
 * FOUR ANSWERS, one per path:
 *
 *   - A RECORD NOT YET MAPPED whose handle a live agent bears is mapped onto that agent, as it
 *     always was: another project's record under the same handle is the same agent. Null.
 *   - A RECORD NOT YET MAPPED whose handle only retired agents bear gets a new agent with a new id.
 *     Null. This is what frees a retired handle.
 *   - A RECORD THAT STAYS RETIRED may bear any handle, because the index covers live rows only. Null.
 *   - A MAPPED RECORD THAT WILL BE LIVE, renamed onto a handle another live agent bears, or made
 *     active again while another live agent bears its handle, is refused, naming that agent.
 *
 * A RETIRED LEGACY AGENT'S HANDLE IS FREED AS WELL. An agent registered before criterion I1 has its
 * handle as its id, so once a new agent takes that handle, the one string is
 * the retired agent's id and the new agent's handle. That is the cost accepted with option
 * 1 of plan be2Z8l-GArM2: the resolver refuses such a bare string naming both agents
 * (`whyAReferenceNamesTwoAgents`) until the caller sends the id or holds its key, and a caller's key
 * settles it (`participantForActor` passes the key to step 1).
 */
export function whyTheRegistryCannotFollow(record: { id: string | null; handle: unknown; state: unknown }): string | null {
  const handle = typeof record.handle === 'string' ? record.handle.trim() : ''
  if (handle === '' || whyHandleIsRefused(handle) !== null) return null
  if (record.state === 'retired') return null
  const mapped = record.id === null ? null : agentForRecord(record.id)
  if (mapped !== null && !mapped.retired && mapped.handle === handle) return null

  const live = agentByHandle(handle)
  if (mapped === null && live !== null) return null
  if (mapped !== null && live !== null && live.id !== mapped.id) {
    if (mapped.retired) {
      return (
        `${mapped.name} (${mapped.id}) cannot be made active again under the handle "${handle}": ` +
        `${live.name} (${live.id}) bears that handle now and is active. Two live agents never share a handle. ` +
        'Nothing was written.'
      )
    }
    return (
      `${mapped.name} (${mapped.id}) cannot take the handle "${handle}": ${live.name} (${live.id}) bears it ` +
      'and is active. Two live agents never share a handle. Nothing was written.'
    )
  }
  return null
}
