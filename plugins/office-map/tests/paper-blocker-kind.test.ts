// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { paperBlockerKinds } from '../src/paper-blocker.ts'
import type { Rect } from '../src/viewport.ts'

const rect = (x: number): Rect => ({ x, y: 0, width: 10, height: 10 })

it('names every group a paper blocker belongs to, not only the first list it matches', () => {
  const other = rect(1), own = rect(2), furniture = rect(3), ground = rect(4)
  const both = rect(5), furnitureGround = rect(6), nothing = rect(7)
  const groups = {
    others: [other, both], playBodies: [own], furniture: [furniture, both, furnitureGround], ground: [ground, furnitureGround],
  }
  expect(paperBlockerKinds(other, groups)).toEqual(['other-body'])
  expect(paperBlockerKinds(own, groups)).toEqual(['own-body'])
  expect(paperBlockerKinds(furniture, groups)).toEqual(['furniture'])
  expect(paperBlockerKinds(ground, groups)).toEqual(['ground'])
  expect(paperBlockerKinds(both, groups)).toEqual(['other-body', 'furniture'])
  expect(paperBlockerKinds(furnitureGround, groups)).toEqual(['furniture', 'ground'])
  expect(paperBlockerKinds(nothing, groups)).toEqual([])
})
