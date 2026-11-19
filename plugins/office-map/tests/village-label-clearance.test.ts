// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { ownershipAreaLabels } from '../src/ownership-area-labels.ts'
import { overlaps } from '../src/nameplates.ts'
import { agent, people } from './fixtures.ts'
import type { RosterView } from '../src/contracts.ts'
const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const n = work.next(); if (n.done) return n.value } }
for (const count of [1, 16, 120]) for (const language of ['en', 'zh'] as const) it(`separates area and house labels for ${count} agents in ${language}`, () => {
  const agents = Array.from({ length: count }, (_, i) => agent(`person-${i}`, i === 0 ? { role: 'secretary' } : i < 4 ? { role: 'supervisor', startedBy: { kind: 'agent', id: 'person-0' } } : { startedBy: { kind: 'agent', id: `person-${1 + i % 3}` } }))
  const model = mapOffice({ ...people, view: 'roster', agents } as RosterView, null)
  const layout = finish(new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })), zoom = .24
  const headers = ownershipAreaLabels(layout, zoom, language, s => [...s].reduce((n, c) => n + (c.charCodeAt(0) < 128 ? 6 : 12), 0) / zoom)
  const labels = layout.houses.map(h => ({ x: h.x, y: Math.max(layout.bounds.y, h.y - 20 / zoom), width: Math.min(h.width, 160 / zoom), height: 20 / zoom }))
  for (const h of headers) for (const label of labels) expect(overlaps(h, label), h.lines[0]).toBe(false)
})
