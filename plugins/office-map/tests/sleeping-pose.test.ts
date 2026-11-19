// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { moleSprite } from '../src/mole-state.ts'

it('uses the available sleeping drawing for Tuft without substituting it for other looks', () => {
  expect(moleSprite('tuft', [], true, undefined, false, true, 'sleep')).toBe('sleep-tuft')
  expect(moleSprite('fringe', [], true, undefined, false, true, 'sleep')).toBe('stand-fringe')
  expect(moleSprite('tuft', [], true, undefined, false, true, 'desk')).toBe('stand-tuft')
})
