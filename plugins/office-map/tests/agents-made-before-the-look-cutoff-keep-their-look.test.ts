// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PROVES: the look chosen for an agent with no stored appearance depends on when the agent was made, so the
 * colourings added to the map later cannot change the look of an agent made before the cut-off, and a mole
 * seen from far away gets the same look as the same mole seen close.
 *
 * MUTATIONS: (1) the cut-off comparison is reversed; (2) an agent made before the cut-off chooses among
 * lookOrder.length; (3) the far-away call passes no creation time or a fixed one. Each turns this file red.
 */
import { afterEach, expect, it } from 'vitest'
import { OfficeMap } from '../src/map-view.ts'
import { portraitOf, standingClothes, standingLooks, standingOf } from '../src/appearance.ts'
import { identityRecipe } from '../src/look-identity.ts'
import { lookCount, lookCutoff, lookOrder } from '../src/look-order.ts'
import { identity, mapOffice, type Occupant, type OfficeModel } from '../src/model.ts'
import { agent, people } from './fixtures.ts'

const madeBefore = '2026-11-17 23:59:59'
const cutoff = '2026-11-18 00:00:00'
const originalLookCount = lookOrder.length
const addedLooks = [1, 4, 7, 10, 13, 16, 19, 22, 25]
const longerCount = originalLookCount + addedLooks.length
const ids = Array.from({ length: 2_000 }, (_, i) => `invented-map-look-${i}`)
const keys = ids.map(id => identity('agent', id))
const table = lookOrder as unknown as number[]

afterEach(() => { table.length = originalLookCount })

function withAddedLooks<T>(body: (longer: readonly number[]) => T): T {
  table.push(...addedLooks)
  const longer = [...lookOrder]
  try { return body(longer) } finally { table.length = originalLookCount }
}

function drawDistant(model: OfficeModel, occupant: Occupant): number {
  const composed: unknown[][] = [], native: unknown[][] = []
  const ctx = new Proxy({ drawImage: (...args: unknown[]) => native.push(args) },
    { get: (target, key) => Reflect.get(target, key) ?? (() => {}) }) as unknown as CanvasRenderingContext2D
  const map = {
    occupants: new Map(model.occupants.map(one => [one.key, one])),
    drawnScale: OfficeMap.prototype.drawnScale,
    layout: { ownership: true, seats: {} },
    individuals: false,
    options: { still: true, wave: null as string | null, workAvailable: false },
    lookFrames: { draw: (...args: unknown[]) => { composed.push(args); return true } },
  }
  ;(OfficeMap.prototype as unknown as { actor: (ctx: CanvasRenderingContext2D, key: string, point: { x: number; y: number }) => void })
    .actor.call(map, ctx, occupant.key, { x: 50, y: 150 })
  expect(native).toHaveLength(0)
  expect(composed).toHaveLength(1)
  return composed[0]![1] as number
}

it('gives every agent made before the cut-off exactly the look identity modulo 43 gives', () => {
  for (const key of keys) {
    const recipe = identityRecipe(key, 43)
    expect(standingOf(portraitOf(null), key, madeBefore)).toEqual({
      look: standingLooks[Math.floor(lookOrder[recipe]! / 3)], source: 'stable-fallback', recipe,
    })
  }
})

it('keeps a made-before agent on its look and gives a made-after agent all the colourings when looks are added', () => {
  const chosenBefore = new Map(keys.map(key => [key, standingOf(portraitOf(null), key, madeBefore)]))
  withAddedLooks(longer => {
    expect(lookOrder.length).toBe(longer.length)
    for (const key of keys) expect(standingOf(portraitOf(null), key, madeBefore)).toEqual(chosenBefore.get(key))
    const chosenAfter = keys.map(key => standingOf(portraitOf(null), key, cutoff))
    for (const [at, choice] of chosenAfter.entries()) {
      const recipe = identityRecipe(keys[at]!, longer.length)
      expect(choice).toEqual({ look: standingLooks[Math.floor(longer[recipe]! / 3)], source: 'stable-fallback', recipe })
    }
    expect(new Set(chosenAfter.map(choice => choice.recipe)).size).toBe(longer.length)
    const pastTheFortyThird = chosenAfter.filter(choice => choice.recipe! >= 43)
    expect(pastTheFortyThird.length).toBeGreaterThan(100)
  })
})

it('makes a second before the cut-off choose 43 and the cut-off itself choose the whole list', () => {
  expect(lookCutoff).toBe(cutoff)
  expect(lookCount(madeBefore, longerCount)).toBe(43)
  expect(lookCount(cutoff, longerCount)).toBe(longerCount)
  withAddedLooks(longer => {
    const key = keys.find(one => identityRecipe(one, 43) !== identityRecipe(one, longer.length))!
    expect(standingOf(portraitOf(null), key, madeBefore).recipe).toBe(identityRecipe(key, 43))
    expect(standingOf(portraitOf(null), key, cutoff).recipe).toBe(identityRecipe(key, longer.length))
  })
})

it('draws the far-away mole in the same look the near occupant has, before and after the cut-off', () => {
  withAddedLooks(longer => {
    const recolouredAt = (id: string, at: string) => standingClothes(standingOf(portraitOf(null), identity('agent', id), at)) !== 0
    const beforeId = ids.find(id => recolouredAt(id, madeBefore) && recolouredAt(id, cutoff))!
    const afterId = ids.find(id => {
      const choice = standingOf(portraitOf(null), identity('agent', id), cutoff)
      return choice.recipe! >= originalLookCount && recolouredAt(id, madeBefore) && recolouredAt(id, cutoff)
    })!
    expect(beforeId).not.toBe(afterId)
    expect(longer.length).toBe(longerCount)
    const roster = {
      ...people,
      agents: [
        agent(beforeId, { appearance: null, createdAt: madeBefore }),
        agent(afterId, { appearance: null, createdAt: cutoff }),
      ],
    }
    const model = mapOffice(roster, null)
    for (const id of [beforeId, afterId]) {
      const occupant = model.occupants.find(one => one.agent.id === id)!
      expect(occupant.standing.source).toBe('stable-fallback')
      expect(occupant.standing).toEqual(standingOf(occupant.portrait, occupant.key, occupant.agent.createdAt))
      expect(drawDistant(model, occupant)).toBe(occupant.standing.recipe)
    }
  })
})

