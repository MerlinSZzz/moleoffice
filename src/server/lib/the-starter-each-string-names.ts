// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theStarterEachStringNames` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `theStartersWithThisIdOrHandleStatement` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `STARTERS_BY_ID_OR_HANDLE` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from '../db/client.ts'
import { registryAliasTarget } from './registry-aliases/index.ts'
import { whoSetIt } from '../db/read-participant.ts'
import type { AStarter } from './participants.ts'

/**
 * THE SAME STORED READER, OVER THE ROWS ONE STRING CAN NAME, for a caller that follows one chain and holds no list. The
 * rows whose id or whose handle is the string are the only rows that can answer it, so only they are read. The agent
 * with that id is the answer; failing that, the ONE agent with it as a handle; and nobody where none has it or more
 * than one does. Retired agents are read too, as the list holds them. Each string is read once for as long as the
 * reader is held.
 *
 * WHY. The route of one message read every agent row, every person row and every agent's runtime to follow a chain of
 * two or three starters: 1,962 of the 2,048 rows one answer to an agent read, on a made-up office of 972 agents (round
 * 42 of wave 13u). Round 43 gave the same reader to the other callers a door or a write reaches that walk one chain:
 * where a question is, the two rules on filing a session, the registration door, the doors about one participant, who
 * is responsible for a task, who is told about a credential's mismatch, and who may stop what an ended run left open.
 */
export function theStarterEachStringNames(): (id: string) => AStarter | null {
  const statement = theStartersWithThisIdOrHandleStatement()
  const read = new Map<string, AStarter | null>()
  return (id) => {
    const kept = read.get(id)
    if (kept !== undefined) return kept
    const canonical = registryAliasTarget(sqlite,{namespace:'agent-registry',id}) ?? id
    const rows = (statement.all(canonical, canonical) as Record<string, unknown>[]).map((row) => ({
      id: String(row['id']),
      handle: String(row['handle']),
      startedBy: whoSetIt(row['started_by_kind'], row['started_by_id']),
    }))
    const handles = rows.filter((one) => one.handle === id)
    const answer = rows.find((one) => one.id === canonical) ?? (canonical === id && handles.length === 1 ? handles[0]! : null)
    read.set(id, answer)
    return answer
  }
}
export function theStartersWithThisIdOrHandleStatement(): { all: (...said: string[]) => unknown[] } {
  const kept = STARTERS_BY_ID_OR_HANDLE.get(sqlite)
  if (kept !== undefined) return kept
  const made = sqlite.prepare('SELECT id, handle, started_by_kind, started_by_id FROM agents WHERE id = ? OR handle = ?')
  STARTERS_BY_ID_OR_HANDLE.set(sqlite, made)
  return made
}
export const STARTERS_BY_ID_OR_HANDLE = new WeakMap<object, { all: (...said: string[]) => unknown[] }>()
