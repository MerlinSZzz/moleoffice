// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY DEFAULT SHORTCUT HOLDS ALT, OR CTRL OR ⌘. No default fires on a bare key, and none is "g" then
 * a letter.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CHECKED
 * ---------------------------------------------------------------------------------------
 *
 *   1. No default fires on a bare key, with or without Shift, and "g" then a letter fires nothing.
 *   2. Each Alt default fires on its key's place, `code`, on a Mac and elsewhere, also when `key` is
 *      another character: Option on a Mac gives "ø" for the place of O, and a dead key gives "Dead".
 *      Ctrl with Alt, which is how AltGr comes on Windows, fires none, and nor does Alt in a text box.
 *   3. The list of keys and the Settings group draw the new keys, with Option on a Mac.
 *   4. What a person chose is kept: a shortcut they turned off stays off, and the switch they turned
 *      off turns off every key that works only outside a text box, which are now the Alt keys.
 *
 * THE KEYS ARE WRITTEN OUT HERE, letter by letter, rather than read from the table, so a table that
 * moved a key would fail here and not pass with itself.
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  SHORTCUTS_BEFORE_ANYBODY_CHOOSES,
  SHORTCUT_IDS,
  readShortcutSettings,
  type ShortcutSettings,
} from '../src/shared/participants.ts'
import { enWave13y } from '../src/shared/words/en-wave-13y.ts'
import { ShortcutsPanel } from '../src/web/components/ShortcutsPanel.tsx'
import { TheList } from '../src/web/components/ShortcutKeys.tsx'
import { SHORTCUTS, isOn, theShortcutFor, type AShortcutPress } from '../src/web/lib/shortcuts.ts'

/**
 * THE NINE ALT KEYS, as decided: the place, the letter printed there, and what Option and that place
 * give on a Mac with the US layout.
 */
const ALT_KEYS = [
  { action: 'home', id: 'home', code: 'KeyO', letter: 'O', option: 'ø' },
  { action: 'decisions', id: 'decisions', code: 'KeyC', letter: 'C', option: 'ç' },
  { action: 'settings', id: 'settings', code: 'KeyG', letter: 'G', option: '©' },
  { action: 'project', id: 'project', code: 'KeyP', letter: 'P', option: 'π' },
  { action: 'waiting-next', id: 'waiting', code: 'KeyJ', letter: 'J', option: '∆' },
  { action: 'waiting-previous', id: 'waiting', code: 'KeyK', letter: 'K', option: '˚' },
  { action: 'search', id: 'search', code: 'KeyR', letter: 'R', option: '®' },
  { action: 'quick-search', id: 'quickSearch', code: 'KeyX', letter: 'X', option: '≈' },
  { action: 'theme', id: 'theme', code: 'KeyL', letter: 'L', option: '¬' },
] as const

/** The two keys that hold Ctrl, or ⌘ on a Mac, and stay as they were. */
const COMMAND_KEYS = [
  { action: 'chat', key: 'K', code: 'KeyK', shift: true, keys: ['Shift', 'K'] },
  { action: 'keys', key: '/', code: 'Slash', shift: false, keys: ['/'] },
] as const

const ALL_ON = SHORTCUTS_BEFORE_ANYBODY_CHOOSES

/** One keydown outside a text box, with every modifier up and the input method idle. */
function aPress(key: string, code: string, over: Partial<AShortcutPress> = {}): AShortcutPress {
  return {
    key,
    code,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    isComposing: false,
    inATextBox: false,
    alreadyTaken: false,
    ...over,
  }
}

function fires(press: AShortcutPress, mac: boolean, settings: ShortcutSettings = ALL_ON): string | null {
  const said = theShortcutFor(press, { mac, settings })
  return said.what === 'fire' ? said.action : null
}

/** Every character key a person can press alone, with the place it is on a US keyboard. */
const BARE_KEYS: readonly { key: string; code: string; shifted: string }[] = [
  ...'abcdefghijklmnopqrstuvwxyz'.split('').map((letter) => ({ key: letter, code: `Key${letter.toUpperCase()}`, shifted: letter.toUpperCase() })),
  ...'0123456789'.split('').map((digit, index) => ({ key: digit, code: `Digit${digit}`, shifted: ')!@#$%^&*('[index]! })),
  { key: '/', code: 'Slash', shifted: '?' },
  { key: '.', code: 'Period', shifted: '>' },
  { key: ',', code: 'Comma', shifted: '<' },
  { key: ';', code: 'Semicolon', shifted: ':' },
  { key: "'", code: 'Quote', shifted: '"' },
  { key: '[', code: 'BracketLeft', shifted: '{' },
  { key: ']', code: 'BracketRight', shifted: '}' },
  { key: '-', code: 'Minus', shifted: '_' },
  { key: '=', code: 'Equal', shifted: '+' },
  { key: '`', code: 'Backquote', shifted: '~' },
  { key: '\\', code: 'Backslash', shifted: '|' },
]

