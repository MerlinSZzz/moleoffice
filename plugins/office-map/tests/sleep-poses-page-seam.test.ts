// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { standingLooks } from '../src/appearance.ts'
import { moleSprite } from '../src/mole-state.ts'
import { whereabouts } from '../src/ownership.ts'

// Who is asleep reaches whereabouts as a set of ids, from the office's asleep read or from a picture
// tool's made-up set, and every approved look is drawn from it. With an empty set, the houses stay empty.
const agents = standingLooks.map(look => ({ id: `invented-sleeper-${look}`, retired: false }))

it('puts every approved look in the sleeping house through the supplied asleep set', () => {
  const asleep = new Set(agents.map(agent => agent.id))
  const found = whereabouts(agents, null, asleep, { play: 0, sleep: agents.length }), indexes = new Set<number>()
  for (const [index, look] of standingLooks.entries()) {
    const at = found.get(agents[index]!.id)
    if (at?.where !== 'sleep') throw new Error(`${look} is not asleep`)
    indexes.add(at.index)
    expect(moleSprite(look, [], true, undefined, false, true, 'sleep', true), look).toBe(`sleep-${look}`)
  }
  expect(indexes.size).toBe(agents.length)
})

it('leaves every sleeping house empty when the asleep set names nobody', () => {
  const found = whereabouts(agents, null, new Set(), { play: 0, sleep: agents.length })
  for (const agent of agents) expect(found.get(agent.id)).toEqual({ where: 'desk' })
})
