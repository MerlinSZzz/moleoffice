// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KEYBOARD SHORTCUTS: WHICH KEYS THERE ARE, WHEN ONE MAY FIRE, AND WHAT THE PERSON TURNED OFF.
 *
 * By item 5 of a decision, the eight questions of the shortcut proposal (report hbu756wTdJnz) are
 * each answered as its recommendation says. This file is the one place
 * those answers are worked out. The key handler, the "?" list, the Settings rows and the hints on
 * the page all read the table below, so they cannot disagree (USER.md's ninth invariant).
 *
 * ---------------------------------------------------------------------------------------
 * TWO KINDS OF KEY (question 1)
 * ---------------------------------------------------------------------------------------
 *
 * ANYWHERE KEYS hold Ctrl, or ⌘ on a Mac. They work even when a text box has the focus. There are
 * two: Ctrl+Shift+K for the chat and Ctrl+/ for the list of keys.
 *
 * SINGLE KEYS are one character, or "g" followed by a letter. They work only when no text box has
 * the focus. The one switch in Settings turns every one of them off (question 3).
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE RULE FOR WHETHER A PRESS MAY FIRE A SHORTCUT
 * ---------------------------------------------------------------------------------------
 *
 * `mayThisPressFire` is asked by every key, in this order:
 *
 *   an input method is composing                          -> no, for both kinds
 *   something on the page already took the key            -> no, for both kinds
 *   an anywhere key: Ctrl (⌘ on a Mac) is held, Alt is not -> yes
 *   a single key: the focus is in an input, a textarea, a select or an editable element -> no
 *   a single key: Ctrl, Alt or Meta is held               -> no
 *   a single key otherwise                                -> yes
 *
 * THE INPUT METHOD IS ASKED FIRST, for the reason `src/web/lib/send-key.ts` gives for Enter: while
 * an input method is composing, every key belongs to it. `isComposing` is the browser's word for
 * that moment, and a key the browser reports as "Process" is one the input method is holding.
 *
 * "ALREADY TOOK THE KEY" is `defaultPrevented`. The handler listens on the window, so the page's own
 * handlers have run first; a key one of them took (Escape in the talk box, Ctrl+S in a plan) is
 * never taken a second time here.
 */

import { useSyncExternalStore } from 'react'

import { t, type WordKey } from '@shared/i18n.ts'
import {
  SHORTCUTS_BEFORE_ANYBODY_CHOOSES,
  readShortcutSettings,
  type ShortcutId,
  type ShortcutSettings,
} from '@shared/participants.ts'
import { getActor, subscribeActor } from '../api.ts'
import type { AKeyPress } from './send-key.ts'
import { makeBroadcast } from './store.ts'
import { readParticipantsOnce } from './oneread.ts'

// ------------------------------------------------------------------------------ the table

/** What a shortcut does when it fires. The waiting messages have two: the next one and the one before. */
export type ShortcutAction =
  | 'chat'
  | 'keys'
  | 'home'
  | 'decisions'
  | 'settings'
  | 'project'
  | 'waiting-next'
  | 'waiting-previous'
  | 'search'
  | 'quick-search'
  | 'theme'

/**
 * ONE PRESS THAT FIRES A SHORTCUT.
 *
 * `anywhere`: Ctrl (⌘ on a Mac) with this key, and Shift when `shift` is true.
 * `single`: this one key alone. `shift` true or false asks for Shift held or not; left out, Shift is
 * not asked about, because "?" and "/" need Shift on some keyboards and not on others.
 * `g`: "g", then this letter.
 */
export type Chord =
  | { kind: 'anywhere'; key: string; shift?: boolean }
  | { kind: 'single'; key: string; shift?: boolean }
  | { kind: 'g'; key: string }

/** One row of the table: which setting turns it off, what it does, its words, and its keys. */
export interface ShortcutRow {
  id: ShortcutId
  action: ShortcutAction
  what: WordKey
  chords: readonly Chord[]
}

/**
 * EVERY SHORTCUT, IN THE ORDER THE "?" LIST AND THE SETTINGS GROUP DRAW THEM.
 *
 * The waiting messages are two rows under one setting, because "next" and "the one before" are two
 * things to say and one thing to turn off.
 *
 * NOT HERE, ON PURPOSE: `r` for the review pane and `a` for pointing at a part. The proposal's first
 * batch (its question 8) does not include them.
 */
export const SHORTCUTS: readonly ShortcutRow[] = [
  { id: 'chat', action: 'chat', what: 'shortcuts.what.chat', chords: [{ kind: 'anywhere', key: 'k', shift: true }, { kind: 'single', key: 'c', shift: false }] },
  { id: 'keys', action: 'keys', what: 'shortcuts.what.keys', chords: [{ kind: 'anywhere', key: '/' }, { kind: 'single', key: '?' }] },
  { id: 'home', action: 'home', what: 'shortcuts.what.home', chords: [{ kind: 'g', key: 'h' }] },
  { id: 'decisions', action: 'decisions', what: 'shortcuts.what.decisions', chords: [{ kind: 'g', key: 'd' }] },
  { id: 'settings', action: 'settings', what: 'shortcuts.what.settings', chords: [{ kind: 'g', key: 's' }] },
  { id: 'project', action: 'project', what: 'shortcuts.what.project', chords: [{ kind: 'g', key: 'p' }] },
  { id: 'waiting', action: 'waiting-next', what: 'shortcuts.what.waitingNext', chords: [{ kind: 'single', key: 'n', shift: false }] },
  { id: 'waiting', action: 'waiting-previous', what: 'shortcuts.what.waitingPrevious', chords: [{ kind: 'single', key: 'n', shift: true }] },
  { id: 'search', action: 'search', what: 'shortcuts.what.search', chords: [{ kind: 'single', key: '/' }] },
  { id: 'quickSearch', action: 'quick-search', what: 'shortcuts.what.quickSearch', chords: [{ kind: 'single', key: 'f', shift: false }] },
  { id: 'theme', action: 'theme', what: 'shortcuts.what.theme', chords: [{ kind: 'single', key: 't', shift: false }] },
]

// The settings row words are declared in shared/shortcut-setting-words.ts.
export { SHORTCUT_SETTING_WORDS } from '@shared/shortcut-setting-words.ts'

/** Every chord of one setting, in the table's order. The Settings row draws these. */
export function chordsOf(id: ShortcutId): Chord[] {
  return SHORTCUTS.filter((row) => row.id === id).flatMap((row) => [...row.chords])
}

/** How long the page waits for the letter after "g", in milliseconds. The proposal says about 1.5 seconds. */
export const G_WAITS_MS = 1500

/** The event the Settings group sends to open the list of keys. The component that draws the list listens for it. */
export const OPEN_THE_LIST = 'mole-office.shortcuts.open-the-list'

/** The event the sidebar's press and the key f send to open the quick search. The quick search listens for it. */
export const OPEN_THE_QUICK_SEARCH = 'mole-office.quick-search.open'

// ------------------------------------------------------------------------------ the rule

/** A keydown, as plain values, and the two facts about where it landed. */
export interface AShortcutPress extends AKeyPress {
  /** The focus is in an input, a textarea, a select or an editable element. */
  inATextBox: boolean
  /** Something on the page already called preventDefault on this key. */
  alreadyTaken: boolean
}

/** Whether this machine is a Mac, where the anywhere keys hold ⌘ rather than Ctrl. */
export function isAMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform)
}

