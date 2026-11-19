// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { ComponentProps } from 'react'
import { t } from '@shared/i18n.ts'
import { TieredPress } from '../TieredPress.tsx'
import { alreadyInThatState } from './controls.tsx'

type Press = ComponentProps<typeof TieredPress>
export const DRAWING_UNDO_MS = 10_000

/** Drawing edits use the shared question and undo, with the current page language. */
export function ConfirmPress(props: Omit<Extract<Press, { tier: 'confirm' }>, 'tier' | 'pending' | 'cancel'>) {
  return <TieredPress {...props} tier="confirm" pending={t('g7b.press.pending')} cancel={t('g7b.press.cancel')} />
}

export function UndoPress(props: Omit<Extract<Press, { tier: 'undo' }>, 'tier' | 'pending' | 'windowMs' | 'undo' | 'undoing'>) {
  return <TieredPress {...props} tier="undo" pending={t('g7b.press.pending')} windowMs={DRAWING_UNDO_MS}
    undo={(n) => t('g7b.press.undo', { n })} undoing={t('g7b.press.undoing')} />
}

/** The canvas keeps the same state comparison for its reset as for its other controls. */
export function DrawingUndoPress({ now, after, ...props }: Omit<ComponentProps<typeof UndoPress>, 'disabled'> & { now: number; after: number }) {
  return <UndoPress {...props} disabled={alreadyInThatState(now, after)} />
}
