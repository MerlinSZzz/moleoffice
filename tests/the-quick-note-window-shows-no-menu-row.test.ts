// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE QUICK NOTE WINDOW HAS NO MENU ROW, AND THE MAIN WINDOW KEEPS ITS OWN.
 *
 * The secretary's decision of 15 November 2026: the note window in the window app drops the File, Edit,
 * View, Window row, because it is a small window that stays on top; the main window keeps the row.
 *
 * THE TEST DOES NOT START ELECTRON. The note window's options and the step after construction live in
 * src/desktop/the-quick-note.mjs, apart from Electron, so a fake window asks what the real window is told:
 *
 *   1. the options are the note size, on top, shown, with the note page's web preferences and no auto-hide
 *      option, so the row is there until the step after construction takes it off;
 *   2. the step removes the note window's menu on Linux and on Windows, and does nothing on a Mac, where the
 *      menu is the screen's top bar and not a row inside a window;
 *   3. the step leaves the main window's menu alone on every system.
 *
 * WHAT IT ASKS THAT WAS NOT ASKED BEFORE. Nothing: the note window was made from an object literal inside
 * openAQuickNote in src/desktop/main.mjs, and no test could read what menu row it had without starting
 * Electron. The two exports are new, so this file is red on the cut.
 *
 * MUTATIONS, after a control run of this file on the cut, each red and green again when put back:
 *   - in src/desktop/the-quick-note.mjs, the step removes the menu for the main window too: case 3 red;
 *   - there, the step does not remove the note window's menu: case 2 red.
 */

import { describe, expect, it } from 'vitest'

import {
  A_NOTE_WINDOWS_SIZE,
  THE_MAIN_WINDOW,
  THE_NOTE_WINDOW,
  giveTheWindowItsMenuRow,
  theQuickNoteWindowOptions,
} from '../src/desktop/the-quick-note.mjs'

/** A stand-in for Electron's window: it counts the one call the step may make. */
function aWindow(): { menusRemoved: number; removeMenu: () => void } {
  const window = {
    menusRemoved: 0,
    removeMenu: () => {
      window.menusRemoved += 1
    },
  }
  return window
}

describe('the quick note window has no menu row', () => {
  it('1. a note window is the note size, on top, shown, and has no auto-hide menu bar', () => {
    const icon = { aStandIn: 'picture' } as unknown as import('electron').NativeImage
    expect(theQuickNoteWindowOptions({ title: 'A made-up note', icon })).toEqual({
      ...A_NOTE_WINDOWS_SIZE,
      alwaysOnTop: true,
      title: 'A made-up note',
      icon,
      show: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    })
  })

  it('2. the step after a note window is made removes its menu row on Linux and Windows, and nothing on a Mac', () => {
    for (const platform of ['linux', 'win32'] as const) {
      const note = aWindow()
      giveTheWindowItsMenuRow(note, THE_NOTE_WINDOW, platform)
      expect(note.menusRemoved, platform).toBe(1)
    }
    const onAMac = aWindow()
    giveTheWindowItsMenuRow(onAMac, THE_NOTE_WINDOW, 'darwin')
    expect(onAMac.menusRemoved, 'a Mac puts the menu in the screen top bar, not in a window').toBe(0)
  })

  it('3. the step after the main window is made leaves its menu row alone on every system', () => {
    for (const platform of ['linux', 'win32', 'darwin'] as const) {
      const main = aWindow()
      giveTheWindowItsMenuRow(main, THE_MAIN_WINDOW, platform)
      expect(main.menusRemoved, platform).toBe(0)
    }
  })
})
