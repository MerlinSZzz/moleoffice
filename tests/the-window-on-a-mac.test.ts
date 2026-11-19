// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WINDOW ON A MAC: A MENU-BAR PICTURE IN THE BAR'S OWN COLOUR, THE DOCK ICON THAT SHOWS IT AGAIN, AND
 * OPEN AT LOGIN. Wave 13t, round 20 (report R99y24eUFjNK, block b-6; decision fdIhVGe4R7fp).
 *
 * src/desktop/the-window-on-this-system.mjs holds what the window does differently on a Mac, apart from
 * Electron, so this test stands the platform in as darwin:
 *
 *   1. the tray picture: on a Mac the template picture, drawn as a template; elsewhere the colour logo;
 *   2. the template pictures are 16 and 32 pixels square, by the names macOS looks for, and every pixel
 *      of them is black, with only its opacity drawing the logo, which is what a template is;
 *   3. the menu offers Open at login on a Mac only from an installed app, ticked as macOS says, and its press
 *      sets Electron's login item to the ticked state. Windows offers it too since round W12, and
 *      tests/the-office-on-windows-starts-at-sign-in.test.ts holds that;
 *   4. a click on the Dock icon shows the window, on a Mac only.
 * Since round W45 the menu holds New quick note after Open, so the lists of its items here name it.
 * tests/the-quick-note-key-on-each-system.test.ts holds what that item does.
 *
 * What only a Mac can show is said in the round's report: how the picture looks in a light and a dark
 * menu bar, and that System Settings lists the login item.
 *
 * MUTATIONS, each red here and green again when put back:
 *   - theTrayPicture gives the colour logo on a Mac too: red, case 1;
 *   - offersOpenAtLogin ignores whether the app is installed: red, case 3;
 *   - theTrayItems passes the opposite of the tick to the press: red, case 3;
 *   - listenToTheSystem listens on every system: red, case 4;
 *   - theTrayItems leaves out New quick note (round W45, after a control run of this file and the two other files
 *     that list the tray's items, which passed): red, case 3.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { readAPng } from '../scripts/the-mac-build.mjs'
import { theQuickNoteKey } from '../src/desktop/the-quick-note.mjs'
import { listenToTheSystem, offersOpenAtLogin, theTrayItems, theTrayPicture } from '../src/desktop/the-window-on-this-system.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))

const WORDS = {
  trayOpen: 'Open',
  trayNewNote: 'New quick note',
  quickNoteKeyNotSet: (key: string) => `${key} is not set`,
  trayRestart: 'Restart',
  trayShutDown: 'Shut down',
  trayOpenAtLogin: 'Open at login',
}

/** The presses, each writing down that it was made. */
function presses() {
  const made: string[] = []
  return {
    made,
    presses: {
      open: () => made.push('open'),
      newNote: () => made.push('newNote'),
      restart: () => made.push('restart'),
      shutDown: () => made.push('shutDown'),
      openAtLogin: (on: boolean) => made.push(`openAtLogin ${String(on)}`),
    },
  }
}

describe('the window on a Mac', () => {
  it('1. on a Mac the tray shows the template picture, drawn as a template; elsewhere the colour logo', () => {
    expect(theTrayPicture('darwin', '/r')).toEqual({ path: '/r/src/desktop/mole-office-trayTemplate.png', template: true })
    expect(theTrayPicture('linux', '/r')).toEqual({ path: '/r/src/web/logo/mole-office-tab-32.png', template: false })
  })

  it('2. the template pictures are 16 and 32 pixels, black, drawn only by their opacity', () => {
    for (const [name, side] of [['mole-office-trayTemplate.png', 16], ['mole-office-trayTemplate@2x.png', 32]] as const) {
      const picture = readAPng(readFileSync(join(REPO, 'src', 'desktop', name)))
      expect([picture.width, picture.height], name).toEqual([side, side])
      let coloured = 0
      let drawn = 0
      for (let at = 0; at < picture.rgba.length; at += 4) {
        if (picture.rgba.readUInt8(at) + picture.rgba.readUInt8(at + 1) + picture.rgba.readUInt8(at + 2) > 0) coloured += 1
        if (picture.rgba.readUInt8(at + 3) > 0) drawn += 1
      }
      expect(coloured, name).toBe(0)
      // Something is drawn, and not the whole square.
      expect(drawn, name).toBeGreaterThan(side * 2)
      expect(drawn, name).toBeLessThan(side * side)
    }
  })

  it('3. Open at login: on a Mac, from an installed app, ticked as macOS says, and pressed to the tick', () => {
    expect(offersOpenAtLogin('darwin', true)).toBe(true)
    expect(offersOpenAtLogin('darwin', false)).toBe(false)
    expect(offersOpenAtLogin('linux', true)).toBe(false)

    const { made, presses: on } = presses()
    const items = theTrayItems(WORDS, on, { platform: 'darwin', packaged: true, opensAtLogin: () => true, quickNoteKey: { ...theQuickNoteKey('darwin'), set: true } })
    expect(items.map((item) => item.id ?? item.type)).toEqual(['open', 'newNote', 'restart', 'openAtLogin', 'separator', 'shutDown'])
    const item = items.find((one) => one.id === 'openAtLogin')
    expect(item).toMatchObject({ type: 'checkbox', label: 'Open at login', checked: true })
    // Electron flips a checkbox's tick before it calls the click, so the press sets what the tick now says.
    item?.click?.({ checked: false } as never, undefined, {} as never)
    expect(made).toEqual(['openAtLogin false'])

    for (const system of [{ platform: 'linux' as const, packaged: true }, { platform: 'darwin' as const, packaged: false }]) {
      const ids = theTrayItems(WORDS, on, { ...system, opensAtLogin: () => false, quickNoteKey: { ...theQuickNoteKey(system.platform), set: true } }).map((one) => one.id ?? one.type)
      expect(ids, JSON.stringify(system)).toEqual(['open', 'newNote', 'restart', 'separator', 'shutDown'])
    }
  })

  it('4. a click on the Dock icon shows the window, on a Mac only', () => {
    for (const [platform, listens] of [['darwin', true], ['linux', false]] as const) {
      const listeners: Record<string, () => void> = {}
      let shown = 0
      listenToTheSystem({ on: (event, listener) => (listeners[event] = listener) }, platform, () => (shown += 1))
      expect('activate' in listeners, platform).toBe(listens)
      listeners['activate']?.()
      expect(shown, platform).toBe(listens ? 1 : 0)
    }
  })
})
