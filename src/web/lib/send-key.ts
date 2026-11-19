// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SEND KEY, AND EVERY MESSAGE BOX'S PART OF IT. By a decision, Enter makes a new line by default,
 * Shift+Enter or Alt+Enter sends, and this is the first shortcut on the Settings page.
 *
 * ---------------------------------------------------------------------------------------
 * ONE FUNCTION DECIDES, SO THE BOXES CANNOT DISAGREE
 * ---------------------------------------------------------------------------------------
 *
 * Every box a message is written in asks `theSendKeyAnswer` what a keydown means. The three answers
 * are `'send'` (the handler calls preventDefault and sends), `'newline'` (the handler does nothing
 * and the browser inserts the line break) and `'ignore'` (the key is not this box's). A box never
 * reads the setting's words itself and never repeats a modifier check: if two boxes did, a change
 * to one could leave the other sending a different key with nothing failing. That is USER.md's
 * ninth invariant, and this is the one place it is kept.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH KEY SENDS, IN BOTH SETTINGS
 * ---------------------------------------------------------------------------------------
 *
 * Setting "Shift+Enter or Alt+Enter sends" (the default, and what a null column reads as):
 *
 *   Enter with Shift or with Alt held        -> 'send'
 *   plain Enter                              -> 'newline'
 *   Enter with Ctrl or Meta and no Shift/Alt -> 'ignore'
 *
 * Setting "Enter sends" (what the chat did before this setting existed):
 *
 *   plain Enter, and Enter with Alt          -> 'send'
 *   Shift+Enter                              -> 'newline'
 *   Enter with Ctrl or Meta                  -> 'ignore'
 *
 * In both settings, for every key:
 *
 *   any key that is not Enter                -> 'ignore'
 *   Enter while an input method is composing -> 'ignore'
 *
 * THE INPUT METHOD'S ENTER IS NEVER TAKEN, in both settings, and the handler must not call
 * preventDefault for it. Chinese is written through an input method: while it is composing, Enter
 * confirms the candidate word. Sending half a sentence or adding a line break there would break
 * typing. `isComposing` on the native event is the browser's word for that moment.
 *
 * THE ORDER THE ROWS ARE CHECKED IS PART OF THE ANSWER. The input method is asked first, so it
 * wins over every setting. Then, in the default setting, Shift and Alt are asked before Ctrl and
 * Meta, so Shift+Ctrl and Alt+Ctrl send. In the second setting, Shift is asked first and Ctrl and
 * Meta next, so Shift+Ctrl makes a new line and Alt+Ctrl is ignored. A row is never left to two
 * readings in the code: this function is the one reading.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE SETTING COMES FROM, AND HOW A BOX READS IT
 * ---------------------------------------------------------------------------------------
 *
 * The choice is a column on the person's own `people` row (`send_key`, migration 0188) and is read
 * here once for the whole page, the way `src/web/lib/language.ts` reads the page language: a
 * module-level reading, a broadcast, and `useSendKey` for the boxes to subscribe to. A box reads
 * the setting with `useSendKey()` and turns a keydown into an answer with `aSendKeyPress`, which
 * sends only on `'send'`. Nothing in a box reads `isComposing`, the modifiers or the setting's
 * words for itself.
 */

import { useSyncExternalStore } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

import {
  SEND_KEY_BEFORE_ANYBODY_CHOOSES,
  isSendKeySetting,
  type SendKeySetting,
} from '@shared/participants.ts'
import { subscribeActor, getActor } from '../api.ts'
import { makeBroadcast } from './store.ts'
import { readParticipantsOnce } from './oneread.ts'

/** What a keydown in a message box means, once the shared function has read it. */
export type SendKeyAnswer = 'send' | 'newline' | 'ignore'

/**
 * THE ONE KEYDOWN FACT, as plain values so a unit test can ask every row of the table without a
 * browser. `isComposing` is the input method's own word for "this Enter picks a candidate".
 */
export interface AKeyPress {
  key: string
  shiftKey: boolean
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  isComposing: boolean
}

/**
 * WHAT A KEYDOWN IN A MESSAGE BOX MEANS. The table above this file's head is the whole rule; this
 * is it written once. The order of the checks follows the order the rows are written in the table.
 */
export function theSendKeyAnswer(press: AKeyPress, setting: SendKeySetting): SendKeyAnswer {
  // NOT ENTER IS NOT OURS. A box that took every key would swallow typing.
  if (press.key !== 'Enter') return 'ignore'
  // THE INPUT METHOD'S KEY, in both settings, and the handler must not preventDefault it.
  if (press.isComposing) return 'ignore'
  if (setting === 'shift-or-alt-enter') {
    // SHIFT AND ALT FIRST, so Shift+Ctrl and Alt+Ctrl send in this setting.
    if (press.shiftKey || press.altKey) return 'send'
    // CTRL AND META WITH NEITHER OF THOSE: a keyboard shortcut, not this box's send.
    if (press.ctrlKey || press.metaKey) return 'ignore'
    return 'newline'
  }
  // "Enter sends": Shift makes the new line, Ctrl and Meta are somebody else's shortcut, and
  // everything else (plain Enter and Alt+Enter) sends.
  if (press.shiftKey) return 'newline'
  if (press.ctrlKey || press.metaKey) return 'ignore'
  return 'send'
}

/**
 * THE KEYS THAT SEND, IN THE ORDER THEY ARE ASKED, with the signs a keyboard carries for each. Only Enter alone and Enter
 * with one of Shift or Alt can send in either setting; `theSendKeyAnswer` says which of them do.
 */
const THE_ENTER_KEYS: readonly { keys: string; signs: string; held: Partial<AKeyPress> }[] = [
  { keys: 'Shift+Enter', signs: '⇧↵', held: { shiftKey: true } },
  { keys: 'Enter', signs: '↵', held: {} },
  { keys: 'Alt+Enter', signs: '⌥↵', held: { altKey: true } },
]

function theEnterKeysThatSend(setting: SendKeySetting): readonly { keys: string; signs: string }[] {
  const nothingHeld: AKeyPress = { key: 'Enter', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, isComposing: false }
  return THE_ENTER_KEYS.filter((one) => theSendKeyAnswer({ ...nothingHeld, ...one.held }, setting) === 'send')
}

/** The keys that send in this setting, as `aria-keyshortcuts` writes them, for the press the send key does. */
export function theKeysThatSend(setting: SendKeySetting): string {
  return theEnterKeysThatSend(setting).map((one) => one.keys).join(' ')
}

/** The small mark drawn on the press the send key does: the signs of the first key that sends. */
export function theSendKeyMark(setting: SendKeySetting): string {
  return theEnterKeysThatSend(setting)[0]?.signs ?? ''
}

/** The same answer, read off a React keydown in a box. */
export function theSendKeyAnswerFor(
  event: ReactKeyboardEvent<HTMLElement>,
  setting: SendKeySetting,
): SendKeyAnswer {
  return theSendKeyAnswer(
    {
      key: event.key,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      isComposing: event.nativeEvent.isComposing,
    },
    setting,
  )
}

/**
 * THE HANDLER EVERY BOX GIVES ITS KEYDOWN. It sends only when the shared rule says `'send'`, and on
 * that one answer it prevents the browser's own new line before calling the box's send. `'newline'`
 * and `'ignore'` are left alone: the browser keeps the key.
 */
export function aSendKeyPress<El extends HTMLElement>(
  setting: SendKeySetting,
  send: () => void,
): (event: ReactKeyboardEvent<El>) => void {
  return (event) => {
    if (theSendKeyAnswerFor(event, setting) !== 'send') return
    event.preventDefault()
    send()
  }
}

// ---------------------------------------------------------------------------- the reading

/**
 * WHAT THE PERSON HAS CHOSEN, OR THE DEFAULT. `status` says whether the office has answered yet, so
 * a box can draw the default without claiming the person chose it.
 */
interface SendKeyReading {
  setting: SendKeySetting
  personId: string | null
  status: 'loading' | 'ready' | 'error'
}

const broadcast = makeBroadcast()
let reading: SendKeyReading = {
  setting: SEND_KEY_BEFORE_ANYBODY_CHOOSES,
  personId: null,
  status: 'loading',
}
let requestNumber = 0

function announce(next: SendKeyReading): void {
  reading = next
  broadcast.announce()
}

/**
 * READ THE SIGNED-IN PERSON'S OWN ROW. The same door `ChatTextSize.tsx` and `language.ts` read: the
 * setting is on the person, never in this browser, so a fresh device gets it from the office.
 */
export async function readSendKey(fresh = false): Promise<void> {
  const request = ++requestNumber
  const actor = getActor()
  try {
    const reply = await (fresh ? readParticipantsOnce.again() : readParticipantsOnce())
    if (request !== requestNumber) return
    const person = actor.type === 'human' ? reply.people.find((one) => one.id === actor.id) : undefined
    if (person === undefined) {
      announce({ ...reading, personId: null, status: 'error' })
      return
    }
    const chosen = isSendKeySetting(person.sendKey) ? person.sendKey : null
    announce({
      setting: chosen ?? SEND_KEY_BEFORE_ANYBODY_CHOOSES,
      personId: person.id,
      status: 'ready',
    })
  } catch {
    if (request === requestNumber) announce({ ...reading, status: 'error' })
  }
}

/** The setting a box acts on. Until the office answers, the default the column reads as. */
export function useSendKey(): SendKeySetting {
  return useSyncExternalStore(broadcast.subscribe, () => reading.setting, () => reading.setting)
}

// Read once before the first page draws, so the boxes never flash the default on a device whose
// person chose otherwise. A reader with no account answers `error` and the boxes keep the default,
// which is what the column reads as anyway.
if (typeof window !== 'undefined' && window.location?.protocol?.startsWith('http')) {
  subscribeActor(() => {
    void readSendKey(true)
  })
  void readSendKey()
}
