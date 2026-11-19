// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theAgentARunServes` was moved byte for byte out of src/server/lib/worker.ts, with no change of behaviour.
 * `said` was moved byte for byte out of src/server/lib/worker.ts, with no change of behaviour.
 * `theIdentityByItsOwnRead` was moved byte for byte out of src/server/lib/worker.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from '../db/client.ts'
import { agentForRecord } from '../db/agent-for-record.ts'
import { theOneAgentAStringNames, theOneAgentAmong, type AgentIdentity, type TheIdentityOf, theAgentWithThisId } from './agent-references.ts'
import { everyAgentAReferenceCouldName } from '../db/agent-references.ts'

/**
 * THE AGENT A RUN SERVES, read from the run's own session record, or null because nothing names one.
 *
 * A run names its agent twice. `servingAgent` is the agent's handle, the name the run answers as.
 * `servingAgentId` is the agent's registry id (amendment of 23 September 2026 in
 * design/agents/IDENTITY-ACCEPTANCE.md). Since criterion I1 a new agent's id is not its handle, so
 * the two are different strings, and a reader that compares `servingAgent` with a registry id
 * never matches a new agent.
 *
 * So the id is read from `servingAgentId`, by exact id. A record written before that field existed
 * holds only `servingAgent`, and that string is a stored reference: it is read by exact id, then as
 * the handle of exactly one agent, and names nobody where more than one agent answers to it
 * (criterion I2). A record whose `servingAgentId` no registry row holds names nobody; its
 * `servingAgent` is not asked instead, because the id is the one the run was started for.
 *
 * ONE MORE SPELLING, TRIED LAST. Some runs wrote the id of the agent's own RECORD in `servingAgent`
 * (run `o2RjuOUEIwpf`, 7 September 2026; tests/a-run-that-named-its-agent-by-record-id-is-still-
 * checkable.test.ts says why). `agentForRecord` is the join from that record to its registry row. It
 * is asked only when no registry row answers to the string at all, so a string that names two agents
 * still names nobody.
 *
 * Every reader that asks which agent a run serves asks here: this file, main-world.ts, presence.ts
 * and the run-key door in api/records.ts.
 *
 * `identityOf` is how an id is looked up. A reading that asks about every run hands in every agent's identity read
 * once (`everyAgentsIdentityReadOnce`, wave 13y round 46), which answers what the one-row read answers.
 */
export function theAgentARunServes(data: Record<string, unknown>, identityOf: TheIdentityOf = theIdentityByItsOwnRead): AgentIdentity | null {
  const id = said(data['servingAgentId'])
  if (id !== null) return identityOf(id)
  const stored = said(data['servingAgent'])
  if (stored === null) return null
  let could: ReturnType<typeof everyAgentAReferenceCouldName>
  if (identityOf.reference === undefined) {
    const named = theOneAgentAStringNames(sqlite, stored)
    if (named !== null) return named
    could = everyAgentAReferenceCouldName(sqlite, stored)
  } else {
    could = identityOf.reference(stored)
    const named = theOneAgentAmong(could)
    if (named !== null) return named
  }
  if (could.byId !== null || could.liveByHandle !== null || could.retiredByHandle !== null) return null
  if (identityOf.agentRecord !== undefined) return identityOf.agentRecord(stored)
  const mapped = agentForRecord(stored)
  return mapped === null ? null : identityOf(mapped.id)
}
export function said(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}
/** One agent's identity by one statement: what a reader that asks about one run uses. */
export function theIdentityByItsOwnRead(id: string): AgentIdentity | null {
  return theAgentWithThisId(sqlite, id)
}
