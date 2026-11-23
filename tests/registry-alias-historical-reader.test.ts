// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REGISTER OF AGENT IDENTITY POSITIONS, AND THE READER THAT READS ONE RECORD OR ONE CHANGE ROW BY IT.
 *
 * Every agent, alias and value here is made up, in a throwaway office.
 *
 * MUTATIONS, after a control run, for the five positions read as a stamp behind their pair and for the office's old
 * system name in a short form's writer. The first four are in identity-positions.ts. Give BundleExporter.actorId back
 * its actor-pair parse, and the map-key case and the freed-handle case go red. Leave BundleExporter.actorId a stamp with
 * no pair, and two cases go red: the map-key case, because a human exporter and an exporter with no type are read, and
 * the case that blocks a change row whose path or kind cannot be typed, because a change to the exporter's id alone is
 * read with no type beside it. Give SessionOpenedBy.id back its actor-pair parse, and the freed-handle case goes red.
 * Give ShortForm.by or ReportParts.by back its actor-pair parse, and the freed-handle short-form case and the
 * old-system-name case go red. The last is in historical-reader.ts: read a short form's writer stored under the old
 * system name as any other stamp, and the old-system-name case goes red. The other cases name no mutation here.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type DeclaredType } from '../src/shared/kinds.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { fileSyntheticAlias, inventedRegistry, rawHistory, syntheticAlias } from './registry-alias-fixture.ts'

let t: TestDb
beforeEach(async () => { t = await freshDb(); inventedRegistry(t) })
afterEach(() => t?.close())

const actor = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const reader = () => import('../src/server/lib/registry-aliases/historical-reader.ts')
const alias = syntheticAlias.aliasId
const canonical = syntheticAlias.canonicalId
const agentRef = (id: string) => ({ kind: 'agent', id })
function reaches(node: DeclaredType, name: string): boolean {
  if (node.kind === 'shape') return node.name === name
  if (node.kind === 'array' || node.kind === 'record') return reaches(node.of, name)
  if (node.kind === 'either') return node.options.some(option => reaches(option.node, name))
  return false
}
/** A retired agent whose id is also the handle of a newer, live agent. Returns that string. */
function aFreedHandle(): string {
  const db = t.client.sqlite, freed = 'synthetic-freed', at = '2026-01-01 00:00:00'
  const asset = db.prepare('INSERT INTO assets (id, kind, origin, mime, created_at) VALUES (?, ?, ?, ?, ?)')
  for (const id of ['synthetic-asset-c', 'synthetic-asset-d']) asset.run(id, 'avatar', 'default', 'image/svg+xml', at)
  const insert = db.prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, created_at, retired) VALUES (?, ?, ?, ?, ?, ?)')
  insert.run(freed, 'Synthetic legacy', freed, 'synthetic-asset-c', at, 1)
  insert.run('SyntheticMint1', 'Synthetic minted', freed, 'synthetic-asset-d', '2026-01-03 00:00:00', 0)
  return freed
}
function holdsAnOpenBag(node: DeclaredType): boolean {
  if (node.kind === 'open') return true
  if (node.kind === 'array') return holdsAnOpenBag(node.of)
  if (node.kind === 'either') return node.options.some(option => holdsAnOpenBag(option.node))
  return false
}

