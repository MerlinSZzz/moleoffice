// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `agentsStartedFor` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from './client.ts'
import { asAgent } from './read-participant.ts'
import type { RegisteredAgent } from '../lib/participants.ts'

/**
 * EVERY ACTIVE AGENT THAT WAS STARTED FOR ONE RECORD. Criterion P15.
 *
 * A retired one is left out: retiring an agent that is already retired would move the reason and the
 * date to today, which is the same defect the obligation discharge route guards against.
 */
export function agentsStartedFor(recordId: string): RegisteredAgent[] {
  return (
    sqlite.prepare('SELECT * FROM agents WHERE started_for = ? AND retired = 0').all(recordId) as Record<string, unknown>[]
  ).map((row) => asAgent(row))
}
