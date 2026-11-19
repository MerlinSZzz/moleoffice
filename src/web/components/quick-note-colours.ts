// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE COLOUR EACH PEN OF A QUICK NOTE DRAWS IN, written once for every drawing of a note: the note's own sheet, the
 * pen's colour presses, and a note drawn small on another page. Each is a colour of the theme, so a red stroke is the
 * light theme's red in the light theme and the dark theme's red in the dark one.
 */
import type { QuickNoteColour } from '@shared/kinds/quick-note.ts'

export const QUICK_NOTE_COLOURS: Readonly<Record<QuickNoteColour, string>> = {
  ink: 'var(--text)',
  red: 'var(--st-failed)',
  blue: 'var(--pen-blue)',
}
