// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHERE A QUICK NOTE OPENS, written once for the window and the page (wave 13t, round W45, option C of quick
 * notes, agreed with 13y).
 *
 * The window opens a note window on the office's address with this segment after `#/`, one new note for
 * each press of the quick-note key or of the tray's New quick note (src/desktop/the-quick-note.mjs). The
 * page's route for the note imports the same segment (src/shared/addresses.ts), so the window and the page
 * cannot name the note page differently.
 *
 * It is JavaScript because the window's main process cannot read TypeScript.
 */

/** The segment of the note page's address, after `#/`. */
export const THE_QUICK_NOTE_SEGMENT = 'quick-note'

/** Marks a note window created by the desktop app, apart from its main office window. */
export const THE_QUICK_NOTE_WINDOW_MARKER = 'quick-note-window'

/**
 * The address of a new quick note in the office at this address.
 *
 * @param {string} office the office's address with no slash at its end, as the window keeps it
 * @returns {string}
 */
export function theQuickNoteAddress(office) {
  return `${office}/?${THE_QUICK_NOTE_WINDOW_MARKER}=1#/${THE_QUICK_NOTE_SEGMENT}`
}
