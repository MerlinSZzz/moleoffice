// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DIAGNOSTIC IS DRAWN FOR A DEVELOPER AND NOT DRAWN AT ALL FOR ANYBODY ELSE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS HOLDS
 * ---------------------------------------------------------------------------------------
 *
 * `<Machinery>` is the projection primitive four later waves rest on. Two things about it are
 * load-bearing and both are checked here:
 *
 *   1. A NORMAL READER GETS NOTHING AT ALL. Not hidden text, not off-screen text — nothing in the
 *      markup. An off-screen span still reaches `document.body.innerText` and still reaches a
 *      screen reader, so hiding a record id that way shows it to the reader least able to skip it.
 *      That failure is already in this product at `ui.tsx:1752` and it is why the assertion below
 *      is on the markup rather than on what is visible.
 *
 *   2. A DEVELOPER GETS THE WORDS, plus `data-fact` and `data-value` on the element, so a sweep can
 *      COUNT the machinery on a page instead of grepping for words that might be somebody's writing.
 *
 * The third reader, an agent, is not tested here and cannot be: an agent never renders a component.
 * It receives the value in the JSON, and that is a property of the reply, not of this component.
 *
 * ---------------------------------------------------------------------------------------
 * ONE GUARD HERE IS A TYPE AND HAS NO TEST ON PURPOSE
 * ---------------------------------------------------------------------------------------
 *
 * `<Machinery>`'s children are typed as strings and numbers, so `<Machinery><Absence …/></Machinery>`
 * does not compile. That is what stops any of the ten things a reader must always be shown from
 * being placed inside one. A test beside a compile error is a second place the same fact is checked,
 * and it is the weaker of the two. `npm run build` is what holds it.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT IS RENDERED
 * ---------------------------------------------------------------------------------------
 *
 * The runner has no DOM, so the component goes through `react-dom/server`, the way
 * `tests/module-condition.test.ts` renders a panel. `src/web/lib/mode.ts` reads its setting once, at
 * import, and touches `window`, so a window stand-in is installed before it is imported.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, afterEach, describe, expect, it } from 'vitest'
import { READERS, readerSees } from '../src/shared/audience.ts'

type MachineryModule = typeof import('../src/web/components/Machinery.tsx')
type ModeModule = typeof import('../src/web/lib/mode.ts')

let machinery: MachineryModule
let mode: ModeModule

beforeAll(async () => {
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  }
  machinery = await import('../src/web/components/Machinery.tsx')
  mode = await import('../src/web/lib/mode.ts')
})

// The mode is module-level state. A leak would silently change every later test in this file.
afterEach(() => {
  mode.setMode('normal')
})

function drawn(): string {
  return renderToStaticMarkup(
    h(machinery.Machinery, {
      fact: 'shortForms.written',
      value: 0,
      children: '0 of 5 written · POST /api/records/NHtlTgnKAG8h/short-forms',
    }),
  )
}

// ============================================================================ the two readers

describe('a diagnostic and the reader it is for', () => {
  it('draws nothing whatever for a normal reader — not hidden, not off-screen, absent', () => {
    mode.setMode('normal')
    const markup = drawn()
    expect(markup).toBe('')
    // Said separately, because "" satisfies all three and a later change might not.
    expect(markup).not.toContain('NHtlTgnKAG8h')
    expect(markup).not.toContain('px-sr')
    expect(markup).not.toContain('hidden')
  })

  it('draws the words for a developer', () => {
    mode.setMode('inspect')
    const markup = drawn()
    expect(markup).toContain('0 of 5 written')
    expect(markup).toContain('POST /api/records/NHtlTgnKAG8h/short-forms')
  })

  it('puts the fact and the value on the element, so a sweep can count machinery', () => {
    mode.setMode('inspect')
    const markup = drawn()
    expect(markup).toContain('data-fact="shortForms.written"')
    expect(markup).toContain('data-value="0"')
    // A normal reader's page has none of these to count. That is what the sweep asserts on 30 pages.
    mode.setMode('normal')
    expect(drawn()).not.toContain('data-fact')
  })

  it('follows the mode both ways, so the switch is a view and not a one-way door', () => {
    mode.setMode('inspect')
    expect(drawn()).not.toBe('')
    mode.setMode('normal')
    expect(drawn()).toBe('')
    mode.setMode('inspect')
    expect(drawn()).not.toBe('')
  })
})

// ============================================================================ the rule underneath

describe('the one place the rule is worked out', () => {
  it('says a browser is a developer in inspect and a normal reader otherwise', () => {
    mode.setMode('normal')
    expect(mode.currentMode()).toBe('normal')
    mode.setMode('inspect')
    expect(mode.currentMode()).toBe('inspect')
  })

  it('answers the same question `useInspect` answers, because one is written through the other', () => {
    // Not a tautology: it is the assertion that there is ONE reading of the mode and not two. The
    // 51 existing `useInspect()` call sites and every new `useReader()` call site must agree.
    for (const word of ['normal', 'inspect'] as const) {
      mode.setMode(word)
      const isDeveloper = word === 'inspect'
      expect(readerSees('developers', isDeveloper ? 'developer' : 'normal')).toBe(isDeveloper)
    }
  })

  it('is total over three readers and three audience states', () => {
    expect([...READERS]).toEqual(['normal', 'developer', 'agent'])
    const table = READERS.map((reader) => [
      readerSees(undefined, reader),
      readerSees('everyone', reader),
      readerSees('developers', reader),
    ])
    expect(table).toEqual([
      [true, true, false], // normal: everything except what is marked for developers
      [true, true, true], //  developer: everything
      [true, true, true], //  agent: everything, and that is a rule rather than a filter that passes
    ])
  })
})
