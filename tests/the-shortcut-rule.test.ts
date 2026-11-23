// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHORTCUT RULE: WHEN A PRESS MAY FIRE A SHORTCUT, AND WHICH ONE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A UNIT TEST
 * ---------------------------------------------------------------------------------------
 *
 * The rule has no browser in it: a key and its place, four modifier flags, whether an input method
 * is composing, whether the focus is in a text box, whether the page already took the key, and the
 * settings. The browser test proves the page obeys it; this proves the rule is the table at the head
 * of src/web/lib/shortcuts.ts, row for row, and that the stored settings are read strictly.
 */

import { describe, expect, it } from 'vitest'

import {
  SHORTCUTS_BEFORE_ANYBODY_CHOOSES,
  SHORTCUT_IDS,
  readShortcutSettings,
  type ShortcutSettings,
} from '../src/shared/participants.ts'
import {
  SHORTCUTS,
  SHORTCUT_SETTING_WORDS,
  mayThisPressFire,
  theShortcutFor,
  type AShortcutPress,
} from '../src/web/lib/shortcuts.ts'

/** The place of a key on a US keyboard, as `KeyboardEvent.code` names it. */
function placeOf(key: string): string {
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`
  if (key === '/' || key === '?') return 'Slash'
  return key
}

/** One keydown outside a text box, with every modifier up and the input method idle. */
function aPress(key: string, over: Partial<AShortcutPress> = {}): AShortcutPress {
  return {
    key,
    code: placeOf(key),
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

/** Alt and the key at one place, as Linux and Windows give it: the letter itself. */
function anAltPress(letter: string, over: Partial<AShortcutPress> = {}): AShortcutPress {
  return aPress(letter, { altKey: true, ...over })
}

const ALL_ON = SHORTCUTS_BEFORE_ANYBODY_CHOOSES

function answer(press: AShortcutPress, settings: ShortcutSettings = ALL_ON, mac = false) {
  return theShortcutFor(press, { mac, settings })
}

function fires(press: AShortcutPress, settings: ShortcutSettings = ALL_ON, mac = false): string | null {
  const said = answer(press, settings, mac)
  return said.what === 'fire' ? said.action : null
}

describe('the one rule for whether a press may fire', () => {
  it('an Alt key fires outside a text box, with Alt and no Ctrl, Meta or Shift', () => {
    expect(mayThisPressFire(anAltPress('l'), 'alt', false)).toBe(true)
    // ON A MAC, Option and the key give another character, and the press is the same.
    expect(mayThisPressFire(aPress('¬', { code: 'KeyL', altKey: true }), 'alt', true)).toBe(true)
  })

  it('an Alt key never fires in a text box', () => {
    expect(mayThisPressFire(anAltPress('l', { inATextBox: true }), 'alt', false)).toBe(false)
    expect(mayThisPressFire(aPress('¬', { code: 'KeyL', altKey: true, inATextBox: true }), 'alt', true)).toBe(false)
  })

  it('no key fires while an input method is composing, of either kind', () => {
    expect(mayThisPressFire(anAltPress('l', { isComposing: true }), 'alt', false)).toBe(false)
    expect(mayThisPressFire(aPress('K', { isComposing: true, ctrlKey: true, shiftKey: true }), 'anywhere', false)).toBe(false)
    expect(mayThisPressFire(aPress('Process', { altKey: true }), 'alt', false)).toBe(false)
  })

  it('an Alt key does not fire with Ctrl, Meta or Shift held, nor without Alt', () => {
    // CTRL WITH ALT is how AltGr comes on Windows, and it types a character.
    for (const held of ['ctrlKey', 'metaKey', 'shiftKey'] as const) {
      expect(mayThisPressFire(anAltPress('l', { [held]: true }), 'alt', false), held).toBe(false)
      expect(mayThisPressFire(anAltPress('l', { [held]: true }), 'alt', true), `${held} on a Mac`).toBe(false)
    }
    expect(mayThisPressFire(aPress('l'), 'alt', false)).toBe(false)
  })

  it('an anywhere key fires in a text box, with Ctrl, or with ⌘ on a Mac, and not with Alt', () => {
    expect(mayThisPressFire(aPress('K', { ctrlKey: true, shiftKey: true, inATextBox: true }), 'anywhere', false)).toBe(true)
    expect(mayThisPressFire(aPress('K', { metaKey: true, shiftKey: true, inATextBox: true }), 'anywhere', true)).toBe(true)
    expect(mayThisPressFire(aPress('K', { metaKey: true, shiftKey: true }), 'anywhere', false)).toBe(false)
    expect(mayThisPressFire(aPress('K', { ctrlKey: true, shiftKey: true, altKey: true }), 'anywhere', false)).toBe(false)
  })

  it('a key the page already took fires nothing', () => {
    expect(mayThisPressFire(anAltPress('l', { alreadyTaken: true }), 'alt', false)).toBe(false)
    expect(mayThisPressFire(aPress('/', { ctrlKey: true, alreadyTaken: true }), 'anywhere', false)).toBe(false)
  })
})

describe('which shortcut a press fires', () => {
  it('each key of the table fires its own action', () => {
    expect(fires(aPress('K', { ctrlKey: true, shiftKey: true }))).toBe('chat')
    expect(fires(aPress('/', { ctrlKey: true }))).toBe('keys')
    expect(fires(anAltPress('o'))).toBe('home')
    expect(fires(anAltPress('c'))).toBe('decisions')
    expect(fires(anAltPress('g'))).toBe('settings')
    expect(fires(anAltPress('p'))).toBe('project')
    expect(fires(anAltPress('j'))).toBe('waiting-next')
    expect(fires(anAltPress('k'))).toBe('waiting-previous')
    expect(fires(anAltPress('r'))).toBe('search')
    expect(fires(anAltPress('x'))).toBe('quick-search')
    expect(fires(anAltPress('l'))).toBe('theme')
    expect(fires(aPress('K', { metaKey: true, shiftKey: true }), ALL_ON, true)).toBe('chat')
    expect(fires(aPress('/', { metaKey: true }), ALL_ON, true)).toBe('keys')
    expect(fires(aPress('ø', { code: 'KeyO', altKey: true }), ALL_ON, true)).toBe('home')
  })

  it('the old bare keys and the "g" pairs fire nothing, and "g" waits for nothing', () => {
    for (const key of ['c', 'n', '/', 'f', 't', 'g', 'h', 'd', 's', 'p']) expect(answer(aPress(key)).what, key).toBe('nothing')
    for (const key of ['?', 'N']) expect(answer(aPress(key, { shiftKey: true })).what, key).toBe('nothing')
    expect(answer(aPress('g'), ALL_ON, true).what).toBe('nothing')
  })

  it('Alt and a letter that is no shortcut fire nothing', () => {
    for (const letter of ['d', 'e', 'f', 'h', 's', 't']) expect(answer(anAltPress(letter)).what, letter).toBe('nothing')
    expect(answer(aPress('Dead', { code: 'KeyE', altKey: true }), ALL_ON, true).what).toBe('nothing')
  })

  it('the keys that are not shortcuts fire nothing: Escape, Ctrl+S, Alt+arrows, Enter', () => {
    expect(answer(aPress('Escape')).what).toBe('nothing')
    expect(answer(aPress('s', { ctrlKey: true })).what).toBe('nothing')
    expect(answer(aPress('ArrowUp', { altKey: true })).what).toBe('nothing')
    expect(answer(aPress('Enter', { shiftKey: true, inATextBox: true })).what).toBe('nothing')
    expect(answer(aPress('K', { ctrlKey: true, shiftKey: true, altKey: true })).what).toBe('nothing')
  })

  it('a key turned off fires nothing, and the others still fire', () => {
    const themeOff: ShortcutSettings = { singleKeys: true, off: ['theme'] }
    expect(fires(anAltPress('l'), themeOff)).toBe(null)
    expect(fires(anAltPress('o'), themeOff)).toBe('home')
    const chatOff: ShortcutSettings = { singleKeys: true, off: ['chat'] }
    expect(fires(aPress('K', { ctrlKey: true, shiftKey: true }), chatOff)).toBe(null)
    expect(fires(anAltPress('o'), chatOff)).toBe('home')
  })

  it('the one switch stops every Alt key, and the Ctrl keys still fire', () => {
    const noAltKeys: ShortcutSettings = { singleKeys: false, off: [] }
    for (const letter of ['o', 'c', 'g', 'p', 'j', 'k', 'r', 'x', 'l']) expect(fires(anAltPress(letter), noAltKeys), letter).toBe(null)
    expect(fires(aPress('K', { ctrlKey: true, shiftKey: true, inATextBox: true }), noAltKeys)).toBe('chat')
    expect(fires(aPress('/', { ctrlKey: true, inATextBox: true }), noAltKeys)).toBe('keys')
  })

  it('a row turned off stops only its own key', () => {
    const onlyHomeOff: ShortcutSettings = { singleKeys: true, off: ['home'] }
    expect(fires(anAltPress('o'), onlyHomeOff)).toBe(null)
    expect(fires(anAltPress('c'), onlyHomeOff)).toBe('decisions')
    expect(fires(anAltPress('g'), onlyHomeOff)).toBe('settings')
  })
})

describe('the table and the stored settings', () => {
  it('every setting has a row and words, and every row names a setting', () => {
    for (const id of SHORTCUT_IDS) {
      expect(SHORTCUTS.some((row) => row.id === id), id).toBe(true)
      expect(SHORTCUT_SETTING_WORDS[id], id).toBeTruthy()
    }
  })

  it('every key holds Alt, or Ctrl or ⌘, and no two Alt keys share a place', () => {
    const places: string[] = []
    for (const row of SHORTCUTS) {
      for (const chord of row.chords) {
        expect(['alt', 'anywhere'], row.action).toContain(chord.kind)
        if (chord.kind === 'alt') places.push(chord.code)
      }
    }
    expect(new Set(places).size).toBe(places.length)
  })

  it('reads a good value, in the one order', () => {
    expect(readShortcutSettings({ singleKeys: false, off: ['theme', 'chat'] })).toEqual({
      ok: true,
      settings: { singleKeys: false, off: ['chat', 'theme'] },
    })
  })

  it('refuses every other shape', () => {
    for (const bad of [
      'on',
      [],
      { singleKeys: 'yes', off: [] },
      { singleKeys: true },
      { singleKeys: true, off: 'chat' },
      { singleKeys: true, off: ['review'] },
      { singleKeys: true, off: ['chat', 'chat'] },
      { singleKeys: true, off: [], extra: 1 },
    ]) {
      expect(readShortcutSettings(bad).ok, JSON.stringify(bad)).toBe(false)
    }
  })
})
