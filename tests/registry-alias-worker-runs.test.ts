// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { theWorkerRunOn } from '../src/shared/worker-runs.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { aliasLibrary, fileSyntheticAlias, inventedRegistry, rawHistory, syntheticAlias } from './registry-alias-fixture.ts'

let t: TestDb
beforeEach(async () => { t = await freshDb(); inventedRegistry(t) })
afterEach(() => t?.close())

const actor = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const lookup = () => import('../src/server/lib/registry-aliases/worker-runs.ts')
const alias = syntheticAlias.aliasId
const canonical = syntheticAlias.canonicalId
const entry = (state: string) => ({
  state, askedAt: '2026-01-01 00:00:00', askedBy: { who: { kind: 'agent', id: 'CanonicalB2' }, session: 'synthetic-parent' }, handle: 'synthetic-worker',
  brief: { path: '/synthetic/brief.md', sha256: '0'.repeat(64), bytes: 1 }, sandbox: { folder: '/synthetic', instance: 'synthetic', container: 'synthetic' },
})
const runs = (map: Record<string, unknown>) => ({ workerRuns: map })

function aRunHolding(map: Record<string, unknown> | null): string {
  const run = t.api.createRecord({ kind: 'session', workspaceId: 'default', title: 'Synthetic supervisor run', origin: 'fixture', data: { state: 'running', runtime: 'codex' }, actor })
  if (map !== null) t.client.sqlite.prepare('UPDATE records SET data=? WHERE id=?').run(JSON.stringify({ ...t.api.getRecord(run.id)!.data, workerRuns: map }), run.id)
  return run.id
}
const storedMap = (id: string) => t.api.getRecord(id)!.data['workerRuns'] as Record<string, { state: string }>
/** The refusal of two stored keys for one agent: the alias library's error, naming both stored keys. */
async function refusesBothKeys(act: () => unknown): Promise<void> {
  const { RegistryAliasError } = await aliasLibrary()
  let thrown: unknown = null
  try { act() } catch (error) { thrown = error }
  expect(thrown).toBeInstanceOf(RegistryAliasError)
  expect((thrown as Error).message).toContain(alias)
  expect((thrown as Error).message).toContain(canonical)
}
const loggedFields = (id: string) => (t.client.sqlite.prepare("SELECT field FROM changes WHERE record_id=? AND field LIKE 'data.workerRuns.%'").all(id) as { field: string }[]).map(row => row.field)

describe('finding a worker-run entry by canonical id', () => {
  it('finds an entry stored under an old spelling by the canonical id and by the alias', async () => {
    await fileSyntheticAlias(t)
    const lib = await lookup()
    const data = runs({ [alias]: entry('wanted') })
    for (const asked of [canonical, alias]) {
      expect(lib.theStoredWorkerRunKey(t.client.sqlite, data.workerRuns, asked), asked).toBe(alias)
      expect(lib.theWorkerRunOf(t.client.sqlite, data, asked)?.state, asked).toBe('wanted')
    }
    expect(lib.theWorkerRunOf(t.client.sqlite, data, 'CanonicalB2')).toBeNull()
  })
  it('refuses two stored keys that reach one canonical id, in the lookup and in the count', async () => {
    await fileSyntheticAlias(t)
    const lib = await lookup()
    const data = runs({ [alias]: entry('wanted'), [canonical]: entry('started') })
    await refusesBothKeys(() => lib.theWorkerRunOf(t.client.sqlite, data, canonical))
    await refusesBothKeys(() => lib.theWorkerRunOf(t.client.sqlite, data, alias))
    await refusesBothKeys(() => lib.theOtherWorkerRunsWanted(t.client.sqlite, data, 'CanonicalB2'))
  })
  it('counts the other workers waiting by canonical id', async () => {
    await fileSyntheticAlias(t)
    const lib = await lookup()
    const data = runs({ [alias]: entry('wanted'), CanonicalB2: entry('wanted') })
    expect(lib.theOtherWorkerRunsWanted(t.client.sqlite, data, canonical)).toBe(1)
    expect(lib.theOtherWorkerRunsWanted(t.client.sqlite, data, alias)).toBe(1)
    expect(lib.theOtherWorkerRunsWanted(t.client.sqlite, data, 'CanonicalB2')).toBe(1)
  })
  it('with no alias filed, answers exactly as an exact-key lookup does', async () => {
    const lib = await lookup()
    const data = runs({ [alias]: entry('wanted'), [canonical]: entry('started'), CanonicalB2: entry('wanted') })
    for (const asked of [alias, canonical, 'CanonicalB2', 'AbsentWorker']) {
      expect(lib.theWorkerRunOf(t.client.sqlite, data, asked), asked).toEqual(theWorkerRunOn(data, asked))
      const exact = Object.keys(data.workerRuns).filter(id => id !== asked && theWorkerRunOn(data, id)?.state === 'wanted').length
      expect(lib.theOtherWorkerRunsWanted(t.client.sqlite, data, asked), asked).toBe(exact)
    }
  })
})

describe('writing a worker-run entry', () => {
  it('writes under the key already stored for the agent and never renames it', async () => {
    const run = aRunHolding({ [alias]: entry('wanted') })
    await fileSyntheticAlias(t)
    t.api.writeTheWorkerRun(run, canonical, entry('started'), actor)
    expect(Object.keys(storedMap(run))).toEqual([alias])
    expect(storedMap(run)[alias]!.state).toBe('started')
    expect(loggedFields(run)).toEqual([`data.workerRuns.${alias}`])
  })
  it('writes a new entry under the canonical id when the alias is asked', async () => {
    const run = aRunHolding(null)
    await fileSyntheticAlias(t)
    t.api.writeTheWorkerRun(run, alias, entry('wanted'), actor)
    expect(Object.keys(storedMap(run))).toEqual([canonical])
    expect(loggedFields(run)).toEqual([`data.workerRuns.${canonical}`])
  })
  it('with no alias filed, writes under the id it is given, as before', async () => {
    const run = aRunHolding({ [canonical]: entry('wanted') })
    t.api.writeTheWorkerRun(run, alias, entry('wanted'), actor)
    expect(Object.keys(storedMap(run)).sort()).toEqual([canonical, alias].sort())
    expect(loggedFields(run)).toEqual([`data.workerRuns.${alias}`])
  })
  it('refuses to write when two stored keys reach one canonical id, and writes nothing', async () => {
    const run = aRunHolding({ [alias]: entry('wanted'), [canonical]: entry('wanted') })
    await fileSyntheticAlias(t)
    const before = rawHistory(t)
    await refusesBothKeys(() => t.api.writeTheWorkerRun(run, canonical, entry('started'), actor))
    expect(rawHistory(t)).toEqual(before)
  })
})
