// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sqlite } from '../db/client.ts'
import { logChange } from './log-change.ts'
import { REQUIREMENTS_UPDATE_FIELD, theLastRequirementsUpdate, theRequirementsUpdate, whileTheRequirementsDoorWrites } from './module-requirements.ts'
import { PanelError } from './panel-error.ts'
import { patchRecord, type Actor } from './records.ts'
import { versionOf } from './version.ts'
import type { PanelRecord } from '@shared/types.ts'

/** The explicit update has its own ledger row even when the same requirements are confirmed again. */
export function updateModuleRequirements(record: PanelRecord, items: Record<string, unknown>[], actor: Actor, ifVersion?: string) {
  const { before, after, parts } = theRequirementsUpdate(record, items, actor)
  return sqlite.transaction(() => whileTheRequirementsDoorWrites(() => {
    const result = patchRecord(record.id, { dataPatch: { parts }, ifVersion: ifVersion ?? versionOf(record) }, actor)
    logChange(record.id, 'update', actor, REQUIREMENTS_UPDATE_FIELD, before, after)
    const change = theLastRequirementsUpdate(record.id)
    if (change === undefined) throw new PanelError('The requirements update was not recorded. Nothing was changed.', 500)
    return { record: result.record, version: versionOf(result.record), update: { at: change.at, by: { actorType: change.actorType, actorId: change.actorId } } }
  }))()
}
