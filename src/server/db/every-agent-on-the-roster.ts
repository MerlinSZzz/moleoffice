// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `everyAgentOnTheRoster` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `theRosterStatement` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `REGISTRY_ROSTER` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { whoTheRowSays } from './read-participant.ts'
import type { WhoAnAgentIs } from '../lib/participants.ts'
import { sqlite } from './client.ts'

/**
 * WHO EVERY AGENT IS, in the order `listParticipants` gives, read off the registry rows in one statement and nothing
 * else (wave 13y round 50). `listParticipants` builds each agent whole and reads every agent's runtime besides, and the
 * plugins' roster carries neither.
 */
export function everyAgentOnTheRoster(): WhoAnAgentIs[] {
  return (theRosterStatement().all() as Record<string, unknown>[]).map(whoTheRowSays)
}
export function theRosterStatement(): { all: () => unknown[] } {
  const kept = REGISTRY_ROSTER.get(sqlite)
  if (kept !== undefined) return kept
  const made = sqlite.prepare('SELECT id, handle, name, role, retired, credential, started_by_kind, started_by_id, created_at FROM agents ORDER BY handle')
  REGISTRY_ROSTER.set(sqlite, made)
  return made
}
export const REGISTRY_ROSTER = new WeakMap<object, { all: () => unknown[] }>()
