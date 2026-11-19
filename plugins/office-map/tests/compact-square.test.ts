// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { houseCatalog } from '../src/village.ts'
import { agent, people } from './fixtures.ts'
import type { RosterView } from '../src/contracts.ts'

const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const n = work.next(); if (n.done) return n.value } }

it('keeps the common square shallow enough to group its furnishings', () => {
  const agents = Array.from({ length: 16 }, (_, i) => agent(`person-${i}`, i === 0 ? { role: 'secretary' } : { startedBy: { kind: 'agent', id: 'person-0' } }))
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const layout = finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster }))
  expect(layout.square.height).toBeLessThanOrEqual(houseCatalog.B03!.canvasSize[1]! + 64)
  expect(layout.places!.play).toHaveLength(3)
})