/** THE ONE RULE. The table at the head of this file is the whole of it. */
export function mayThisPressFire(press: AShortcutPress, kind: Chord['kind'], mac: boolean): boolean {
  if (press.isComposing || press.key === 'Process') return false
  if (press.alreadyTaken) return false
  if (kind === 'anywhere') {
    const held = mac ? press.metaKey : press.ctrlKey
    return held && !press.altKey
  }
  if (press.inATextBox) return false
  if (press.ctrlKey || press.altKey || press.metaKey) return false
  return true
}

/** Whether a press is this chord's key, once the rule has said it may fire. */
function pressIs(press: AShortcutPress, chord: Chord, mac: boolean): boolean {
  if (chord.kind === 'anywhere') {
    // THE OTHER COMMAND KEY IS NOT THIS ONE: Ctrl on a Mac and ⌘ elsewhere make a different press.
    if (mac ? press.ctrlKey : press.metaKey) return false
    if (chord.shift !== undefined && press.shiftKey !== chord.shift) return false
    return press.key.toLowerCase() === chord.key
  }
  if (chord.kind === 'single') {
    if (chord.shift !== undefined && press.shiftKey !== chord.shift) return false
    return chord.shift === undefined ? press.key === chord.key : press.key.toLowerCase() === chord.key
  }
  return press.key.toLowerCase() === chord.key && !press.shiftKey
}

