// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE QUICK-NOTE KEY ON EACH SYSTEM, AND THE TRAY'S NEW QUICK NOTE. Wave 13t, round W45, on option C of a
 * decision: 13t builds the window's half, 13y the note page.
 *
 * src/desktop/the-quick-note.mjs holds the key apart from Electron, so this test stands the platform in as
 * each system:
 *
 *   2. the tray's New quick note comes after Open, in English and in Chinese, and its press opens a note. The
 *      key is shown beside it only when the system gave the key to the window. When the system refused it,
 *      a line under the item says so and cannot be pressed;
 *   3. a note opens on the office's own address, at the segment the note page's route reads;
 *   4. (round W47) while the office has not said that it has the note page, the tray has no New quick note and
 *      no line about its key, in English and in Chinese;
 *   5. (round W47) the note windows the window's state lists leave out one Electron has destroyed. A destroyed
 *      window throws when it is asked anything, and in one run of case 7 of the window test the state was read
 *      in the moment between a closing note window's end and its 'closed' event, and threw.
 *
 * What the key does in a real window, on Linux under X, is in cases 7 and 8 of tests/the-window-finds-its-office.test.ts.
 *
 * THE SYSTEMS' OWN SHORTCUTS WITH N, as their pages said them on 7 November 2026:
 *   - GNOME: help.gnome.org/users/gnome-help/stable/shell-keyboard-shortcuts.html lists none.
 *   - Windows: support.microsoft.com, "Keyboard shortcuts in Windows".
 *   - The Mac: support.apple.com/en-us/102650, "Mac keyboard shortcuts".
 * A key on none of them can still be taken by a program, which case 2 and the window case cover.
 *
 * MUTATIONS, each after a control run of this file, which passed, each red here and green again when put back:
 *   - in src/desktop/the-window-on-this-system.mjs, the tray leaves out New quick note: red, case 2;
 *   - there, the tray shows the key beside New quick note when the system refused it: red, case 2;
 *   - there, the tray leaves out the line that says the key is not set: red, case 2;
 *   - in src/config/the-quick-note-address.mjs, the note's address leaves out '#/': red, case 3;
 *   - (round W47) in src/desktop/the-window-on-this-system.mjs, the tray offers New quick note when the window
 *     has no key: red, case 4;
 *   - (round W47) in src/desktop/the-quick-note.mjs, theNotesOpen keeps a note window Electron has destroyed:
 *     red, case 5.
 * Case 4 was red on W46's code, which built New quick note from a key that was always there. Case 5 was red
 * before theNotesOpen was written.
 */

import { describe, expect, it } from 'vitest'

import { THE_QUICK_NOTE_SEGMENT, theQuickNoteAddress } from '../src/config/the-quick-note-address.mjs'
import { WINDOW_WORDS } from '../src/config/the-self-check-words.mjs'
import { theNotesOpen, theQuickNoteKey } from '../src/desktop/the-quick-note.mjs'
import { theTrayItems } from '../src/desktop/the-window-on-this-system.mjs'

describe('the quick-note key on each system', () => {
  it("2. the tray's New quick note comes after Open, and shows the key only when the system gave it", () => {
    const made: string[] = []
    const presses = {
      open: () => made.push('open'),
      newNote: () => made.push('newNote'),
      restart: () => made.push('restart'),
      shutDown: () => made.push('shutDown'),
      openAtLogin: () => made.push('openAtLogin'),
    }
    for (const language of ['en', 'zh'] as const) {
      const w = WINDOW_WORDS[language]
      for (const platform of ['linux', 'win32', 'darwin'] as const) {
        const key = theQuickNoteKey(platform)
        const system = { platform, packaged: false, opensAtLogin: () => false }

        const given = theTrayItems(w, presses, { ...system, quickNoteKey: { ...key, set: true } })
        expect(given.map((one) => one.id ?? one.type), platform).toEqual(['open', 'newNote', 'restart', 'separator', 'shutDown'])
        expect(given[1], platform).toMatchObject({ label: w.trayNewNote, accelerator: key.accelerator, registerAccelerator: false })
        made.length = 0
        given[1]?.click?.({} as never, undefined, {} as never)
        expect(made).toEqual(['newNote'])

        const refused = theTrayItems(w, presses, { ...system, quickNoteKey: { ...key, set: false } })
        expect(refused.map((one) => one.id ?? one.type), platform).toEqual(['open', 'newNote', 'quickNoteKeyNotSet', 'restart', 'separator', 'shutDown'])
        expect(refused[1]?.accelerator, `${platform}: the tray shows a key the system refused`).toBeUndefined()
        expect(refused[2], platform).toMatchObject({ label: w.quickNoteKeyNotSet(key.said), enabled: false })
        made.length = 0
        refused[1]?.click?.({} as never, undefined, {} as never)
        expect(made).toEqual(['newNote'])
      }
    }
  })

  it("3. a note opens on the office's own address, at the segment the note page's route reads", () => {
    const office = 'http://127.0.0.1:41234'
    const address = new URL(theQuickNoteAddress(office))
    expect(address.origin).toBe(office)
    expect(address.pathname).toBe('/')
    expect(address.hash).toBe(`#/${THE_QUICK_NOTE_SEGMENT}`)
  })

  it('4. while the office has not said it has the note page, the tray has no New quick note and no line about its key', () => {
    const presses = { open: () => undefined, newNote: () => undefined, restart: () => undefined, shutDown: () => undefined, openAtLogin: () => undefined }
    for (const language of ['en', 'zh'] as const) {
      const w = WINDOW_WORDS[language]
      for (const platform of ['linux', 'win32', 'darwin'] as const) {
        const items = theTrayItems(w, presses, { platform, packaged: false, opensAtLogin: () => false, quickNoteKey: null })
        expect(items.map((one) => one.id ?? one.type), platform).toEqual(['open', 'restart', 'separator', 'shutDown'])
        expect(items.map((one) => one.label), platform).not.toContain(w.trayNewNote)
      }
    }
  })

  it("5. the note windows the window's state lists leave out one Electron has destroyed", () => {
    // A stand-in for Electron's windows. A destroyed one throws as Electron's does when it is asked anything else.
    const asked = (): never => {
      throw new TypeError('Object has been destroyed')
    }
    const aNote = (url: string, onTop: boolean) => ({ isDestroyed: () => false, webContents: { getURL: () => url }, isAlwaysOnTop: () => onTop, isVisible: () => true })
    const destroyed = { isDestroyed: () => true, get webContents(): never { return asked() }, isAlwaysOnTop: asked, isVisible: asked }
    const office = 'http://127.0.0.1:41234'
    expect(theNotesOpen(new Set([aNote(theQuickNoteAddress(office), true), destroyed, aNote(office, false)]))).toEqual([
      { url: theQuickNoteAddress(office), onTop: true, visible: true },
      { url: office, onTop: false, visible: true },
    ])
    expect(theNotesOpen(new Set([destroyed]))).toEqual([])
  })
})
