// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Reading and writing one remembered browser setting, without ever guessing.
 *
 * Settings are remembered between visits, and this file deliberately does not say which ones. It
 * used to open by naming three; by the time the Settings page existed there were more than three
 * times that many and the sentence was still saying three. A list here and the real callers
 * elsewhere are the same fact written in two places, free to disagree — this repository's own
 * recurring defect. To see what is stored, read the callers.
 *
 * Every remembered setting wants the same two behaviours, and both are about honesty rather than
 * about storage:
 *
 * 1. **A browser that refuses storage says so.** `localStorage` THROWS rather than returning null
 *    under a locked-down profile or private browsing. Silently forgetting a setting on every load
 *    with no explanation is worse than saying it cannot be remembered.
 * 2. **A value this build does not recognise is dropped and announced.** It means a downgrade or a
 *    hand-edited store. Quietly substituting the default leaves somebody looking at an interface
 *    they did not choose with no idea why.
 *
 * This is a utility, not a settings system: it holds no list of what settings exist and no defaults.
 * Each caller owns its own key, its own vocabulary and its own fallback. The Settings page is where
 * a person changes them; it is not where they are stored, and nothing here knows it exists.
 */

import { content, readStoredWord, type WordKey, type WordValues } from '@shared/i18n.ts'

/** What went wrong, in words a person can act on. Never swallowed; the caller renders it. */
export interface StoreFault {
  key: string
  message: string
}

/**
 * A FAULT WHOSE WORDS ARE READ WHEN THEY ARE DRAWN, NOT WHEN THE FAULT IS FOUND.
 *
 * Most faults are found while a module is being evaluated, before the page knows the person's
 * language. So `message` is a getter: each read says the sentence in the page's language of that
 * moment. In Node, where a unit test calls this with no browser, it says the English.
 */
export function storeFault(key: string, word: WordKey, values?: WordValues): StoreFault {
  return {
    key,
    get message() {
      return readStoredWord(word, values)
    },
  }
}

/** The three methods anything here needs of a store. The shape a browser's `Storage` already has. */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/**
 * THE BROWSER'S OWN STORE, OR A STAND-IN THAT REFUSES THE SAME WAY WHEN THERE IS NOT ONE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT EXISTS: READING THE PROPERTY IS ITSELF A THING THAT THROWS
 * ---------------------------------------------------------------------------------------
 *
 * `window.localStorage` fails two ways when a browser blocks site data. `getItem` may throw, which
 * every guarded caller in this app already handles. Or THE PROPERTY ITSELF throws, which is what
 * Chrome does, and a `try` around `getItem` does not catch that: the expression fails before the
 * call is made.
 *
 * Two modules read the property while they were still being evaluated, so the whole browser app
 * stopped starting and drew "Mole Office did not start". Not one screen — all of them, the chat
 * panel included, whose own behaviour with storage gone was correct and which nobody could reach.
 * Problem `uihbRUojyr2p`, measured on 4 September 2026 in headless Chromium both ways.
 *
 * ---------------------------------------------------------------------------------------
 * IT REFUSES RATHER THAN PRETENDING TO BE EMPTY, AND THAT IS DELIBERATE
 * ---------------------------------------------------------------------------------------
 *
 * The stand-in's three methods throw an ordinary `Error` carrying the browser's own words. A store
 * that answered `null` would say *nothing is stored*, and what is true is *nobody can look* — the
 * fifth engineering rule, and the difference every caller in this file already reports to the
 * reader. A caller that wraps its own access therefore keeps the sentence it was going to print, and
 * a caller that does not is no worse off than before. What changes is that nothing throws at import.
 */
export function theBrowsersStore(which: 'local' | 'session' = 'local'): KeyValueStore {
  const refusing = (because: string): KeyValueStore => {
    const no = (): never => {
      throw new Error(because)
    }
    return { getItem: no, setItem: no, removeItem: no }
  }
  if (typeof window === 'undefined') return refusing('there is no browser here, so there is nothing to remember with')
  try {
    const held = which === 'local' ? window.localStorage : window.sessionStorage
    // A BROWSER MAY HAND BACK NOTHING RATHER THAN THROW, and a store that is not there would then
    // fail on the first call, from somewhere with nothing to say about why.
    if (held === null || held === undefined) return refusing(`this browser has no ${which} storage to offer`)
    return held
  } catch (err: unknown) {
    return refusing(err instanceof Error ? err.message : String(err))
  }
}

export function readStored(key: string): { ok: true; value: string | null } | { ok: false; reason: string } {
  try {
    return { ok: true, value: theBrowsersStore().getItem(key) }
  } catch (err: unknown) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

export function writeStored(key: string, value: string): { ok: true } | { ok: false; reason: string } {
  try {
    theBrowsersStore().setItem(key, value)
    return { ok: true }
  } catch (err: unknown) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

export function clearStored(key: string): void {
  try {
    theBrowsersStore().removeItem(key)
  } catch {
    // Already unreadable, and already reported by the read that got us here. Throwing out of a
    // cleanup would take the page down to tell somebody something they have just been told.
  }
}

/**
 * WHAT A PERSON IS TOLD WHEN THIS BROWSER WILL NOT KEEP A SETTING, said in one place.
 *
 * Reading and writing fail the same way and mean the same thing to the reader: the setting works
 * now and will not be here next time. It used to be written out at the read and nowhere at the
 * write, so a caller that wanted to say it at the write wrote its own — which is the same sentence
 * in two places, free to drift.
 */
function willNotRemember(key: string, because: string): StoreFault {
  // The reason is the browser's own words, so it is content and is never translated.
  return storeFault(key, 'frameWords.store.willNotRemember', { because: content(because) })
}

/**
 * Read one setting whose value must be one of a known set.
 *
 * Returns the fallback for "nothing stored", which is not a fault — it is a person who has never
 * chosen. It IS a fault when something is stored that this build has no meaning for, and the bad
 * key is then dropped so the complaint is made once rather than on every load.
 */
export function readChoice<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
  faults: StoreFault[],
): T {
  const read = readStored(key)
  if (!read.ok) {
    faults.push(willNotRemember(key, read.reason))
    return fallback
  }
  if (read.value === null) return fallback

  const found = allowed.find((candidate) => candidate === read.value)
  if (found === undefined) {
    faults.push(storeFault(key, 'frameWords.store.unknownValue', { value: content(read.value), key: content(key), fallback: content(fallback) }))
    clearStored(key)
    return fallback
  }
  return found
}

/**
 * Write one setting, and say in the same words as the read when the browser would not keep it.
 *
 * A browser that refuses reads refuses writes, so most of the time the reader has already been told
 * by `readChoice` on the same load. Not always: a store that is full accepts every read and refuses
 * the write, and a caller with no way to say that would swallow it.
 */
export function writeChoice(key: string, value: string, faults: StoreFault[]): void {
  const written = writeStored(key, value)
  if (!written.ok) faults.push(willNotRemember(key, written.reason))
}

/**
 * The subscribe/notify half of a `useSyncExternalStore` pair, for a setting that lives outside React.
 *
 * A remembered setting is read at import time — before the first paint, so nothing flashes — which
 * means it cannot live in component state. This is the smallest thing that lets a component re-render
 * when one changes: a set of listeners and a call to tell them.
 */
export function makeBroadcast(): { subscribe: (fn: () => void) => () => void; announce: () => void } {
  const listeners = new Set<() => void>()
  return {
    subscribe: (fn: () => void) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    announce: () => {
      for (const fn of listeners) fn()
    },
  }
}
