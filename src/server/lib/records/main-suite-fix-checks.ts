// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHECKS ON A MAIN-SUITE-FIX PROBLEM, IN A MODULE OF THEIR OWN.
 *
 * The six functions here were moved whole out of src/server/lib/records.ts with no change of
 * behaviour: the original pin, the suite receipt it names, who may control the fix, whom its notices
 * go to, and the re-read of the original pin before the runner or queue uses either. records.ts hands
 * the five exported names on with `export *`, so no caller changed; `originalMainSuiteFix` is used
 * only here.
 *
 * This file imports records.ts for `recordInWorkspace`, `theSecretaryOfThisOffice` and the `Actor`
 * type. Every reference it makes to records.ts is inside a function body, so the cycle is safe.
 */
import { mainSuiteFixSchema, mainSuiteFixPinned, type MainSuiteFix } from '@shared/main-suite-fix.ts'
import { sqlite } from '../../db/client.ts'
import { PanelError } from '../panel-error.ts'
import { participantForActor } from '../participant-for-actor.ts'
import { readParticipant } from '../../db/read-participant.ts'
import { recordInWorkspace, theSecretaryOfThisOffice, type Actor } from '../records.ts'
import { theAgentARunServes } from '../the-agent-a-run-serves.ts'
import { getRecord } from './reading.ts'

function originalMainSuiteFix(id: string, workspaceId: string): MainSuiteFix {
  const row = sqlite.prepare("SELECT data FROM revisions WHERE record_id = ? AND workspace_id = ? AND seq = 1 AND op = 'create' AND kind = 'problem'").get(id, workspaceId) as { data: string } | undefined
  const parsed = row === undefined ? null : mainSuiteFixSchema.safeParse(JSON.parse(row.data)['mainSuiteFix'])
  if (parsed === null || !parsed.success) throw new PanelError(`Problem ${id} has no original mainSuiteFix create. Nothing was written.`, 409)
  return parsed.data
}

export function thePinnedSuiteReceipt(pin: MainSuiteFix['receipt'], workspaceId: string): { data: Record<string, unknown>; at: string } {
  const row = sqlite.prepare("SELECT data, content_hash, at FROM revisions WHERE record_id = ? AND workspace_id = ? AND seq = 1 AND op = 'create' AND kind = 'whole_suite_receipt'").get(pin.recordId, workspaceId) as { data: string; content_hash: string; at: string } | undefined
  if (row === undefined || row.content_hash !== pin.contentHash) throw new PanelError(`Receipt ${pin.recordId} does not match its original create pin. Nothing was written.`, 409)
  return { data: JSON.parse(row.data) as Record<string, unknown>, at: row.at }
}

export function validateMainSuiteFixReceipt(value: MainSuiteFix, workspaceId: string): void {
  const { data } = thePinnedSuiteReceipt(value.receipt, workspaceId)
  for (const key of ['repository', 'commit', 'tree', 'failedTests', 'failedFiles'] as const) {
    if (JSON.stringify(data[key]) !== JSON.stringify(value[key])) throw new PanelError(`mainSuiteFix.${key} differs from the original receipt. Nothing was written.`, 409)
  }
  if ((data['endedAt'] ?? null) !== value.originalEndedAt || data['buildExitCode'] !== 0 || typeof data['suiteExitCode'] !== 'number' || data['suiteExitCode'] === 0) {
    throw new PanelError('mainSuiteFix must preserve the original red suite receipt and its exact end. Nothing was written.', 409)
  }
}

/** Machine mutation requires the active secretary's actual continuing run, never a claimed role or header. */
export function assertMainSuiteFixController(actor: Actor, claim: MainSuiteFix['claim'], workspaceId: string): void {
  const who = actor.type === 'agent' ? participantForActor(actor) : null
  const run = actor.ownKeyRun === undefined ? null : getRecord(actor.ownKeyRun)
  if (actor.provedBy !== 'an-agent-key' || actor.keyHolder === undefined || !theSecretaryOfThisOffice(actor) || who?.kind !== 'agent' || who.id !== claim.agent || actor.keyHolder !== who.id || actor.ownKeyRun !== claim.run || actor.sessionId !== actor.ownKeyRun || run === null || run.workspaceId !== workspaceId || run.kind !== 'session' || run.data['state'] !== 'running' || theAgentARunServes(run.data)?.id !== who.id) {
    throw new PanelError('mainSuiteFix mutation requires the active secretary and that secretary\'s own proved continuing run key, recorded original mint provenance (an Office-proved start or an explicitly recorded starter holder), and claim. Nothing was written.', 403)
  }
}

export function validateMainSuiteFixNoticeRecipients(value: MainSuiteFix): void {
  for (const notice of value.notices ?? []) for (const id of notice.to) {
    const recipient = readParticipant({ kind: 'agent', id })
    if (recipient === null || !('handle' in recipient) || recipient.id !== id) throw new PanelError('mainSuiteFix notice recipients must be exact canonical agent IDs. Nothing was written.', 400)
  }
}

/** Re-read the original pin and current operational namespace before the runner or queue uses either. */
export function authoritativeMainSuiteFix(id: string, workspaceId: string): MainSuiteFix {
  const record = recordInWorkspace(id, workspaceId)
  const original = originalMainSuiteFix(id, workspaceId)
  const current = mainSuiteFixSchema.safeParse(record.data['mainSuiteFix'])
  if (record.kind !== 'problem' || !current.success || JSON.stringify(mainSuiteFixPinned(original)) !== JSON.stringify(mainSuiteFixPinned(current.data)) || JSON.stringify(original.claim) !== JSON.stringify(current.data.claim)) {
    throw new PanelError(`Problem ${id} has drifted from its original mainSuiteFix correlation. Nothing was written.`, 409)
  }
  validateMainSuiteFixReceipt(current.data, workspaceId)
  return current.data
}
