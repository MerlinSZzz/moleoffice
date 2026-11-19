// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { AGENT, apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
import type { FastifyInstance } from 'fastify'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { MAIN_SUITE_FIX_EXAMPLE, type MainSuiteFix } from '../src/shared/main-suite-fix.ts'
import type { PanelRecord } from '../src/shared/types.ts'

// Criterion: absent state used to stay absent even for authoritative repair problems.
// The agreed reading is pending=open, verified fixed=fixed, landed return=worked_around.
// Any explicitly stored state wins, including invalid values; no canonical data is rewritten.
// Criterion refinement, before production (X0AsCcI2hTQO):
// OLD: stateOf.word/progress equalled the derived work state.
// NEW: stateOf.word/progress read only data.state; WorkRow still reads canonical
// work progress. WHY: generic stored-state chips must preserve absent storage, while work progress
// may be derived from mainSuiteFix. The four existing case names and all other assertions stay.
// From MTLjCC3oXtgy: catalogue sort stays equal to the literal row word; that assertion is unchanged.
// Work projections now also carry stateSource from the canonical reader; the allocation's own
// state is a separate fact. Optional structural types keep this criterion standalone before code.
// The namespace cast lets this criterion compile before the implementation exports its reader.
let t: TestDb
let app: FastifyInstance
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, A_HOOK_THAT_IMPORTS_THE_SERVER)
afterAll(async () => { await app?.close(); t?.close() })

function repair(extra: Partial<MainSuiteFix> = {}): MainSuiteFix {
  return { ...structuredClone(MAIN_SUITE_FIX_EXAMPLE), ...extra }
}

async function reading(data: Record<string, unknown>, expected: unknown): Promise<void> {
  const work = await import('../src/shared/work.ts')
  const reader = (work as unknown as { stateOfWork: (data: unknown) => unknown }).stateOfWork
  expect(reader, 'the shared state reader is exported').toBeTypeOf('function')
  const bytes = JSON.stringify(data)
  expect(reader(data)).toBe(expected)
  expect(JSON.stringify(data)).toBe(bytes)
  expect(work.theWorkHasEnded(data)).toBe(expected === 'fixed' || expected === 'worked_around' || expected === 'accepted')

  // A synthetic stored row exercises the readers, not the backend's machine-evidence write gate.
  const made = t.api.createRecord({ workspaceId: 'default', kind: 'problem', title: 'Synthetic repair reading', actor: AGENT })
  writeDataBypassingTheGate(t, made.id, data)
  const canonical = () => ({
    record: t.client.sqlite.prepare('SELECT * FROM records WHERE id = ?').get(made.id),
    revisions: t.client.sqlite.prepare('SELECT * FROM revisions WHERE record_id = ? ORDER BY seq').all(made.id),
  })
  const before = canonical()
  const record = t.api.getRecord(made.id) as PanelRecord
  const { stateOf } = await import('../src/web/components/family/read.ts')
  const page = stateOf(record)
  const literal = data['state']
  expect(page.word).toBe(typeof literal === 'string' && literal.trim() !== '' ? literal.trim() : null)
  expect(page.progress).toBe(work.progressOf(literal))
  const { COLUMN_SORT } = await import('../src/shared/catalogue.ts')
  expect(COLUMN_SORT.state.key({ ...record, incompleteCount: 0 })).toBe(page.word ?? '')
  // The actual Records page asks for light bodies; the namespace must survive that read intact.
  const response = await app.inject({ method: 'GET', url: '/api/records?kind=problem&shape=light&tally=family&limit=25' })
  expect(response.statusCode, response.body).toBe(200)
  const wire = (response.json() as { records: PanelRecord[] }).records.find(row => row.id === made.id)
  expect(wire).toBeDefined()
  expect(wire!.data['mainSuiteFix']).toEqual(data['mainSuiteFix'])
  expect(Object.hasOwn(wire!.data, 'state')).toBe(Object.hasOwn(data, 'state'))
  expect(stateOf(wire!)).toEqual(page)
  const { readWorkList } = await import('../src/server/lib/worklist.ts')
  expect(readWorkList(25).rows.find(row => row.id === made.id)?.state).toBe(typeof expected === 'string' ? expected : null)
  const source = Object.hasOwn(data, 'state') ? 'stored' : 'derived from mainSuiteFix'
  const projected = readWorkList(25).rows.find(row => row.id === made.id) as { stateSource?: string | null } | undefined
  expect(projected?.stateSource).toBe(source)
  const { resolveAllocated } = await import('../src/server/lib/planning.ts')
  const allocated = resolveAllocated([{ recordId: made.id }]).get(made.id) as { stateSource?: string | null } | undefined
  expect(allocated?.stateSource).toBe(source)
  const { computeAttention } = await import('../src/shared/attention.ts')
  const attention = computeAttention({ now: 0, records: [record], links: [], changes: [], resources: [], dueMs: () => null })
  expect(attention.noState.some(row => row.recordId === made.id)).toBe(work.progressOf(expected) === null)
  expect(canonical()).toEqual(before)
}

