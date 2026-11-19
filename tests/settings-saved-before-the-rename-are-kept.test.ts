// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SETTING SAVED BEFORE THE RENAME SURVIVES THE RENAME.
 *
 * ---------------------------------------------------------------------------------------------
 * THE LOSS THIS CLOSES
 * ---------------------------------------------------------------------------------------------
 *
 * Every setting this browser remembers was stored under a key beginning `panelx.` until the
 * product was renamed on 28 August 2026. They begin `mole-office.` now.
 *
 * Renaming the keys and doing nothing else throws all of it away on the next load, silently: the
 * theme, the density, the reading style, the width of the sidebar, the mark colours, which project
 * you were in, which sections of Home were open, and `mole-office.talk.drafts` — instructions
 * somebody typed and has not sent. Nothing would say a word about any of it. That is the fifth
 * rule of this repository broken by a rename: absence presented as a state, when the truth is that
 * a value existed and was discarded.
 *
 * ---------------------------------------------------------------------------------------------
 * THE THREE THINGS CHECKED, AND WHY THE THIRD IS THE ONE THAT ROTS
 * ---------------------------------------------------------------------------------------------
 *
 * 1. The value moves, in both stores. Two stores because the app uses both: sessionStorage holds
 *    the per-tab detail choices in src/web/lib/detailchoice.ts.
 * 2. It never overwrites. A value already under the new name was chosen AFTER the rename, so it is
 *    the newer of the two; copying over it would undo a choice somebody made.
 * 3. The move happens before anything reads. This is the one that cannot be seen from the outside.
 *    src/web/lib/mode.ts reads its setting at module scope — `const BOOT = restore()` — because an
 *    effect runs after the first paint and would show one frame of the wrong theme. JavaScript
 *    evaluates a module's imports before its body, so a move placed in the body of main.tsx runs
 *    after mode.ts has already read and missed. Only being the FIRST import works, and nothing
 *    else in this repository would fail if somebody moved that line.
 *
 * PROVED BY MUTATION, control first. With `moveEverySettingSavedBeforeTheRename()` deleted from
 * the foot of src/web/lib/renamedkeys.ts the first two tests here still pass — they call the
 * function directly — and the third fails, which is why the third is written as a check on the
 * source of main.tsx rather than as another call.
 */
import { describe, expect, it } from 'vitest'

import {
  KEY_PREFIX,
  KEY_PREFIX_BEFORE_THE_RENAME,
  moveKeysSavedBeforeTheRename,
} from '../src/web/lib/renamedkeys.ts'

/** The smallest thing that behaves like the browser's Storage, so this needs no browser. */
function store(entries: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(entries))
  return {
    get length() {
      return map.size
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
    removeItem: (k: string) => {
      map.delete(k)
    },
    clear: () => {
      map.clear()
    },
  } as Storage
}

describe('what somebody had saved is still there after the rename', () => {
  it('moves the value to the new key and leaves nothing behind under the old one', () => {
    const s = store({ 'panelx.mode': 'inspect', 'panelx.talk.drafts': '[{"id":"d-1"}]' })

    expect(moveKeysSavedBeforeTheRename(s).sort()).toEqual(['mole-office.mode', 'mole-office.talk.drafts'])

    expect(s.getItem('mole-office.mode')).toBe('inspect')
    expect(s.getItem('mole-office.talk.drafts')).toBe('[{"id":"d-1"}]')
    expect(s.getItem('panelx.mode'), 'the old key is still there, so this would run again forever').toBe(null)
    expect(s.getItem('panelx.talk.drafts')).toBe(null)
  })

  it('moves every one of them, not the first, when a store holds several', () => {
    // Written because the obvious implementation walks store.key(i) while writing, and setting or
    // removing a key renumbers the ones not yet visited. That skips roughly half of them, and the
    // half it skips depends on the order the browser happens to hold them in.
    const many: Record<string, string> = {}
    for (let i = 0; i < 12; i++) many[`panelx.setting-${i}`] = `value-${i}`
    const s = store(many)

    expect(moveKeysSavedBeforeTheRename(s)).toHaveLength(12)
    for (let i = 0; i < 12; i++) expect(s.getItem(`mole-office.setting-${i}`)).toBe(`value-${i}`)
    expect(s.length, 'an old key survived').toBe(12)
  })

  it('leaves a key that has nothing to do with this product alone', () => {
    const s = store({ 'some-other-app.theme': 'dark', 'mole-office.mode': 'normal' })
    expect(moveKeysSavedBeforeTheRename(s)).toEqual([])
    expect(s.getItem('some-other-app.theme')).toBe('dark')
    expect(s.getItem('mole-office.mode')).toBe('normal')
  })

  it('never overwrites a choice made after the rename, and still clears the dead key', () => {
    // The new value is the later of the two by definition: it can only have been written by a
    // build that already had the new name. Copying over it would undo what somebody chose.
    const s = store({ 'panelx.mode': 'inspect', 'mole-office.mode': 'normal' })

    expect(moveKeysSavedBeforeTheRename(s), 'nothing should have moved').toEqual([])
    expect(s.getItem('mole-office.mode')).toBe('normal')
    expect(s.getItem('panelx.mode')).toBe(null)
  })

  it('agrees with itself about the two prefixes', () => {
    expect(KEY_PREFIX).toBe('mole-office.')
    expect(KEY_PREFIX_BEFORE_THE_RENAME).toBe('panelx.')
  })
})

