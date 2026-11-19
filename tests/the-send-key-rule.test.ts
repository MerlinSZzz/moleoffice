// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SEND KEY RULE: EVERY ROW OF THE TABLE, IN ONE PLACE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A UNIT TEST
 * ---------------------------------------------------------------------------------------
 *
 * The table is the whole rule, and it has no browser in it: a key, four modifier flags, whether an
 * input method is composing, and the setting. The browser test proves the boxes obey it; this proves
 * the rule itself is the table, row for row, so a change to one branch cannot pass unnoticed because
 * the browser test happened to exercise only the common one.
 *
 * What the decision asks: Enter sends now; by default Enter should start a new line, and Shift+Enter
 * or Alt+Enter should send. This goes into the settings as the first shortcut setting.
 */

import { describe, expect, it } from 'vitest'

import {
  SEND_KEY_BEFORE_ANYBODY_CHOOSES,
  SEND_KEY_SETTINGS,
  isSendKeySetting,
} from '../src/shared/participants.ts'
import {
  theSendKeyAnswer,
  type AKeyPress,
  type SendKeyAnswer,
} from '../src/web/lib/send-key.ts'

/** One keydown, with every modifier up and the input method idle unless the case says otherwise. */
function aPress(over: Partial<AKeyPress> = {}): AKeyPress {
  return {
    key: 'Enter',
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    isComposing: false,
    ...over,
  }
}

interface Row {
  what: string
  press: AKeyPress
  setting: 'shift-or-alt-enter' | 'enter'
  answer: SendKeyAnswer
}

const ROWS: Row[] = [
  // ANY OTHER KEY IS NOT THIS BOX'S.
  { what: 'a letter, in both settings', press: aPress({ key: 'a' }), setting: 'shift-or-alt-enter', answer: 'ignore' },
  { what: 'a letter, in the old way', press: aPress({ key: 'a' }), setting: 'enter', answer: 'ignore' },
  { what: "Escape, which is nobody else's either", press: aPress({ key: 'Escape' }), setting: 'enter', answer: 'ignore' },

  // THE INPUT METHOD'S ENTER, IN BOTH SETTINGS. It is never taken and never sent.
  { what: 'a composing Enter, in the default', press: aPress({ isComposing: true }), setting: 'shift-or-alt-enter', answer: 'ignore' },
  { what: 'a composing Shift+Enter, in the default', press: aPress({ isComposing: true, shiftKey: true }), setting: 'shift-or-alt-enter', answer: 'ignore' },
  { what: 'a composing Enter, in the old way', press: aPress({ isComposing: true }), setting: 'enter', answer: 'ignore' },
  { what: 'a composing Alt+Enter, in the old way', press: aPress({ isComposing: true, altKey: true }), setting: 'enter', answer: 'ignore' },

  // "shift-or-alt-enter": Enter is a new line unless Shift or Alt is held.
  { what: 'plain Enter', press: aPress(), setting: 'shift-or-alt-enter', answer: 'newline' },
  { what: 'Shift+Enter', press: aPress({ shiftKey: true }), setting: 'shift-or-alt-enter', answer: 'send' },
  { what: 'Alt+Enter', press: aPress({ altKey: true }), setting: 'shift-or-alt-enter', answer: 'send' },
  { what: 'Ctrl+Enter', press: aPress({ ctrlKey: true }), setting: 'shift-or-alt-enter', answer: 'ignore' },
  { what: 'Meta+Enter', press: aPress({ metaKey: true }), setting: 'shift-or-alt-enter', answer: 'ignore' },

  // "enter": what the chat did before this setting existed.
  { what: 'plain Enter', press: aPress(), setting: 'enter', answer: 'send' },
  { what: 'Alt+Enter', press: aPress({ altKey: true }), setting: 'enter', answer: 'send' },
  { what: 'Shift+Enter', press: aPress({ shiftKey: true }), setting: 'enter', answer: 'newline' },
  { what: 'Ctrl+Enter', press: aPress({ ctrlKey: true }), setting: 'enter', answer: 'ignore' },
  { what: 'Meta+Enter', press: aPress({ metaKey: true }), setting: 'enter', answer: 'ignore' },
]

describe('the send key rule is the table, row for row', () => {
  it.each(ROWS)('$what says $answer under "$setting"', (row) => {
    expect(theSendKeyAnswer(row.press, row.setting)).toBe(row.answer)
  })

  it('names two settings and no more, so a third word is not a setting', () => {
    expect(SEND_KEY_SETTINGS).toEqual(['shift-or-alt-enter', 'enter'])
    expect(isSendKeySetting('shift-or-alt-enter')).toBe(true)
    expect(isSendKeySetting('enter')).toBe(true)
    expect(isSendKeySetting('command-enter')).toBe(false)
    expect(isSendKeySetting(null)).toBe(false)
  })

  it('reads nobody having chosen as the owner\'s new default: Enter makes a new line', () => {
    expect(SEND_KEY_BEFORE_ANYBODY_CHOOSES).toBe('shift-or-alt-enter')
    expect(theSendKeyAnswer(aPress(), SEND_KEY_BEFORE_ANYBODY_CHOOSES)).toBe('newline')
    expect(theSendKeyAnswer(aPress({ shiftKey: true }), SEND_KEY_BEFORE_ANYBODY_CHOOSES)).toBe('send')
    expect(theSendKeyAnswer(aPress({ altKey: true }), SEND_KEY_BEFORE_ANYBODY_CHOOSES)).toBe('send')
  })
})