/** Whether a setting leaves this chord on. The one switch stops every chord that is not an anywhere key. */
export function isOn(id: ShortcutId, chord: Chord, settings: ShortcutSettings): boolean {
  if (settings.off.includes(id)) return false
  return chord.kind === 'anywhere' || settings.singleKeys
}

/** What one press means, once the rule has been asked. */
export type ShortcutAnswer =
  | { what: 'fire'; action: ShortcutAction; id: ShortcutId }
  | { what: 'wait-for-g' }
  | { what: 'cancel-g' }
  | { what: 'nothing' }

/**
 * WHAT A KEYDOWN MEANS. `afterG` is true while the page waits for the letter after "g".
 *
 * After "g", a letter that is a "g" key and is on fires it; any other press that may fire a single
 * key ends the wait and does nothing else, so a mistyped letter never fires a second shortcut.
 * A press the rule refuses (a composing key, a key in a text box) leaves the wait as it is.
 */
export function theShortcutFor(
  press: AShortcutPress,
  state: { mac: boolean; settings: ShortcutSettings; afterG: boolean },
): ShortcutAnswer {
  const { mac, settings, afterG } = state
  if (afterG) {
    if (!mayThisPressFire(press, 'g', mac)) return { what: 'nothing' }
    // Shift alone, and the other modifier keys pressed on their own, are not the letter.
    if (press.key === 'Shift' || press.key === 'CapsLock') return { what: 'nothing' }
    for (const row of SHORTCUTS) {
      for (const chord of row.chords) {
        if (chord.kind === 'g' && isOn(row.id, chord, settings) && pressIs(press, chord, mac)) {
          return { what: 'fire', action: row.action, id: row.id }
        }
      }
    }
    return { what: 'cancel-g' }
  }
  for (const row of SHORTCUTS) {
    for (const chord of row.chords) {
      if (chord.kind === 'g') continue
      if (!isOn(row.id, chord, settings)) continue
      if (!mayThisPressFire(press, chord.kind, mac)) continue
      if (pressIs(press, chord, mac)) return { what: 'fire', action: row.action, id: row.id }
    }
  }
  const aGKeyIsOn = SHORTCUTS.some((row) => row.chords.some((chord) => chord.kind === 'g' && isOn(row.id, chord, settings)))
  if (aGKeyIsOn && mayThisPressFire(press, 'g', mac) && press.key === 'g') return { what: 'wait-for-g' }
  return { what: 'nothing' }
}

/**
 * IS THIS ELEMENT A TEXT BOX, for the rule. An input of any type, a textarea, a select, or any
 * element a person can type into.
 */
export function isATextBox(element: Element | null): boolean {
  if (element === null) return false
  if (element instanceof HTMLElement && element.isContentEditable) return true
  return element.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null
}

/** The press and its two facts, read off a real keydown. */
export function aShortcutPress(event: KeyboardEvent): AShortcutPress {
  const target = event.composedPath()[0]
  return {
    key: event.key,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    isComposing: event.isComposing,
    inATextBox: isATextBox(target instanceof Element ? target : document.activeElement),
    alreadyTaken: event.defaultPrevented,
  }
}

// ------------------------------------------------------------------------------ the words of a key

/** The keys that have a name rather than a character printed on them. */
export type NamedKey = 'Ctrl' | 'Shift' | 'Alt' | 'Enter' | 'Esc'

const NAMED_KEY_WORDS: Readonly<Record<NamedKey, WordKey>> = {
  Ctrl: 'shortcuts.key.ctrl',
  Shift: 'shortcuts.key.shift',
  Alt: 'shortcuts.key.alt',
  Enter: 'shortcuts.key.enter',
  Esc: 'shortcuts.key.esc',
}

