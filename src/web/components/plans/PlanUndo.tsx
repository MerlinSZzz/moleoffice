// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
import { TieredPress } from '../TieredPress.tsx'
import { api, moleOfficeRequest, type PlanBlocksReply, type RecordDetail } from '../../api.ts'
import { WORKSPACE_HEADER } from '../../lib/workspace.ts'
import type { AllocatedWork } from '../../../server/lib/planning.ts'
import type { PlanState } from '@shared/plandoc.ts'

export const PLAN_UNDO_MS = 10_000

/** The inverse is a separate write through the same existing door. */
export function PlanUndoPress({ press, done, available, disabled = false, onPress }: {
  press: string
  done: string
  available: boolean
  disabled?: boolean
  onPress: () => Promise<() => Promise<void>>
}) {
  return <TieredPress tier="undo" size="sm" press={press} done={done} available={available}
    disabled={disabled} pending={t('g8.schedulePage.saving')} undoing={t('g8.undo.undoing')} windowMs={PLAN_UNDO_MS}
    undo={(seconds) => t('g8.undo.undoS', { value1: seconds })}
    onPress={async () => ({ remainingMs: PLAN_UNDO_MS, undo: await onPress() })} />
}

/** The version returned by the change refuses an undo after any newer write. */
export async function changeWorkWithUndo(work: Pick<AllocatedWork, 'id' | 'workspaceId' | 'state'>, next: string) {
  const path = `/api/records/${encodeURIComponent(work.id)}`
  const headers = { [WORKSPACE_HEADER]: work.workspaceId }
  const before = await moleOfficeRequest<RecordDetail>(path, { headers })
  const previous = before.record.data.state ?? null
  if (previous !== work.state) throw new Error(t('g8.undo.theWorkChangedReadItAgainBeforeChangingIts'))
  const written = await moleOfficeRequest<Pick<RecordDetail, 'version'>>(path, {
    method: 'PATCH', headers, body: JSON.stringify({ dataPatch: { state: next }, ifVersion: before.version }),
  })
  return async () => {
    await moleOfficeRequest(path, { method: 'PATCH', headers,
      body: JSON.stringify({ dataPatch: { state: previous }, ifVersion: written.version }) })
  }
}

export async function changePlanWithUndo(id: string, previous: PlanState, next: PlanState) {
  const before = await api.planBlocks(id)
  if (before.plan.state !== previous) throw new Error(t('g8.undo.thePlanChangedReadItAgainBeforeChangingIts'))
  const written = await moleOfficeRequest<Pick<PlanBlocksReply, 'plan' | 'version'>>(`/api/plans/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify({ state: next, ifVersion: before.version }),
  })
  return async () => {
    await moleOfficeRequest(`/api/plans/${encodeURIComponent(id)}`, {
      method: 'PATCH', body: JSON.stringify({ state: previous, ifVersion: written.version }),
    })
  }
}
