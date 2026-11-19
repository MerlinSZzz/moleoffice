// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RECORD DOOR'S TERRITORY CHECK: WHOSE A RUN'S TERRITORY IS, AND WHETHER THIS CALLER MAY WRITE IT. This is 13u's
 * territory hook. It was moved whole out of src/server/lib/records.ts in wave 13s round 107, with no change of
 * behaviour, so that a change to it no longer meets another line's change in that file. The line that owns it is
 * 13u. It reads and refuses, and it writes no record.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`, and every caller still imports these names
 * from records.ts. A test deleted on 13 November 2026 held that. One word changed in the move: `checkAndNormalizeTerritory` is exported, because `createRecordWithReport` and `patchRecord` in
 * records.ts still call it.
 *
 * THIS FILE AND records.ts IMPORT EACH OTHER: this one takes `PanelError` and four helpers from it. That is safe for
 * the same reason as records/reading.ts: every reference this file makes to records.ts is inside a function body, so
 * nothing of records.ts is read while it is still being evaluated. The same holds for claims.ts, which imports
 * records.ts too.
 */
import type { PanelRecord } from '@shared/types.ts'
import { sayInEnglish } from '@shared/i18n.ts'
import { theKeyHolderIsTheRegisteredStarterOf, validateATerritory } from '../claims.ts'
import { theAgentOnlyASessionAnswersAs, type TheSessionLookups } from '../messages.ts'
import { type RegisteredAgent } from '../participants.ts'
import { participantForActor } from '../participant-for-actor.ts'
import { readParticipant } from '../../db/read-participant.ts'
import { whyAnAgentsOwnKeyDoesNotHold } from '../the-run-a-key-holds.ts'
import { theAgentARunServes } from '../the-agent-a-run-serves.ts'
import { everyAgentAStoredStampCouldName, theCallersAgentRow, whoFiled, type Actor } from '../records.ts'
import { sameJson } from '@shared/same-json.ts'
import { PanelError } from '../panel-error.ts'

/** The record door's territory check, given exactly the normalized row the writer will store. */
export type TerritoryWriteCheck = (run: PanelRecord, filedBy?: { actorType: string; actorId: string }) => void

/**
 * THE READS OF `theAgentIdOfATerritoryRun`, handed in by a caller that asks it about every territory run in one write.
 * Each answers what the one-row reader it stands for answers, so the order stays below and only the reads are swapped.
 */
export interface TheTerritoryRunLookups extends TheSessionLookups {
  /** What `whoFiled` answers for this record. */
  filerOf: (workspaceId: string, recordId: string) => ReturnType<typeof whoFiled>
}

/** The served registry agent, or the unique recorded agent filer when this run already exists. */
export function theAgentOfATerritoryRun(
  run: { id: string; workspaceId: string; data: Record<string, unknown> },
  // Only a not-yet-filed session supplies the stamp its create will store in logChange.
  filedBy?: { actorType: string; actorId: string },
): RegisteredAgent | null {
  const owner = theAgentIdOfATerritoryRun(run, filedBy)
  return owner === null ? null : readParticipant({ kind: 'agent', id: owner }) as RegisteredAgent | null
}

/**
 * THE ID OF THAT AGENT, which a caller asking about many runs reads with `lookups`. Every owner found here is the id of a
 * row in agents, and `readParticipant` answers for every such row, so this reads no agent row of its own.
 */
export function theAgentIdOfATerritoryRun(
  run: { id: string; workspaceId: string; data: Record<string, unknown> },
  filedBy?: { actorType: string; actorId: string },
  lookups?: TheTerritoryRunLookups,
): string | null {
  const serving = theAgentARunServes(run.data, lookups?.identityOf) ?? theAgentOnlyASessionAnswersAs(run, run.workspaceId, lookups)
  const filed = serving === null ? filedBy ?? (run.id !== '' ? (lookups?.filerOf ?? whoFiled)(run.workspaceId, run.id) : null) : null
  const filers = filed?.actorType === 'agent' ? everyAgentAStoredStampCouldName(filed.actorId, lookups?.identityOf) : []
  return serving?.id ?? (filers.length === 1 ? filers[0]!.id : null)
}

/** Use the record door's proved agent and existing run-key ownership reader, never a session header alone. */
export function checkAndNormalizeTerritory(
  run: { recordId: string; workspaceId: string; data: Record<string, unknown> },
  next: Record<string, unknown>,
  actor: Actor,
): boolean {
  if (Object.hasOwn(next, 'territory')) {
    next['territory'] = validateATerritory(next['territory'] as string[])
  }
  if (sameJson(run.recordId === '' ? undefined : run.data['territory'], next['territory'])) return false
  const caller = participantForActor(actor)
  const row = theAgentOfATerritoryRun({ id: run.recordId, data: run.data, workspaceId: run.workspaceId })
  const owner = row?.id
  const proved = actor.provedBy === 'an-agent-key' && actor.keyHolder !== undefined && caller?.kind === 'agent'
  const own = proved && (owner === caller.id || (run.recordId === ''
    ? row === null
    : whyAnAgentsOwnKeyDoesNotHold({ id: caller.id, handle: theCallersAgentRow(actor)?.handle ?? caller.id }, {
        id: run.recordId, data: run.data, deleted: false,
      }) === null))
  const starter = proved && row !== null && theKeyHolderIsTheRegisteredStarterOf(row, actor.keyHolder!)
  if (!own && !starter) throw new PanelError(sayInEnglish('territory.onlyWriters'), 403)
  return true
}