it('a pending main-suite repair problem reads open while its stored state is absent', async () => {
  await reading({ mainSuiteFix: repair({ pending: { phase: 'takeout', says: 'Synthetic take-out is queued, not landed.' } }) }, 'open')
  const work = await import('../src/shared/work.ts')
  const reader = (work as unknown as { stateOfWork: (data: unknown) => unknown }).stateOfWork
  for (const data of [{}, { mainSuiteFix: {} }, { mainSuiteFix: { outcome: { returned: 'queued' } } }, { mainSuiteFix: { ...repair(), extra: true } }, { mainSuiteFix: { ...repair(), deadlineMs: 0 } }]) {
    expect(reader(data)).toBeUndefined()
    expect(work.theWorkHasEnded(data)).toBe(false)
  }
})

it('a verified fixed main-suite repair problem reads fixed while its stored state is absent', async () => {
  await reading({ mainSuiteFix: repair({ outcome: { fixed: 'c'.repeat(40) }, fixedReceipt: { recordId: 'synthetic-green', seq: 1, contentHash: '1'.repeat(16) } }) }, 'fixed')
  const work = await import('../src/shared/work.ts')
  const reader = (work as unknown as { stateOfWork: (data: unknown) => unknown }).stateOfWork
  expect(reader({ mainSuiteFix: repair({ outcome: { fixed: 'c'.repeat(40) } }) })).toBeUndefined()
})

it('an actually returned main-suite repair problem reads worked_around while its stored state is absent', async () => {
  await reading({ mainSuiteFix: repair({ outcome: { returned: 'synthetic-landed-takeout' } }) }, 'worked_around')
})

it('any explicit main-suite problem state wins over the derived repair state including open and present invalid values', async () => {
  const mainSuiteFix = repair({ outcome: { returned: 'synthetic-landed-takeout' } })
  for (const state of ['open', 'accepted', 'fixed', 'worked_around', '', 'unknown-state', null, 0, false]) {
    await reading({ state, mainSuiteFix }, state)
  }
  const work = await import('../src/shared/work.ts')
  const reader = (work as unknown as { stateOfWork: (data: unknown) => unknown }).stateOfWork
  expect(reader({ state: undefined, mainSuiteFix })).toBeUndefined()
  expect(reader({ state: 'open', mainSuiteFix: repair({ outcome: { fixed: 'c'.repeat(40) }, fixedReceipt: { recordId: 'synthetic-green', seq: 1, contentHash: '1'.repeat(16) } }) })).toBe('open')
  for (const kind of ['session', 'agent', 'task'] as const) {
    const { stateOf } = await import('../src/web/components/family/read.ts')
    expect(stateOf({ kind, data: {} }).word).toBeNull()
  }
})
