// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SETTINGS SAVED UNDER THE OLD NAME ARE MOVED TO THE NEW ONE, ONCE, BEFORE ANYTHING READS THEM.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * This browser keeps about twenty settings, and every one of them was stored under a key beginning
 * `panelx.` until the product was renamed on 28 August 2026. They begin `mole-office.` now.
 *
 * Renaming the keys and doing nothing else loses all of it silently, on the next load, with no
 * message: the theme, the density, the reading style, the width of the sidebar, the mark colours,
 * which project you were in, which sections of Home you had open — and `mole-office.talk.drafts`,
 * which holds instructions somebody typed and has not sent yet. Nothing would say a word. The
 * person would open the product and find it looking like a fresh install.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES, AND WHAT IT REFUSES TO DO
 * ---------------------------------------------------------------------------------------
 *
 * For each key beginning `panelx.`, in both stores: if nothing is stored under the matching
 * `mole-office.` key, copy the value across. Then remove the old key either way.
 *
 * IT NEVER OVERWRITES. A value already stored under the new name was chosen after the rename, so
 * it is the newer of the two and the old one is dead weight. Copying over it would undo a choice
 * somebody made, which is worse than the loss this whole file exists to prevent.
 *
 * IT IS NOT A COMPATIBILITY LAYER. Nothing goes on reading the old keys. This runs once per
 * browser, moves what it finds, and after that there is nothing left for it to move. That is what
 * makes it deletable rather than permanent — see below.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT RUNS AT IMPORT, AND WHY THE IMPORT IS FIRST IN main.tsx
 * ---------------------------------------------------------------------------------------
 *
 * Several settings are read at IMPORT time rather than in an effect, on purpose: an effect runs
 * after the first paint, so restoring a theme there shows one frame of the wrong page.
 * src/web/lib/mode.ts is the clearest — `const BOOT = restore()` at module scope.
 *
 * JavaScript evaluates every import of a module before the module's own body, so a call placed in
 * the body of main.tsx would run AFTER mode.ts had already read and missed its value. The only
 * place a move can happen early enough is the body of a module that main.tsx imports FIRST. That
 * is this file, and `tests/settings-saved-before-the-rename-are-kept.test.ts` asserts the import
 * is first, because the ordering is invisible to the type checker and to every other test.
 *
 * ---------------------------------------------------------------------------------------
 * WHEN THIS FILE CAN BE DELETED
 * ---------------------------------------------------------------------------------------
 *
 * When every browser that has ever opened this product has loaded it once since 28 August 2026.
 * In practice that is the owner's two browsers. Deleting it after that costs nothing; deleting it
 * before costs somebody their unsent drafts.
 */

/** What every key this browser stores begins with. */
export const KEY_PREFIX = 'mole-office.'

/** What every key began with until 28 August 2026. Nothing reads these; they are only moved. */
export const KEY_PREFIX_BEFORE_THE_RENAME = 'panelx.'

/**
 * Move one store's keys, and say which ones moved.
 *
 * Takes the store rather than reaching for `window`, so a test can drive it with a stand-in and so
 * the same code does `localStorage` and `sessionStorage` without being written twice.
 */
export function moveKeysSavedBeforeTheRename(store: Storage): string[] {
  // The key list is taken before anything is written, because setting and removing keys while
  // walking `store.key(i)` renumbers the ones not yet visited and would skip some of them.
  const old: string[] = []
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i)
    if (key !== null && key.startsWith(KEY_PREFIX_BEFORE_THE_RENAME)) old.push(key)
  }

  const moved: string[] = []
  for (const was of old) {
    const now = KEY_PREFIX + was.slice(KEY_PREFIX_BEFORE_THE_RENAME.length)
    const value = store.getItem(was)
    if (value !== null && store.getItem(now) === null) {
      store.setItem(now, value)
      moved.push(now)
    }
    store.removeItem(was)
  }
  return moved
}

/**
 * Do it for both of this browser's stores.
 *
 * A browser that refuses storage throws on the first touch. That is not swallowed and not
 * reported either: every setting this would have moved is one the caller is about to fail to read,
 * and `readStored` in src/web/lib/store.ts already turns that into a sentence the person sees. A
 * second message here would say the same thing twice, before the page exists to show it.
 */
export function moveEverySettingSavedBeforeTheRename(): void {
  if (typeof window === 'undefined') return
  try {
    moveKeysSavedBeforeTheRename(window.localStorage)
    moveKeysSavedBeforeTheRename(window.sessionStorage)
  } catch {
    // Storage is unreadable. src/web/lib/store.ts is what says so, on the screen, in words.
  }
}

moveEverySettingSavedBeforeTheRename()
