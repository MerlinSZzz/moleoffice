// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The made-up master is read without a browser: tiers, omitted areas, stored lanes and the step fallback. */
import { beforeAll, expect, it } from 'vitest'
import type { PanelRecord } from '../src/shared/types.ts'
import type { GraphLink } from '../src/web/components/graph/model.ts'
import type { StoredIntent } from '../src/web/components/graph/Edit.tsx'
import { MASTER } from './a-made-up-master-at-real-shape.ts'

beforeAll(() => {
  const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  ;(globalThis as unknown as { window: unknown }).window = { localStorage: storage, sessionStorage: storage, location: { hash: '' }, addEventListener: () => {}, removeEventListener: () => {} }
})

const record = (id: string, kind: string, title: string, data: object = {}) => ({ id, kind, title, data, summary: null, createdAt: '', updatedAt: '', deletedAt: null }) as PanelRecord
const master = record(MASTER.pipeline.key, 'pipeline', MASTER.pipeline.title, { blockIds: MASTER.steps.map((s) => s.key) })
const records = [record('visitor', 'module', 'Visitor'), record('outside', 'module', 'Outside service'), master, ...MASTER.steps.map((s) => record(s.key, 'block', s.title)), ...MASTER.blockPipelines.map((p) => record(p.key, 'pipeline', p.title, { blockIds: p.boxes })), ...MASTER.records.map((r) => record(r.key, r.kind, r.title, { tier: r.tier, state: r.state }))]
const links = [{ type: 'feeds', from: 'visitor', to: 'box-01' }, { type: 'feeds', from: 'box-01', to: 'outside' }, ...MASTER.blockPipelines.map((p) => ({ type: 'part_of', from: p.key, to: p.partOf })), ...MASTER.links, ...MASTER.waitsOn].map((l, n) => ({ linkId: `link-${n}`, type: l.type, fromId: l.from, toId: l.to, inferred: false, broken: false, gate: { at: 'not-a-dependency' } }) as GraphLink)
const loaded = { records, links, linkCarries: new Map<string, string | null | undefined>() }
const ids = (area: { items: ({ record: string } | { area: unknown })[] }) => area.items.flatMap((item) => 'record' in item ? [item.record] : [])

it('draws the master in tier order, preserving box order and leaving untiered boxes unplaced', async () => {
  const { lanesInputFor, readTheMastersMap } = await import('../src/web/components/graph/lanes/from-records.ts')
  const { t } = await import('../src/shared/i18n.ts')
  const map = readTheMastersMap(master, loaded)
  const input = lanesInputFor(loaded, master.id, master, 'boxes', null).input
  const areas = input.tree.areas
  const named = (key: string) => areas.find((a) => a.key === key)!
  const tierIds = (tier: string) => map.boxes.filter((b) => b.tier === tier).map((b) => b.id)
  const api = named('api-server')
  expect(areas.map((a) => a.key).slice(0, 7)).toEqual(['people', 'ways-in', 'api-server', 'hosting', 'runtime', 'outside', 'stores'])
  expect(ids(named('people'))).toEqual(['visitor'])
  expect(ids(named('outside'))).toEqual(['outside'])
  expect(named('people')).toMatchObject({ heading: { text: 'People', record: null }, arrange: 'row' })
  expect(named('ways-in')).toMatchObject({ heading: { text: t('bigMap.tier.ways-in'), record: null }, arrange: 'row' })
  expect(ids(named('ways-in'))).toEqual(tierIds('ways-in'))
  expect(api).toMatchObject({ heading: { text: 'API server', record: null }, arrange: 'stack', frame: 'solid' })
  const children = api.items.map((item) => 'area' in item ? item.area : null)
  expect(children.map((a) => a?.key)).toEqual(['gate', 'services', 'data'])
  for (const [n, tier] of ['gate', 'services', 'data'].entries()) {
    expect(children[n]).toMatchObject({ heading: { text: t(`bigMap.tier.${tier}` as 'bigMap.tier.gate'), record: null }, arrange: tier === 'services' ? 'grid' : 'row', columns: tier === 'services' ? 4 : null, beside: null })
    expect(ids(children[n]!)).toEqual(tierIds(tier))
  }
  for (const tier of ['hosting', 'runtime', 'stores'] as const) {
    expect(named(tier)).toMatchObject({ heading: { text: t(`bigMap.tier.${tier}`), record: null }, arrange: tier === 'stores' ? 'row' : 'stack' })
    expect(ids(named(tier))).toEqual(tierIds(tier))
  }
  expect(named('hosting').beside).toEqual({ side: 'left', of: api.key })
  expect(named('runtime').beside).toEqual({ side: 'right', of: api.key })
  expect(named('outside')).toMatchObject({ heading: { text: 'Outside', record: null }, arrange: 'stack', frame: 'dashed', beside: { side: 'right', of: 'runtime' } })
  expect(input.tree.notPlaced).toEqual(map.boxes.filter((box) => box.tier === null).map((box) => box.id))
  expect(input.tree.notPlaced).toHaveLength(3)
  expect(input.records.filter((r) => MASTER.steps.some((s) => s.key === r.id))).toEqual([])
})

it('keeps stored lanes and falls back to step rows when no box has a tier', async () => {
  const { lanesInputFor } = await import('../src/web/components/graph/lanes/from-records.ts')
  const intent = { scope: 'pipeline:master', intent: { lanes: [{ name: 'Stored', arrange: 'row' }], nodes: {} }, targets: [], report: {}, note: '' } as unknown as StoredIntent
  expect(lanesInputFor(loaded, master.id, master, 'boxes', intent).input.tree.areas[0]?.key).toBe('Stored')
  const noTiers = { ...loaded, records: records.map((r) => ({ ...r, data: { ...r.data, tier: null } })) }
  const fallback = lanesInputFor(noTiers, master.id, master, 'boxes', null).input
  expect(fallback.tree.areas.filter((a) => a.heading?.record).map((a) => a.heading?.record)).toEqual(MASTER.steps.map((s) => s.key))
  expect((fallback as unknown as { byStep: boolean }).byStep).toBe(true)
})


it('omits empty areas and lets the outside follow the remaining neighbour', async () => {
  const { lanesInputFor } = await import('../src/web/components/graph/lanes/from-records.ts')
  const without = (tiers: string[]) => ({ ...loaded, records: records.map((r) => tiers.includes(String(r.data.tier)) ? { ...r, data: { ...r.data, tier: null } } : r) })
  const noRuntime = lanesInputFor(without(['runtime']), master.id, master, 'boxes', null).input.tree.areas
  expect(noRuntime.some((area) => area.key === 'runtime')).toBe(false)
  expect(noRuntime.find((area) => area.key === 'outside')?.beside).toEqual({ side: 'right', of: 'api-server' })
  const noApi = lanesInputFor(without(['gate', 'services', 'data']), master.id, master, 'boxes', null).input.tree.areas
  expect(noApi.some((area) => area.key === 'api-server')).toBe(false)
  for (const key of ['hosting', 'runtime', 'outside']) expect(noApi.find((area) => area.key === key)).toMatchObject({ arrange: 'row', beside: null })
})