/** The words of each <kbd> in one part of the drawn markup, in order. */
function kbds(markup: string): string[] {
  return [...markup.matchAll(/<kbd[^>]*>([^<]*)<\/kbd>/g)].map((match) => match[1]!)
}

/** The markup of the list's row for one action. */
function listRow(markup: string, action: string): string {
  const found = new RegExp(`<div class="sck-row"[^>]*data-action="${action}"[^>]*>(.*?)</div>`).exec(markup)
  if (found === null) throw new Error(`the list draws no row for ${action}`)
  return found[1]!
}

/** The markup of the Settings group's row for one setting. */
function settingsRow(markup: string, id: string): string {
  const found = new RegExp(`<div class="scp-row" role="row" data-shortcut="${id}"[^>]*>(.*?)</div>`).exec(markup)
  if (found === null) throw new Error(`the Settings group draws no row for ${id}`)
  return found[1]!
}

function drawTheList(mac: boolean): string {
  return renderToStaticMarkup(
    createElement(TheList, { settings: ALL_ON, sendKey: 'shift-or-alt-enter', mac, onClose: () => {}, closeRef: { current: null } }),
  )
}

/** The Settings group, drawn as it is drawn on a Mac or elsewhere: the page asks the browser which. */
function drawTheSettings(mac: boolean): string {
  vi.stubGlobal('navigator', { platform: mac ? 'MacIntel' : 'Linux x86_64' })
  return renderToStaticMarkup(createElement(ShortcutsPanel))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('no default fires on a bare key, nor on "g" then a letter', () => {
  it('every key of the table holds Alt, or Ctrl or ⌘', () => {
    for (const row of SHORTCUTS) {
      for (const chord of row.chords) expect(['alt', 'anywhere'], `${row.action}: ${JSON.stringify(chord)}`).toContain(chord.kind)
    }
  })

  for (const mac of [false, true]) {
    it(`no character key alone fires anything, with Shift or without (${mac ? 'a Mac' : 'elsewhere'})`, () => {
      for (const { key, code, shifted } of BARE_KEYS) {
        expect(fires(aPress(key, code), mac), key).toBe(null)
        expect(fires(aPress(shifted, code, { shiftKey: true }), mac), shifted).toBe(null)
        expect(theShortcutFor(aPress(key, code), { mac, settings: ALL_ON }).what, key).toBe('nothing')
      }
    })

    it(`"g" then a letter fires nothing, and "g" waits for nothing (${mac ? 'a Mac' : 'elsewhere'})`, () => {
      expect(theShortcutFor(aPress('g', 'KeyG'), { mac, settings: ALL_ON }).what).toBe('nothing')
      for (const letter of 'hdsp') expect(fires(aPress(letter, `Key${letter.toUpperCase()}`), mac), `g ${letter}`).toBe(null)
    })
  }
})

describe("each Alt default fires on its key's place", () => {
  it('the table holds these nine Alt keys and no other', () => {
    const alt = SHORTCUTS.flatMap((row) => row.chords.flatMap((chord) => (chord.kind === 'alt' ? [{ action: row.action, code: chord.code }] : [])))
    expect(alt).toEqual(ALT_KEYS.map(({ action, code }) => ({ action, code })))
  })

  for (const mac of [false, true]) {
    it(`Alt (Option on a Mac) and the place fire, whatever character the key gives (${mac ? 'a Mac' : 'elsewhere'})`, () => {
      for (const { action, code, letter, option } of ALT_KEYS) {
        for (const key of [letter.toLowerCase(), option, 'Dead']) {
          expect(fires(aPress(key, code, { altKey: true }), mac), `${code} giving ${key}`).toBe(action)
        }
        // THE CHARACTER IS NOT THE KEY: the letter on another place fires nothing.
        expect(fires(aPress(letter.toLowerCase(), 'Semicolon', { altKey: true }), mac), `${letter} on another place`).toBe(null)
      }
    })

    it(`no Alt key fires with Ctrl or ⌘ held, with Shift, without Alt, or in a text box (${mac ? 'a Mac' : 'elsewhere'})`, () => {
      for (const { code, letter, option } of ALT_KEYS) {
        const key = letter.toLowerCase()
        // ALTGR ON WINDOWS comes as Ctrl and Alt together, and types a character.
        expect(fires(aPress(option, code, { altKey: true, ctrlKey: true }), mac), `Ctrl+Alt+${letter}`).toBe(null)
        expect(fires(aPress(key, code, { altKey: true, metaKey: true }), mac), `Meta+Alt+${letter}`).toBe(null)
        expect(fires(aPress(letter, code, { altKey: true, shiftKey: true }), mac), `Shift+Alt+${letter}`).toBe(null)
        expect(fires(aPress(key, code), mac), `${letter} alone`).toBe(null)
        // IN A TEXT BOX, Option and AltGr type letters, so the press is left to the box.
        expect(fires(aPress(option, code, { altKey: true, inATextBox: true }), mac), `Alt+${letter} in a text box`).toBe(null)
        expect(fires(aPress(option, code, { altKey: true, isComposing: true }), mac), `Alt+${letter} while composing`).toBe(null)
        expect(fires(aPress(option, code, { altKey: true, alreadyTaken: true }), mac), `Alt+${letter} already taken`).toBe(null)
      }
    })

    it(`the chat and the list keep their Ctrl keys, ⌘ on a Mac, in a text box too (${mac ? 'a Mac' : 'elsewhere'})`, () => {
      for (const { action, key, code, shift } of COMMAND_KEYS) {
        const held = mac ? { metaKey: true } : { ctrlKey: true }
        expect(fires(aPress(key, code, { ...held, shiftKey: shift }), mac), action).toBe(action)
        expect(fires(aPress(key, code, { ...held, shiftKey: shift, inATextBox: true }), mac), `${action} in a text box`).toBe(action)
      }
    })
  }
})

describe('the list of keys and the Settings group draw the new keys', () => {
  for (const mac of [false, true]) {
    const alt = mac ? 'Option' : 'Alt'
    const command = mac ? '⌘' : 'Ctrl'

    it(`the list draws ${alt} and the letter for each Alt key, and the Ctrl keys alone (${mac ? 'a Mac' : 'elsewhere'})`, () => {
      const markup = drawTheList(mac)
      for (const { action, letter } of ALT_KEYS) expect(kbds(listRow(markup, action)), action).toEqual([alt, letter])
      for (const { action, keys } of COMMAND_KEYS) expect(kbds(listRow(markup, action)), action).toEqual([command, ...keys])
    })

    it(`the Settings group draws the same keys on each row (${mac ? 'a Mac' : 'elsewhere'})`, () => {
      const markup = drawTheSettings(mac)
      for (const id of SHORTCUT_IDS) {
        const want = [
          ...COMMAND_KEYS.filter((one) => one.action === id).flatMap((one) => [command, ...one.keys]),
          ...ALT_KEYS.filter((one) => one.id === id).flatMap((one) => [alt, one.letter]),
        ]
        expect(kbds(settingsRow(markup, id)), id).toEqual(want)
      }
    })
  }

  it('the switch in Settings says it turns off the Alt keys, outside a text box', () => {
    const markup = drawTheSettings(false)
    expect(markup).toContain(`<h3 class="scp-sec">${enWave13y['shortcuts.settings.outsideTitle']}</h3>`)
    expect(markup).toContain(`<span class="scp-word">${enWave13y['shortcuts.settings.outsideSwitch']}</span>`)
  })
})

describe('what a person chose is kept', () => {
  it('a shortcut turned off before stays off, and the others fire', () => {
    const held = readShortcutSettings({ singleKeys: true, off: ['theme', 'home', 'chat'] })
    expect(held).toEqual({ ok: true, settings: { singleKeys: true, off: ['chat', 'home', 'theme'] } })
    if (!held.ok) return
    for (const mac of [false, true]) {
      for (const { action, id, code, option } of ALT_KEYS) {
        expect(fires(aPress(option, code, { altKey: true }), mac, held.settings), action).toBe(held.settings.off.includes(id) ? null : action)
      }
      const chat = aPress('K', 'KeyK', { ...(mac ? { metaKey: true } : { ctrlKey: true }), shiftKey: true })
      expect(fires(chat, mac, held.settings), 'the chat is off').toBe(null)
    }
  })

  it('the switch turned off turns off every Alt key, and the Ctrl keys still fire', () => {
    const held = readShortcutSettings({ singleKeys: false, off: [] })
    expect(held).toEqual({ ok: true, settings: { singleKeys: false, off: [] } })
    if (!held.ok) return
    for (const mac of [false, true]) {
      for (const { action, code, option } of ALT_KEYS) expect(fires(aPress(option, code, { altKey: true }), mac, held.settings), action).toBe(null)
      for (const { action, key, code, shift } of COMMAND_KEYS) {
        const press = aPress(key, code, { ...(mac ? { metaKey: true } : { ctrlKey: true }), shiftKey: shift, inATextBox: true })
        expect(fires(press, mac, held.settings), action).toBe(action)
      }
    }
    for (const row of SHORTCUTS) {
      for (const chord of row.chords) expect(isOn(row.id, chord, held.settings), `${row.action} ${chord.kind}`).toBe(chord.kind === 'anywhere')
    }
  })
})
