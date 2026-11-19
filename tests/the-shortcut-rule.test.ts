// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHORTCUT RULE: WHEN A PRESS MAY FIRE A SHORTCUT, AND WHICH ONE. Item 5 of a decision, on the proposal in report
 * hbu756wTdJnz.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A UNIT TEST
 * ---------------------------------------------------------------------------------------
 *
 * The rule has no browser in it: a key, four modifier flags, whether an input method is composing,
 * whether the focus is in a text box, whether the page already took the key, and the settings. The
 * browser test proves the page obeys it; this proves the rule is the table at the head of
 * src/web/lib/shortcuts.ts, row for row, and that the stored settings are read strictly.
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

/** One keydown outside a text box, with every modifier up and the input method idle. */
function aPress(key: string, over: Partial<AShortcutPress> = {}): AShortcutPress {
  return {
    key,
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

const ALL_ON = SHORTCUTS_BEFORE_ANYBODY_CHOOSES

function answer(press: AShortcutPress, settings: ShortcutSettings = ALL_ON, afterG = false, mac = false) {
  return theShortcutFor(press, { mac, settings, afterG })
}

function fires(press: AShortcutPress, settings: ShortcutSettings = ALL_ON, afterG = false, mac = false): string | null {
  const said = answer(press, settings, afterG, mac)
  return said.what === 'fire' ? said.action : null
}

describe('the one rule for whether a press may fire', () => {
  it('a single key fires outside a text box, with no Ctrl, Alt or Meta', () => {
    expect(mayThisPressFire(aPress('t'), 'single', false)).toBe(true)
    expect(mayThisPressFire(aPress('N', { shiftKey: true }), 'single', false)).toBe(true)
  })

  it('a single key never fires in a text box', () => {
    expect(mayThisPressFire(aPress('t', { inATextBox: true }), 'single', false)).toBe(false)
    expect(mayThisPressFire(aPress('h', { inATextBox: true }), 'g', false)).toBe(false)
  })

  it('no key fires while an input method is composing, of either kind', () => {
    expect(mayThisPressFire(aPress('t', { isComposing: true }), 'single', false)).toBe(false)
    expect(mayThisPressFire(aPress('K', { isComposing: true, ctrlKey: true, shiftKey: true }), 'anywhere', false)).toBe(false)
    expect(mayThisPressFire(aPress('Process'), 'single', false)).toBe(false)
  })

  it('a single key does not fire with Ctrl, Alt or Meta held', () => {
    for (const held of ['ctrlKey', 'altKey', 'metaKey'] as const) {
      expect(mayThisPressFire(aPress('t', { [held]: true }), 'single', false), held).toBe(false)
    }
  })

  it('an anywhere key fires in a text box, with Ctrl, or with ⌘ on a Mac, and not with Alt', () => {
    expect(mayThisPressFire(aPress('K', { ctrlKey: true, shiftKey: true, inATextBox: true }), 'anywhere', false)).toBe(true)
    expect(mayThisPressFire(aPress('K', { metaKey: true, shiftKey: true, inATextBox: true }), 'anywhere', true)).toBe(true)
    expect(mayThisPressFire(aPress('K', { metaKey: true, shiftKey: true }), 'anywhere', false)).toBe(false)
    expect(mayThisPressFire(aPress('K', { ctrlKey: true, shiftKey: true, altKey: true }), 'anywhere', false)).toBe(false)
  })

  it('a key the page already took fires nothing', () => {
    expect(mayThisPressFire(aPress('t', { alreadyTaken: true }), 'single', false)).toBe(false)
    expect(mayThisPressFire(aPress('/', { ctrlKey: true, alreadyTaken: true }), 'anywhere', false)).toBe(false)
  })
})

describe('which shortcut a press fires', () => {
  it('each key of the table fires its own action', () => {
    expect(fires(aPress('K', { ctrlKey: true, shiftKey: true }))).toBe('chat')
    expect(fires(aPress('c'))).toBe('chat')
    expect(fires(aPress('?', { shiftKey: true }))).toBe('keys')
    expect(fires(aPress('/', { ctrlKey: true }))).toBe('keys')
    expect(fires(aPress('n'))).toBe('waiting-next')
    expect(fires(aPress('N', { shiftKey: true }))).toBe('waiting-previous')
    expect(fires(aPress('/'))).toBe('search')
    expect(fires(aPress('f'))).toBe('quick-search')
    expect(fires(aPress('t'))).toBe('theme')
    expect(fires(aPress('K', { metaKey: true, shiftKey: true }), ALL_ON, false, true)).toBe('chat')
  })

  it('"g" waits for a letter, and the letter fires its page', () => {
    expect(answer(aPress('g')).what).toBe('wait-for-g')
    expect(fires(aPress('h'), ALL_ON, true)).toBe('home')
    expect(fires(aPress('d'), ALL_ON, true)).toBe('decisions')
    expect(fires(aPress('s'), ALL_ON, true)).toBe('settings')
    expect(fires(aPress('p'), ALL_ON, true)).toBe('project')
  })

  it('after "g", another letter or Escape ends the wait and fires nothing', () => {
    expect(answer(aPress('t'), ALL_ON, true).what).toBe('cancel-g')
    expect(answer(aPress('Escape'), ALL_ON, true).what).toBe('cancel-g')
    // A press the rule refuses leaves the wait as it is.
    expect(answer(aPress('h', { isComposing: true }), ALL_ON, true).what).toBe('nothing')
    expect(answer(aPress('Shift', { shiftKey: true }), ALL_ON, true).what).toBe('nothing')
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
    expect(fires(aPress('t'), themeOff)).toBe(null)
    expect(fires(aPress('c'), themeOff)).toBe('chat')
    const chatOff: ShortcutSettings = { singleKeys: true, off: ['chat'] }
    expect(fires(aPress('K', { ctrlKey: true, shiftKey: true }), chatOff)).toBe(null)
    expect(fires(aPress('c'), chatOff)).toBe(null)
  })

  it('the one switch stops every single key and every g key, and the Ctrl keys still fire', () => {
    const noSingles: ShortcutSettings = { singleKeys: false, off: [] }
    for (const key of ['c', '?', 'n', '/', 'f', 't']) expect(fires(aPress(key), noSingles), key).toBe(null)
    expect(answer(aPress('g'), noSingles).what).toBe('nothing')
    expect(fires(aPress('K', { ctrlKey: true, shiftKey: true, inATextBox: true }), noSingles)).toBe('chat')
    expect(fires(aPress('/', { ctrlKey: true, inATextBox: true }), noSingles)).toBe('keys')
  })

  it('"g" does not wait when every g key is off', () => {
    const noGoing: ShortcutSettings = { singleKeys: true, off: ['home', 'decisions', 'settings', 'project'] }
    expect(answer(aPress('g'), noGoing).what).toBe('nothing')
    const onlyHomeOff: ShortcutSettings = { singleKeys: true, off: ['home'] }
    expect(answer(aPress('g'), onlyHomeOff).what).toBe('wait-for-g')
    expect(answer(aPress('h'), onlyHomeOff, true).what).toBe('cancel-g')
  })
})

describe('the table and the stored settings', () => {
  it('every setting has a row and words, and every row names a setting', () => {
    for (const id of SHORTCUT_IDS) {
      expect(SHORTCUTS.some((row) => row.id === id), id).toBe(true)
      expect(SHORTCUT_SETTING_WORDS[id], id).toBeTruthy()
    }
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
