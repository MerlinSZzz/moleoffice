// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theRowAnArrivingReferenceNames` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { readParticipant } from '../db/read-participant.ts'
import { theAgentAnArrivingReferenceNames } from './the-agent-an-arriving-reference-names.ts'
import type { RegisteredAgent, WhatTheCallerIsDoing } from './participants.ts'

/**
 * THE WHOLE REGISTRY ROW AN ARRIVING REFERENCE NAMES, read by the id the one resolver answers, or null
 * because nobody bears that name.
 *
 * For the doors that are handed an agent's handle in their path and need its row: the handle doors
 * and the held process. A handle can be borne by one live agent and any number of retired ones
 * (criterion I3), so reading the row by the handle alone could answer the wrong one; the resolver
 * answers the live one, a retired one for a read, and refuses a name that means two agents.
 */
export function theRowAnArrivingReferenceNames(reference: string, doing: WhatTheCallerIsDoing): RegisteredAgent | null {
  const found = theAgentAnArrivingReferenceNames(reference, doing)
  return found === null ? null : (readParticipant({ kind: 'agent', id: found.agent.id }) as RegisteredAgent | null)
}
