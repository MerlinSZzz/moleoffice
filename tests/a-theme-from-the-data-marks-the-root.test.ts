// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE OF THE SIX THEMES MARKS THE ROOT WITH data-theme-from="data", AND LIGHT, DARK AND AUTO DO NOT.
 *
 * The rules that draw only under one of the six themes start with
 * `:where(:root[data-theme-from='data'])`. So under Light, Dark and Auto the attribute must be absent,
 * or those rules would draw on today's looks too. Under each of the six it must say `data`, or the
 * theme would be drawn without them. `applyPresets` is the one function that writes it.
 *
 * Each choice is applied after a theme from the data and after Light, so the attribute is seen both
 * coming and going.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { THEME_IDS } from '../src/shared/themes.ts'

type Bar = typeof import('../src/web/components/PresetBar.tsx')
type Presets = Bar['DEFAULT_PRESETS']

let bar: Bar

beforeAll(async () => {
  // The component's import graph reads localStorage at module scope, so the smallest stand-in for a
  // window goes in first, as in tests/the-text-size-control-writes-the-attribute.test.ts. With no
  // document, the import-time restore takes the default presets and writes nothing.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  bar = await import('../src/web/components/PresetBar.tsx')
})

/** A stand-in for <html> with the three methods `applyPresets` calls, which remembers what was written. */
function anElementThatRemembers(): HTMLElement {
  const written = new Map<string, string>()
  const root = {
    setAttribute: (name: string, value: string) => void written.set(name, value),
    removeAttribute: (name: string) => void written.delete(name),
    getAttribute: (name: string) => written.get(name) ?? null,
  }
  return root as unknown as HTMLElement
}

function themeFromAfter(before: Presets['theme'], theme: Presets['theme']): string | null {
  const root = anElementThatRemembers()
  bar.applyPresets({ ...bar.DEFAULT_PRESETS, theme: before }, root)
  bar.applyPresets({ ...bar.DEFAULT_PRESETS, theme }, root)
  return root.getAttribute('data-theme-from')
}

const BUILT_IN = () => bar.THEME_CHOICES.filter((choice) => !(THEME_IDS as readonly string[]).includes(choice))

describe('data-theme-from on the root', () => {
  it('has the six themes among the choices, after Auto, Light and Dark', () => {
    expect(bar.THEME_CHOICES.slice(3)).toEqual(THEME_IDS)
    expect(BUILT_IN()).toEqual(bar.THEME_CHOICES.slice(0, 3))
  })

  it.each(THEME_IDS.map((id) => [id]))('says data under %s, coming from Light and from another theme', (id) => {
    const other = THEME_IDS.find((one) => one !== id)
    if (other === undefined) throw new Error('There is only one theme, so none can be chosen after another.')
    expect(themeFromAfter('light', id)).toBe('data')
    expect(themeFromAfter(other, id)).toBe('data')
  })

  it('is absent under Auto, Light and Dark, coming from a theme from the data and from Light', () => {
    const fromData = THEME_IDS[0]
    if (fromData === undefined) throw new Error('There is no theme from the data to come from.')
    for (const choice of BUILT_IN()) {
      expect(themeFromAfter(fromData, choice), `after ${fromData}, then ${choice}`).toBeNull()
      expect(themeFromAfter('light', choice), `after light, then ${choice}`).toBeNull()
    }
  })
})
