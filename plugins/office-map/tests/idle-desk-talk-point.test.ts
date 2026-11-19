// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { pointIsClear } from '../src/geometry.ts'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import type { RosterView } from '../src/contracts.ts'
import { agent, people } from './fixtures.ts'

it('keeps each invented worker conversation point clear of its own desk obstacle', () => {
  const agents = [agent('invented-secretary', { role: 'secretary' }), ...Array.from({ length: 4 }, (_, i) => agent(`invented-worker-${i}`, { startedBy: { kind: 'agent', id: 'invented-secretary' } }))]
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const build = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let next = build.next(); while (!next.done) next = build.next()
  const layout = next.value, workers = model.occupants.filter(o => o.agent.id.startsWith('invented-worker-'))
  expect(workers).toHaveLength(4)
  for (const worker of workers) {
    const station = layout.seats[worker.key]!, ownDesk = layout.obstacles.find(o => o.kind === 'desk' && o.station === worker.key)
    expect(ownDesk, worker.agent.id).toBeDefined()
    expect(pointIsClear({ ...layout, obstacles: [ownDesk!] }, station.talk), worker.agent.id).toBe(true)
  }
})