describe('reading the identities in one record', () => {
  it('returns each position with its path, stored spelling, canonical id and register entry', async () => {
    await fileSyntheticAlias(t)
    const { readRecordIdentities } = await reader()
    const data = { body: 'Synthetic words', sentBy: agentRef(alias), to: [{ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, agentRef('CanonicalB2')] }
    const copy = structuredClone(data), before = rawHistory(t)
    expect(readRecordIdentities(t.client.sqlite, 'message', data)).toEqual({
      found: [
        { path: 'data.sentBy.id', as: 'value', stored: alias, canonical, site: 'message.sentBy', parse: 'participant' },
        { path: 'data.to[1].id', as: 'value', stored: 'CanonicalB2', canonical: 'CanonicalB2', site: 'message.to', parse: 'participant' },
      ],
      blocks: [],
    })
    expect(data).toEqual(copy)
    expect(rawHistory(t)).toEqual(before)
  })
  it('reads map keys, plain registry ids, a stamp behind its pair and the dead-letter encoding by their register entries', async () => {
    await fileSyntheticAlias(t)
    const { readRecordIdentities } = await reader()
    const session = readRecordIdentities(t.client.sqlite, 'session', {
      servingAgentId: 'CanonicalB2', servingAgent: alias,
      workerRuns: { [alias]: { state: 'wanted', askedAt: '2026-01-01 00:00:00', askedBy: { who: agentRef(alias), session: 'synthetic-parent' }, handle: 'synthetic-worker' } },
    })
    expect(session.blocks).toEqual([])
    expect(session.found).toEqual([
      { path: 'data.servingAgentId', as: 'value', stored: 'CanonicalB2', canonical: 'CanonicalB2', site: 'session.servingAgentId', parse: 'registry-id' },
      { path: 'data.workerRuns["archived-cobalt"]', as: 'key', stored: alias, canonical, site: 'session.workerRuns', parse: 'map-key' },
      { path: 'data.workerRuns["archived-cobalt"].askedBy.who.id', as: 'value', stored: alias, canonical, site: 'WorkerRunAskedBy.who', parse: 'participant' },
    ])
    const pairs = (actorType?: string, actorId: string = alias) => readRecordIdentities(t.client.sqlite, 'task', { package: { by: { ...(actorType === undefined ? {} : { actorType }), actorId } } })
    expect(pairs('agent', 'current-cobalt')).toEqual({ found: [{ path: 'data.package.by.actorId', as: 'value', stored: 'current-cobalt', canonical: 'current-cobalt', site: 'BundleExporter.actorId', parse: 'stamp' }], blocks: [] })
    expect(pairs('agent')).toEqual({ found: [], blocks: [{ path: 'data.package.by.actorId', reason: 'cannot-tell', why: expect.any(String) }] })
    expect(pairs('human')).toEqual({ found: [], blocks: [] })
    expect(pairs().found).toEqual([])
    expect(pairs().blocks.map(one => [one.path, one.reason])).toEqual([['data.package.by.actorId', 'no-writer-kind']])
    const sweep = (value: unknown) => readRecordIdentities(t.client.sqlite, 'message', { deadLetterSweep: value })
    expect(sweep({ waiting: ['SyntheticMessage1~archived-cobalt'] })).toEqual({
      found: [{ path: 'data.deadLetterSweep.waiting[0]', as: 'part', stored: alias, canonical, site: 'message.deadLetterSweep', parse: 'encoded' }], blocks: [],
    })
    expect(sweep({ waiting: ['no separator'] }).blocks.map(one => [one.path, one.reason])).toEqual([['data.deadLetterSweep.waiting[0]', 'wrong-type']])
    expect(sweep({ waiting: [], said: { addressees: [] } }).blocks.map(one => [one.path, one.reason])).toEqual([['data.deadLetterSweep.said', 'open-bag']])
  })
  it('reads the two historical variants and blocks the one that cannot be told apart', async () => {
    await fileSyntheticAlias(t)
    const { readRecordIdentities } = await reader()
    expect(readRecordIdentities(t.client.sqlite, 'message', { from: agentRef(alias) }).found).toEqual([
      { path: 'data.from.id', as: 'value', stored: alias, canonical, site: 'message.from', parse: 'historical' },
    ])
    expect(readRecordIdentities(t.client.sqlite, 'message', { from: 'Somebody, in their own words' })).toEqual({ found: [], blocks: [] })
    expect(readRecordIdentities(t.client.sqlite, 'message', { from: { ...agentRef(alias), extra: true } }).blocks.map(one => [one.path, one.reason])).toEqual([['data.from', 'wrong-type']])
    expect(readRecordIdentities(t.client.sqlite, 'session', { servingAgent: alias })).toEqual({ found: [], blocks: [{ path: 'data.servingAgent', reason: 'cannot-tell', why: expect.any(String) }] })
    expect(readRecordIdentities(t.client.sqlite, 'session', { servingAgent: alias, servingAgentId: canonical }).blocks).toEqual([])
  })
  it('reads who pressed a goal\'s confirmation as a stamp, and blocks a name that no agent or more than one answers to', async () => {
    await fileSyntheticAlias(t)
    const { readRecordIdentities } = await reader()
    const pressed = (by: string) => readRecordIdentities(t.client.sqlite, 'goal', { confirmed_by: { by: THE_TEST_OFFICES_OWNER.id, at: '2026-01-01', pressed_by: by } })
    const path = 'data.confirmed_by.pressed_by'
    expect(pressed('current-cobalt')).toEqual({ found: [{ path, as: 'value', stored: 'current-cobalt', canonical: 'current-cobalt', site: 'GoalConfirmation.pressed_by', parse: 'stamp' }], blocks: [] })
    expect(pressed('synthetic-nobody')).toEqual({ found: [], blocks: [{ path, reason: 'names-no-agent', why: expect.any(String) }] })
    expect(pressed(alias)).toEqual({ found: [], blocks: [{ path, reason: 'cannot-tell', why: expect.any(String) }] })
  })
  it('blocks the exporter, the agent asked to check and a run\'s opener where a retired agent\'s id is a minted agent\'s handle', async () => {
    const db = t.client.sqlite, freed = aFreedHandle(), at = '2026-01-01 00:00:00'
    const { theAgentsAStampCouldName } = await import('../src/server/lib/registry-aliases/stamps.ts')
    expect([...theAgentsAStampCouldName(db, freed)].sort()).toEqual(['SyntheticMint1', freed].sort())
    const { readRecordIdentities } = await reader()
    const cannotTell = (path: string) => ({ found: [], blocks: [{ path, reason: 'cannot-tell', why: expect.any(String) }] })
    expect(readRecordIdentities(db, 'task', { package: { by: { actorType: 'agent', actorId: freed } } })).toEqual(cannotTell('data.package.by.actorId'))
    expect(readRecordIdentities(db, 'session', { checkAlso: { items: ['Synthetic question'], by: { actorType: 'agent', actorId: freed }, at } })).toEqual(cannotTell('data.checkAlso.by.actorId'))
    expect(readRecordIdentities(db, 'session', { extra: { openedBy: { type: 'agent', id: freed } } })).toEqual(cannotTell('data.extra.openedBy.id'))
  })
  it('blocks a short form and report parts whose writer is a handle a retired agent\'s id and a minted agent share', async () => {
    const db = t.client.sqlite, freed = aFreedHandle(), at = '2026-01-01 00:00:00', madeFrom = { seq: 1, contentHash: 'synthetic' }
    const { readRecordIdentities } = await reader()
    const shortForms = { label: { text: 'Synthetic label', madeFrom, writtenBy: 'agent', at, by: freed }, parts: { madeFrom, writtenBy: 'agent', at, by: freed, parts: [] } }
    expect(readRecordIdentities(db, 'report', { shortForms })).toEqual({
      found: [],
      blocks: [
        { path: 'data.shortForms.label.by', reason: 'cannot-tell', why: expect.any(String) },
        { path: 'data.shortForms.parts.by', reason: 'cannot-tell', why: expect.any(String) },
      ],
    })
  })
  it('passes over a short form and report parts an agent wrote under the old system name, with no block', async () => {
    const db = t.client.sqlite, at = '2026-01-01 00:00:00', madeFrom = { seq: 1, contentHash: 'synthetic' }
    const { SYSTEM_ACTOR_IDS_RENAMED } = await import('../src/shared/renamed-words.ts')
    const oldName = SYSTEM_ACTOR_IDS_RENAMED[0]!.from
    const { theAgentsAStampCouldName } = await import('../src/server/lib/registry-aliases/stamps.ts')
    expect(theAgentsAStampCouldName(db, oldName).size).toBe(0)
    const { readRecordIdentities } = await reader()
    const shortForms = { label: { text: 'Synthetic label', madeFrom, writtenBy: 'agent', at, by: oldName }, parts: { madeFrom, writtenBy: 'agent', at, by: oldName, parts: [] } }
    expect(readRecordIdentities(db, 'report', { shortForms })).toEqual({ found: [], blocks: [] })
  })
  it('blocks instead of guessing, and never searches outside the declared types', async () => {
    await fileSyntheticAlias(t)
    const { readRecordIdentities } = await reader()
    const paths = (kind: string, data: unknown) => {
      const reading = readRecordIdentities(t.client.sqlite, kind, data)
      expect(reading.found, JSON.stringify(data)).toEqual([])
      return reading.blocks.map(one => [one.path, one.reason])
    }
    expect(paths('no_such_kind', { sentBy: agentRef(alias) })).toEqual([['data', 'unknown-kind']])
    expect(paths('message', { notAField: agentRef(alias) })).toEqual([['data.notAField', 'undeclared-field']])
    expect(paths('report', { blocks: [{ type: 'no-such-block', to: agentRef(alias) }] })).toEqual([['data.blocks[0].type', 'unknown-variant']])
    expect(paths('message', { sentBy: alias })).toEqual([['data.sentBy', 'wrong-type']])
    expect(paths('message', { askedToResolve: { agentId: alias } })).toEqual([['data.askedToResolve.agentId', 'undeclared-field']])
    expect(paths('message', { askedToResolve: {} })).toEqual([])
    expect(paths('message', { extra: { anything: agentRef(alias) } })).toEqual([['data.extra', 'no-form-reads']])
    expect(paths('message', { body: JSON.stringify(agentRef(alias)) })).toEqual([])
    const roll = readRecordIdentities(t.client.sqlite, 'session', { workerRuns: { [canonical]: { state: 'wanted', castingRoll: { row: agentRef(alias) } } } })
    expect(roll.found.map(one => one.path)).toEqual(['data.workerRuns.CanonicalA1'])
    expect(roll.blocks.map(one => [one.path, one.reason])).toEqual([['data.workerRuns.CanonicalA1.castingRoll', 'wrong-type']])
    expect(paths('decision', { recorded_by: alias })).toEqual([['data.recorded_by', 'cannot-tell']])
  })
})

describe('reading the identities in one change row', () => {
  it('types each fragment by its path and the kind of its record', async () => {
    await fileSyntheticAlias(t)
    const { readChangeIdentities } = await reader()
    const read = (field: string | null, newValue: string | null, oldValue: string | null = null, kind: { kind: string } = { kind: 'session' }) =>
      readChangeIdentities(t.client.sqlite, kind, { field, oldValue, newValue })
    const entry = JSON.stringify({ state: 'wanted', askedBy: { who: agentRef(alias), session: 'synthetic-parent' } })
    expect(read(`data.workerRuns.${alias}`, entry)).toEqual({
      found: [
        { path: `field:data.workerRuns.${alias}`, as: 'key', stored: alias, canonical, site: 'session.workerRuns', parse: 'map-key' },
        { path: `new_value:data.workerRuns.${alias}.askedBy.who.id`, as: 'value', stored: alias, canonical, site: 'WorkerRunAskedBy.who', parse: 'participant' },
      ],
      blocks: [],
    })
    expect(read('data.servingAgentId', alias).found).toEqual([{ path: 'new_value:data.servingAgentId', as: 'value', stored: alias, canonical, site: 'session.servingAgentId', parse: 'registry-id' }])
    expect(read('data.sentBy', null, JSON.stringify(agentRef(canonical)), { kind: 'message' }).found.map(one => [one.path, one.canonical])).toEqual([['old_value:data.sentBy.id', canonical]])
    expect(read('data', JSON.stringify({ sentBy: agentRef(alias) }), null, { kind: 'message' }).found.map(one => [one.path, one.stored, one.canonical])).toEqual([['new_value:data.sentBy.id', alias, canonical]])
    for (const field of [null, 'title', 'summary', 'kind', 'deletedAt', 'workspaceId']) expect(read(field, alias)).toEqual({ found: [], blocks: [] })
  })
  it('blocks a change row whose path or kind cannot be typed', async () => {
    await fileSyntheticAlias(t)
    const { readChangeIdentities } = await reader()
    const blocked = (field: string, newValue: string, kind: { kind: string } | { reason: 'no-kind' | 'kind-changed'; why: string } = { kind: 'session' }) => {
      const reading = readChangeIdentities(t.client.sqlite, kind, { field, oldValue: null, newValue })
      expect(reading.found, field).toEqual([])
      return reading.blocks.map(one => [one.path, one.reason])
    }
    expect(blocked('resource.state', alias)).toEqual([['field', 'untyped-change']])
    expect(blocked('data.notAField', alias)).toEqual([['field', 'undeclared-field']])
    expect(blocked('data.sentBy', JSON.stringify(agentRef(alias)), { reason: 'no-kind', why: 'synthetic' })).toEqual([['field', 'no-kind']])
    expect(blocked('data.askedToResolve.agentId', alias, { kind: 'message' })).toEqual([['field', 'undeclared-field']])
    expect(blocked('data.blocks[#b1].to', alias, { kind: 'report' })).toEqual([['field', 'untyped-change']])
    expect(blocked('data.package.by.actorId', alias, { kind: 'task' })).toEqual([['new_value:data.package.by.actorId', 'no-writer-kind']])
    expect(blocked('data.sentBy', 'not json', { kind: 'message' })).toEqual([['new_value', 'not-json']])
  })
})

describe('the census of a made-up store', () => {
  const tables = () => Object.fromEntries(['records', 'revisions', 'changes', 'registry_aliases'].map(table => [table, t.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]))
  it('reads every row once, counts positions by register entry, lists aliases and blocks, and writes nothing', async () => {
    await fileSyntheticAlias(t)
    const run = t.api.createRecord({ kind: 'session', workspaceId: 'default', title: 'Synthetic census run', origin: 'fixture', data: { state: 'running', runtime: 'codex' }, actor })
    t.api.writeTheWorkerRun(run.id, 'CanonicalB2', { state: 'wanted', askedAt: '2026-01-01 00:00:00', askedBy: { who: agentRef(alias), session: 'synthetic-parent' }, handle: 'synthetic-worker' }, actor)
    const older = t.api.createRecord({ kind: 'session', workspaceId: 'default', title: 'Synthetic older run', origin: 'fixture', data: { state: 'running', runtime: 'codex' }, actor })
    t.client.sqlite.prepare("UPDATE records SET data=?, deleted_at='2026-01-03 00:00:00' WHERE id=?").run(JSON.stringify({ state: 'running', runtime: 'codex', servingAgent: alias }), older.id)
    const model = t.client.sqlite.prepare('SELECT * FROM changes WHERE record_id=? LIMIT 1').get(run.id) as Record<string, unknown>
    const next = (t.client.sqlite.prepare('SELECT max(append_order) + 1 AS n FROM changes').get() as { n: number }).n
    const orphan = { ...model, id: 'synthetic-orphan-change', record_id: 'no-such-record', append_order: next, field: 'data.sentBy', old_value: null, new_value: JSON.stringify(agentRef(alias)) }
    t.client.sqlite.prepare(`INSERT INTO changes (${Object.keys(orphan).join(',')}) VALUES (${Object.keys(orphan).map(() => '?').join(',')})`).run(...Object.values(orphan))
    const revision = (t.client.sqlite.prepare('SELECT id FROM revisions WHERE record_id=? ORDER BY seq DESC LIMIT 1').get(run.id) as { id: string }).id
    const change = (t.client.sqlite.prepare("SELECT id FROM changes WHERE record_id=? AND field='data.workerRuns.CanonicalB2'").get(run.id) as { id: string }).id
    const count = (table: string) => (t.client.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n

    const before = tables()
    const { IDENTITY_CENSUS_TABLES, takeIdentityCensus } = await import('../src/server/lib/registry-aliases/census.ts')
    const census = takeIdentityCensus(t.client.sqlite)
    expect(tables()).toEqual(before)

    // Every row of every table the census lists, which tests/registry-alias-classified-id-columns.test.ts pins.
    expect(census.read).toEqual(Object.fromEntries(IDENTITY_CENSUS_TABLES.map(({ table }) => [table, count(table)])))
    expect(census.positions['WorkerRunAskedBy.who']).toBe(3)
    expect(census.positions['session.workerRuns']).toBe(3)
    const path = 'workerRuns.CanonicalB2.askedBy.who.id'
    expect(census.aliases).toContainEqual({ table: 'records', row: run.id, path: `data.${path}`, stored: alias, canonical })
    expect(census.aliases).toContainEqual({ table: 'revisions', row: revision, path: `data.${path}`, stored: alias, canonical })
    expect(census.aliases).toContainEqual({ table: 'changes', row: change, path: `new_value:data.${path}`, stored: alias, canonical })
    expect(census.blocks).toContainEqual({ table: 'records', row: older.id, path: 'data.servingAgent', reason: 'cannot-tell', why: expect.any(String) })
    expect(census.blocks).toContainEqual({ table: 'changes', row: 'synthetic-orphan-change', path: 'field', reason: 'no-kind', why: expect.any(String) })
  })
})
