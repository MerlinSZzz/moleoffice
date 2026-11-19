// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { bindActions } from '../src/action-binding.ts'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import type { RosterView } from '../src/contracts.ts'
import { agent, people } from './fixtures.ts'

it.each([2, 5])('fits every invented work action in a %i-worker room without crossing a wall', count => {
  const agents = [agent('invented-secretary', { role: 'secretary' }), ...Array.from({ length: count }, (_, i) => agent(`invented-worker-${i}`, { startedBy: { kind: 'agent', id: 'invented-secretary' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  for (const occupant of model.occupants) if (occupant.agent.id.startsWith('invented-worker-')) {
    occupant.standing = { look: 'tuft', source: 'stable-fallback', recipe: 0 }; occupant.agent.appearance = null
  }
  const work = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let next = work.next(); while (!next.done) next = work.next()
  const result = bindActions(next.value, model), workers = model.occupants.filter(o => o.agent.id.startsWith('invented-worker-'))
  expect(result.rejected).toEqual([])
  expect(workers.every(o => result.bindings.get(o.key)?.action === 'desk')).toBe(true)
})
