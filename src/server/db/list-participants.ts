// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `listParticipants` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `everyAgentsRuntime` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `theRuntimeOnTheNewestRecord` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `theRegistryListStatements` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `REGISTRY_LIST` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * `THE_REGISTRYS_ORDER` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { asAgent, asPerson } from './read-participant.ts'
import type { RegisteredAgent, RegisteredPerson } from '../lib/participants.ts'
import { sqlite } from './client.ts'
import { readInPieces } from './in-pieces.ts'
import { NEWEST_RECORD_FIRST } from './the-model-on-the-agent-record.ts'
import { declaredRuntimeOrNull } from '@shared/participants.ts'

/** Everything in both registries, for a page that draws them side by side. */
export function listParticipants(): { people: RegisteredPerson[]; agents: RegisteredAgent[] } {
  const statements = theRegistryListStatements()
  const people = (statements.people.all() as Record<string, unknown>[]).map(asPerson)
  const runtimes = everyAgentsRuntime()
  const agents = (statements.agents.all() as Record<string, unknown>[]).map((row) => asAgent(row, runtimes))
  return { people, agents }
}
/**
 * EVERY AGENT'S RUNTIME IN ONE READ, keyed by the agent's id: what `runtimeOfTheAgentRecord` answers for each, from the
 * same rows in the same order. An agent with no live record is absent, and reads as null, which is that reader's answer.
 *
 * `listParticipants` builds every agent, and it asked `runtimeOfTheAgentRecord` once per agent: 1,025 statements on an
 * office of 1,025 agents, for every one of the five sidebar reads that list the registry (wave 13x round 13).
 */
export function everyAgentsRuntime(only?: readonly string[]): Map<string, string | null> {
  const read = (ids: readonly string[] | null): { agent: string; runtime: unknown }[] =>
    sqlite
      .prepare(
        "SELECT m.agent_id AS agent, json_extract(r.data, '$.runtime') AS runtime FROM agent_records m " +
          'JOIN records r ON r.id = m.record_id WHERE r.deleted_at IS NULL ' +
          (ids === null ? '' : `AND m.agent_id IN (${ids.map(() => '?').join(',')}) `) +
          `ORDER BY m.agent_id, ${NEWEST_RECORD_FIRST}`,
      )
      .all(...(ids ?? [])) as { agent: string; runtime: unknown }[]
  // IN PIECES (src/server/db/in-pieces.ts): a read of messages asks about every sender in it, and nothing caps how many.
  // Every row of one agent is in the piece that names it, so the first row of each agent is still its newest record.
  const rows = only === undefined ? read(null) : readInPieces(only, read)
  const out = new Map<string, string | null>()
  for (const row of rows) if (!out.has(row.agent)) out.set(row.agent, theRuntimeOnTheNewestRecord(row))
  return out
}
/** What the newest live record's stored runtime says, or null because there is no record or it names none. */
export function theRuntimeOnTheNewestRecord(row: { runtime?: unknown } | undefined): string | null {
  if (row === undefined || row.runtime === null || row.runtime === undefined) return null
  return declaredRuntimeOrNull(row.runtime)
}
export function theRegistryListStatements(): { people: { all: () => unknown[] }; agents: { all: () => unknown[] }; these: { all: (ids: string) => unknown[] } } {
  const kept = REGISTRY_LIST.get(sqlite)
  if (kept !== undefined) return kept
  const made = {
    people: sqlite.prepare('SELECT * FROM people ORDER BY handle'),
    agents: sqlite.prepare(`SELECT * FROM agents ORDER BY ${THE_REGISTRYS_ORDER}`),
    these: sqlite.prepare(`SELECT * FROM agents WHERE id IN (SELECT value FROM json_each(?)) ORDER BY ${THE_REGISTRYS_ORDER}`),
  }
  REGISTRY_LIST.set(sqlite, made)
  return made
}
/**
 * ONE PAIR OF PREPARED STATEMENTS PER DATABASE HANDLE, NOT ONE PAIR PER CALL. Same pattern as
 * `theAgentByHandleStatement` above.
 *
 * MEASURED, 11 September 2026 (problem 9UeL9VeVPn33): `listParticipants` re-prepared both of these
 * on every call — once per `GET /api/participants`, and again once per `GET /api/presence`, since
 * `everybodysPresence` calls it to build the roster it walks.
 */
export const REGISTRY_LIST = new WeakMap<object, { people: { all: () => unknown[] }; agents: { all: () => unknown[] }; these: { all: (ids: string) => unknown[] } }>()
/**
 * THE ORDER OF THE AGENTS IN THE REGISTRY'S LIST, the whole list's and a list of some of them (wave 13y round 51). The
 * whole list said only `ORDER BY handle` and walked the handle index, which keeps the rows of one handle in rowid order,
 * so this is the order it already gave. It is written down because a read of a few agents by id does not walk that
 * index, and a retired agent shares its handle with the live one.
 */
export const THE_REGISTRYS_ORDER = 'handle, rowid'
