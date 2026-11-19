// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** M109: a claimed dispatch whose local worker disappeared ends through the ordinary finish path. */
import { theRecordedProcessIsGone } from '../../config/own-rows.mjs'
import { sqlite } from '../db/client.ts'
import { finishRun } from './agents.ts'
import { thisMachine } from './machines.ts'
import { osProbe, type AProcessToRead } from './resources.ts'

export function endDispatchesWhoseWorkerIsGone(): string[] {
  const machine = thisMachine()
  if (machine === null) return []
  const claims = theClaimsOfThisMachine(machine)
  const ended: string[] = []
  const probe = osProbe()
  for (const claim of claims) {
    const pid = Number(claim.pid)
    if (!Number.isSafeInteger(pid) || pid < 1 || ended.includes(claim.id)) continue
    const live = probe.processById(pid)
    if (theRecordedProcessIsGone({ pid, pidStartedAt: claim.startedAt }, live) !== 'gone') continue
    finishRun(claim.id, {
      error: `Dispatch run ${claim.id} crashed: its worker process ${pid} on ${machine} is gone without a result.`,
    }, undefined, 'crashed')
    ended.push(claim.id)
  }
  return ended
}

/** The processes `endDispatchesWhoseWorkerIsGone` reads, for `readFirst`: the worker of each claim this machine holds. */
export function theProcessesTheGoneDispatchCheckReads(): AProcessToRead[] {
  const machine = thisMachine()
  if (machine === null) return []
  return theClaimsOfThisMachine(machine)
    .map((claim) => Number(claim.pid))
    .filter((pid) => Number.isSafeInteger(pid) && pid >= 1)
    .map((pid) => ({ pid, alsoItsStarterIfEnded: false }))
}

function theClaimsOfThisMachine(machine: string): { id: string; pid: string; startedAt: string | null }[] {
  // New workers claim with their session id. Older names have no process we can safely identify.
  return sqlite.prepare(
    "SELECT r.id, p.key AS pid, p.os_started_at AS startedAt FROM agent_runs r " +
    "JOIN records s ON s.id = r.claimed_by AND s.kind = 'session' " +
    "JOIN session_resources p ON p.session_record_id = s.id AND p.type = 'process' " +
    "AND p.key = CAST(json_extract(s.data, '$.extra.discovered.pid') AS TEXT) " +
    "WHERE r.state IN ('claimed', 'running') AND r.claimed_from_machine = ? " +
    "AND json_extract(s.data, '$.runtime') = 'mole-office-agent-worker'",
  ).all(machine) as { id: string; pid: string; startedAt: string | null }[]
}