/**
 * WHAT ONE KEY CAP SAYS, IN THE PAGE LANGUAGE. A named key is a word in the lists. A character key
 * says the character printed on it, and it passes through the lists as well, so every string a key
 * cap draws comes from them. ⌘ is a sign, not a word, and is drawn as it is.
 */
export function keyCap(key: NamedKey | string): string {
  if (key in NAMED_KEY_WORDS) return t(NAMED_KEY_WORDS[key as NamedKey])
  if (key === '⌘') return key
  return t('shortcuts.key.character', { key })
}

/** The keys of one chord, one by one, as the page draws them: each is a <kbd>. */
export function keysOf(chord: Chord, mac: boolean): string[] {
  const upper = (key: string): string => (key.length === 1 ? key.toUpperCase() : key)
  const mod = mac ? '⌘' : 'Ctrl'
  const keys =
    chord.kind === 'anywhere'
      ? [mod, ...(chord.shift === true ? ['Shift'] : []), upper(chord.key)]
      : chord.kind === 'g'
        ? ['g', chord.key]
        : chord.shift === true
          ? ['Shift', upper(chord.key)]
          : [chord.key]
  return keys.map(keyCap)
}

/** One chord as one short line of text, for a tooltip: "Ctrl+Shift+K", "g s", "c". */
export function chordText(chord: Chord, mac: boolean): string {
  return chord.kind === 'g' ? keysOf(chord, mac).join(' ') : keysOf(chord, mac).join('+')
}

/**
 * One chord in the words of `aria-keyshortcuts`, or null when that attribute cannot say it. It names
 * keys pressed together, and a space means "or", so "g then s" cannot be written there.
 */
export function chordForScreenReaders(chord: Chord, mac: boolean): string | null {
  if (chord.kind === 'g') return null
  const key = chord.key.length === 1 ? chord.key.toUpperCase() : chord.key
  if (chord.kind === 'anywhere') return [mac ? 'Meta' : 'Control', ...(chord.shift === true ? ['Shift'] : []), key].join('+')
  return chord.shift === true ? `Shift+${key}` : key
}

// ------------------------------------------------------------------------------ the reading

/** What the person has chosen, or every shortcut on until the office answers. */
interface ShortcutsReading {
  settings: ShortcutSettings
  chosen: boolean
  personId: string | null
  status: 'loading' | 'ready' | 'error'
}

const broadcast = makeBroadcast()
let reading: ShortcutsReading = {
  settings: SHORTCUTS_BEFORE_ANYBODY_CHOOSES,
  chosen: false,
  personId: null,
  status: 'loading',
}
let requestNumber = 0

function announce(next: ShortcutsReading): void {
  reading = next
  broadcast.announce()
}

/**
 * READ THE SIGNED-IN PERSON'S OWN ROW, the same door and the same way `send-key.ts` reads the send
 * key. The choice is on the person, so a fresh device reads it from the office.
 */
export async function readShortcuts(fresh = false): Promise<void> {
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
    const held = person.shortcuts === undefined || person.shortcuts === null ? null : readShortcutSettings(person.shortcuts)
    announce({
      settings: held !== null && held.ok ? held.settings : SHORTCUTS_BEFORE_ANYBODY_CHOOSES,
      chosen: held !== null && held.ok,
      personId: person.id,
      status: 'ready',
    })
  } catch {
    if (request === requestNumber) announce({ ...reading, status: 'error' })
  }
}

/** The settings the keys act on now. The key handler reads this at each press. */
export function shortcutsNow(): ShortcutSettings {
  return reading.settings
}

/** The settings, for a component that draws them. */
export function useShortcuts(): ShortcutSettings {
  return useSyncExternalStore(broadcast.subscribe, () => reading.settings, () => reading.settings)
}

/** Who the settings belong to and whether the office has answered, for the Settings group. */
export function useShortcutsReading(): ShortcutsReading {
  return useSyncExternalStore(broadcast.subscribe, () => reading, () => reading)
}

// Read once before the first page draws, and again whenever who is reading changes. A reader with
// no account answers `error` and every shortcut stays on, which is what the column reads as anyway.
if (typeof window !== 'undefined' && window.location?.protocol?.startsWith('http')) {
  subscribeActor(() => {
    void readShortcuts(true)
  })
  void readShortcuts()
}
