// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `agentByHandle` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `theAgentByHandleStatement` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `AGENT_BY_HANDLE` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { asAgent } from './read-participant.ts'
import type { RegisteredAgent } from '../lib/participants.ts'
import { sqlite } from './client.ts'

/**
 * THE ONE LIVE AGENT BEARING THIS HANDLE, or null because no live agent bears it.
 *
 * A HANDLE IS UNIQUE AMONG LIVE AGENTS ONLY. Criterion I3: a retired agent
 * keeps its row and its handle, and a new agent may take that handle with an id of its own. So one
 * handle may be borne by any number of retired rows and at most one live row, and the index
 * `agents_live_handle_idx` (migration 0174) is what holds the second half.
 *
 * THIS IS THE QUESTION "IS THE NAME TAKEN?" A caller that asks which agent an arriving string names
 * asks `theAgentAnArrivingReferenceNames`, which answers a retired agent for a read. A caller that
 * reads a stored string asks the readers of lib/agent-references.ts. A caller that has just written a
 * row reads it by its id.
 */
export function agentByHandle(handle: string): RegisteredAgent | null {
  const row = theAgentByHandleStatement().get(handle) as Record<string, unknown> | undefined
  return row === undefined ? null : asAgent(row)
}
export function theAgentByHandleStatement(): { get: (handle: string) => unknown } {
  const kept = AGENT_BY_HANDLE.get(sqlite)
  if (kept !== undefined) return kept
  const made = sqlite.prepare('SELECT * FROM agents WHERE handle = ? AND retired = 0')
  AGENT_BY_HANDLE.set(sqlite, made)
  return made
}
/**
 * ONE PREPARED STATEMENT PER DATABASE HANDLE, NOT ONE PER CALL.
 *
 * MEASURED, 11 September 2026, on a copy of their database (problem 9UeL9VeVPn33): reading the
 * contact list asked this question once for every message in the pool — 1,455 times a call, to say
 * which rung each sender stands on — and a third of the door's time was SQLite parsing the same
 * eleven words again each time. The statement is kept beside the handle it was prepared on, so a
 * test that opens a fresh database gets a fresh statement, and a statement is never used across
 * two databases. SQLite re-prepares a kept statement by itself when the schema changes under it.
 */
export const AGENT_BY_HANDLE = new WeakMap<object, { get: (handle: string) => unknown }>()
