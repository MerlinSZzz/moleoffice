// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SWITCH THE REDESIGN RESTS ON: Normal and Inspect.
 *
 * It is small, it is read at import time, and it would fail in a way nothing else in this
 * repository would catch — a mode that silently never changes looks exactly like a product with
 * nothing hidden.
 *
 * FOUR THINGS ARE PINNED HERE, and each one is a mistake somebody could make without a type error:
 *
 *   1. A REMEMBERED VALUE THIS BUILD DOES NOT KNOW IS DROPPED AND ANNOUNCED, never silently
 *      swapped. That is the fifth engineering rule — absence beats a guess — applied to a setting.
 *   2. THE ADDRESS WINS FOR ONE VISIT AND IS NEVER SAVED. A link somebody sent must not change how
 *      the product looks tomorrow.
 *   3. A BROWSER THAT REFUSES STORAGE IS SAID OUT LOUD rather than quietly forgotten.
 *   4. THE SWITCH IS REACHABLE WITHOUT BEING TOLD. An independent reviewer was asked how to enter
 *      developer/inspect mode and had nothing to try. The sidebar must render it, unfolded.
 *
 * THIS FILE WAS `mode-and-variants.test.ts`. The other half tested src/web/lib/variants.ts, the
 * registry behind the design comparison — three interaction questions built two ways each so the
 * owner could switch between complete designs. Round four answered all three, so the registry, the
 * switcher and the losing designs were deleted and the tests of them went with them. What replaced
 * them was one test in the redesign-shell test file, deleted on 12 November 2026.
 *
 * The runner's environment is `node` and this project has ruled out jsdom, so a window stand-in is
 * installed before the module is imported — exactly as tests/shell-nav.test.ts and tests/ui.test.ts
 * do it. `document` is deliberately absent, which is also what proves the module does not need one.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

type ModeModule = typeof import('../src/web/lib/mode.ts')

/**
 * A fresh window with a chosen address and a chosen memory, and the module imported against it.
 *
 * The import is busted out of the module cache every time because the module reads its setting
 * ONCE, at import, on purpose — that is what stops the page flashing the wrong view before an
 * effect can run. A test that imported it once could only ever check the first state it saw.
 */
async function boot(options: { search?: string; stored?: Record<string, string>; refuse?: boolean } = {}) {
  const store = new Map<string, string>(Object.entries(options.stored ?? {}))
  const storage = {
    getItem: (k: string) => {
      if (options.refuse === true) throw new Error('storage is disabled in this profile')
      return store.get(k) ?? null
    },
    setItem: (k: string, v: string) => {
      if (options.refuse === true) throw new Error('storage is disabled in this profile')
      store.set(k, v)
    },
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: options.search ?? '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  // Not a query string on the specifier: Vite refuses a dynamic import it cannot see the target of,
  // and that refusal is right — it is how it knows what to bundle. This is the runner's own way of
  // saying "forget what you have loaded", which is exactly what is being asked for.
  vi.resetModules()
  const mode = (await import('../src/web/lib/mode.ts')) as ModeModule
  return { mode, store }
}

describe('Normal and Inspect', () => {
  it('starts Normal for somebody who has never chosen', async () => {
    const { mode } = await boot()
    expect(mode.currentMode()).toBe('normal')
    expect(mode.modeFaults()).toEqual([])
  })

  it('remembers a choice', async () => {
    const { mode } = await boot({ stored: { 'mole-office.mode': 'inspect' } })
    expect(mode.currentMode()).toBe('inspect')
  })

  it('writes the choice where the next visit will read it', async () => {
    const { mode, store } = await boot()
    mode.setMode('inspect')
    expect(store.get('mole-office.mode')).toBe('inspect')
  })

  it('drops a remembered view this build has no meaning for, and SAYS SO', async () => {
    // A downgrade, or a hand-edited store. Quietly showing Normal would leave somebody looking at
    // a product missing everything they had turned on, with no way to find out why.
    const { mode, store } = await boot({ stored: { 'mole-office.mode': 'xray' } })
    expect(mode.currentMode()).toBe('normal')
    expect(mode.modeFaults().map((f) => f.message).join(' ')).toMatch(/"xray"/)
    expect(store.has('mole-office.mode'), 'the unusable value was left to complain again on every load').toBe(false)
  })

  it('says it cannot remember when the browser refuses storage, rather than forgetting in silence', async () => {
    const { mode } = await boot({ refuse: true })
    expect(mode.currentMode()).toBe('normal')
    expect(mode.modeFaults().map((f) => f.message).join(' ')).toMatch(/will not let Mole Office remember/)
  })

  it('lets the address decide for one visit, and does not save it', async () => {
    const { mode, store } = await boot({ search: '?mode=inspect' })
    expect(mode.currentMode()).toBe('inspect')
    expect(mode.modeIsFromAddress).toBe(true)
    expect(store.has('mole-office.mode'), 'a link somebody followed changed their saved setting').toBe(false)
  })

  it('ignores a mode in the address that is not one of the two', async () => {
    const { mode } = await boot({ search: '?mode=everything' })
    expect(mode.currentMode()).toBe('normal')
    expect(mode.modeIsFromAddress).toBe(false)
  })
})

describe('finding it without being told', () => {
  it('renders the Detail switch on the Settings page, not folded away inside Appearance', async () => {
    await boot()
    const { ViewSwitch } = (await import('../src/web/components/ViewSwitch.tsx')) as typeof import('../src/web/components/ViewSwitch.tsx')
    const markup = renderToStaticMarkup(h(ViewSwitch))
    expect(markup).toMatch(/Normal/)
    // "Developer", not "Inspect". "Inspect" is a browser word and tells a stranger nothing;
    // "Developer" tells them to leave it alone. The STORED word is still `inspect`, which is why
    // `?mode=inspect` and every saved setting go on working — the tests above pin that half.
    expect(markup).toMatch(/Developer/)
    expect(markup).not.toMatch(/>Inspect</)
    // And it says what it gives you. This is the one concept in the redesign that earns a sentence,
    // because no arrangement of pixels can tell somebody what "Developer" will add.
    expect(markup).toMatch(/ids/)
  })
})
