// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A quick note's title, worked out once for the note itself and for the right-click box's Send to a note. This file
 * imports no component, so the box reaches the title rule without reaching the note's drawing.
 */
import { t } from '@shared/i18n.ts'
import { quickNoteTitleOf, type QuickNotePart } from '@shared/kinds/quick-note.ts'

/** The title a note's parts give it. */
export function titleOf(parts: readonly QuickNotePart[]): string {
  return quickNoteTitleOf(parts) ?? t('quickNote.untitled')
}

/**
 * Whether a stored note's title follows its words: true while the title is the one its parts give it. Each write of
 * such a note gives it the title its new parts give. The right-click box's Send to a note writes by the same rule.
 */
export function theTitleFollowsTheWords(title: string, parts: readonly QuickNotePart[]): boolean {
  return title === titleOf(parts)
}
