// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { portraitOf, standingLooks, standingOf } from '../src/appearance.ts'
import { moleSprite } from '../src/mole-state.ts'

const made = '2026-11-17 23:59:59'
it('selects the corresponding sleep pose for every look and supported saved appearance', () => {
  for (const look of standingLooks) {
    expect(moleSprite(look, [], true, undefined, false, true, 'sleep', true)).toBe(`sleep-${look}`)
    const fallback = look === 'tuft' ? 'sleep-tuft' : `stand-${look}`
    expect(moleSprite(look, [], true, undefined, false, true, 'sleep')).toBe(fallback)
    expect(moleSprite(look, [], true, undefined, false, true, 'sleep', false)).toBe(fallback)
    expect(moleSprite(look, [], true, undefined, false, true, 'desk')).toBe(`stand-${look}`)
  }
  for (const [lookId, look] of Object.entries({ bare: 'crest', scarf: 'bun', 'sand-apron': 'apron', 'cocoa-vest': 'part', 'silver-glasses': 'waves' })) {
    const stored = { version: 2, style: 'c-forest', lookId }
    const selected = standingOf(portraitOf(stored), 'invented-example', made)
    expect(selected.look).toBe(look)
    expect(moleSprite(selected.look, [], true, undefined, false, true, 'sleep', true)).toBe(`sleep-${look}`)
    expect(stored).toEqual({ version: 2, style: 'c-forest', lookId })
  }
})
