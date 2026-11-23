// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE STORES THAT ARE NOT RECORDS ARE READ BY THEIR WRITERS' OWN TYPES (item 30c, part 2b-5c). Nine columns in seven tables
 * hold JSON that no record kind declares: the request a run was given, the office map, the pieces of a folder reading,
 * the inputs of a one-press request and of a signing item, and the casting images before and after a change, in the
 * table of the casting and in the table of its rows. The identity reader
 * reads each by an adapter bound to its writer's type, finds every agent in it, and blocks what that type does not
 * have. A stamp, the handle a request named or the registry id its key proved, is read only where exactly one agent
 * answers to it. A piece's data is read by the kind the piece names. The census reads every row of all seven tables,
 * or only the rows it is given, which is how a project's archive asks which aliases its own rows need (part 2b-5d). It
 * reads the table of signing packages too, for two plain columns that hold a registry id, which
 * tests/registry-alias-plain-id-columns.test.ts reads (part 3). Rounds 153 and 154 added the old casting table's four
 * from cells, three of an agent's columns and two of each ledger row, and the eighth case lists every one.
 *
 * Every agent, alias and value here is made up, in a throwaway office.
 *
 * MUTATIONS, after a control run: read a run's actor as a registry id without asking which agents answer to it, and the
 * first case goes red. Leave the team out of a map's group key, and the second case goes red. Read a piece's data as an
 * open bag instead of by its kind, and the third case goes red. Read every act's inputs by the type of one act, and the
 * fourth case goes red. Read a casting writer's id without its kind beside it, and the fifth case goes red. Leave one
 * of the seven tables out of the census, and the sixth case goes red. Read every row whatever rows the census is given,
 * or learn a record's kind only from the records and revisions it is given, or let a list that leaves a table out pass,
 * and the seventh case goes red. Give a stamp a type that is not a string, or list who pressed a goal's confirmation or
 * who filed a goal as a registry id, and the eighth case goes red. In identity-positions.ts, give the exporter, a run's
 * opener, ShortForm.by or ReportParts.by back its actor-pair parse, and the eighth case goes red, because the list of
 * stamps is not the one it names.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CastingCell, CastingImage, CastingStoredCell } from '../src/shared/casting.ts'
import type { ForestMapState } from '../src/shared/forest-map.ts'
import type { FolderReadingPiece } from '../src/shared/folderreading.ts'
import type { ARunRequest } from '../src/server/lib/agents.ts'
import { KIND_SPECS, SHAPE_SPECS, type FieldSpec } from '../src/shared/kinds.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { fileSyntheticAlias, inventedRegistry, syntheticAlias } from './registry-alias-fixture.ts'

let t: TestDb
beforeEach(async () => { t = await freshDb(); inventedRegistry(t); await fileSyntheticAlias(t) })
afterEach(() => t?.close())

const reader = () => import('../src/server/lib/registry-aliases/historical-reader.ts')
const register = () => import('../src/server/lib/registry-aliases/identity-positions.ts')
const bags = () => import('../src/server/lib/registry-aliases/open-shapes.ts')
// The fixture's old id of its retired agent, which its live agent now holds as its handle: as a stamp, two agents answer to it.
const alias = syntheticAlias.aliasId
const canonical = syntheticAlias.canonicalId
const other = 'CanonicalB2'
// The retired agent's handle, which only it answers to.
const handle = 'current-cobalt'
const owner = THE_TEST_OFFICES_OWNER.id
const agentRef = (id: string) => ({ kind: 'agent' as const, id })
const at = '2026-01-01 00:00:00'
const found = (path: string, stored: string, site: string, parse: string, as = 'value') =>
  ({ path, as, stored, canonical: stored === alias ? canonical : stored, site, parse })
const stored = async (site: string, value: unknown, act: string | null = null) => (await reader()).readStoredColumn(t.client.sqlite, site, value, act)
const blocksOf = (reading: { blocks: { path: string; reason: string }[] }) => reading.blocks.map(one => [one.path, one.reason])

const context = { target: { kind: 'record' as const, recordId: 'SyntheticRecord1', workspaceId: 'default' } }
const request = (actorId: string, writtenBy: string) => ({
  workspaceId: 'default', workspaceTitle: 'Synthetic project', actorId, agentId: 'SyntheticAgentRecord',
  thread: { id: 'SyntheticThread', title: 'Synthetic thread', mode: 'review' },
  recipient: { kind: 'agent' as const, sessionRecordId: 'SyntheticAgentRecord', sessionTitle: 'Synthetic agent', said: null, why: null },
  resume: { runtime: 'codex', externalId: 'synthetic-conversation' },
  messages: [
    { id: 'SyntheticMessage1', intent: 'review', body: 'Synthetic words', context, contextSaid: 'the record SyntheticRecord1', contextState: 'there' as const, writtenAt: at, writtenBy },
    {
      id: 'SyntheticMessage2', intent: 'ask', body: 'Synthetic words', context: null, contextSaid: null, contextState: null,
      quotes: [{ number: 1, commentId: 'SyntheticComment1', context, contextSaid: 'the record SyntheticRecord1', contextState: 'changed' as const }],
      writtenAt: at, writtenBy: `human:${owner}`,
    },
  ],
  contextNote: 'Synthetic note', assembledAt: at, agentKeyId: 'SyntheticKey',
}) satisfies ARunRequest

const point = { x: 0, y: 0 }
const team = JSON.stringify(['default', 'team', other])
const map = {
  version: 1, seed: 'synthetic-seed', grouping: 'shared',
  regions: [
    { id: 'secretary', groupKey: 'secretary', zone: 'secretary', workspaceId: null, teamId: null, origin: point, profile: 'hub', cells: [point], slots: [point], door: point },
    { id: 'SyntheticRegion', groupKey: team, zone: 'team', workspaceId: 'default', teamId: other, origin: point, profile: 'grove', cells: [point], slots: [point], door: point },
  ],
  assignments: {
    [alias]: { regionId: 'SyntheticRegion', slot: 0, groupKey: team, workspaceId: 'default', active: true },
    [other]: { regionId: 'secretary', slot: 0, groupKey: 'secretary', workspaceId: null, active: false },
  },
  roads: [[point, { x: 1, y: 0 }]],
} satisfies ForestMapState

const piece = (over: Partial<FolderReadingPiece> = {}) => ({
  id: 'SyntheticPiece1', kind: 'message', title: 'Synthetic piece', summary: null, data: { body: 'Synthetic words', sentBy: agentRef(alias) },
  from: ['notes.md'], quote: 'Synthetic quote', state: 'proposed', recordId: null, decidedAt: null, decidedBy: null, ...over,
}) satisfies FolderReadingPiece

const source = (kind: string, id: string) => ({ at, by: { kind, id }, decision: { id: 'SyntheticDecision', project: 'default' }, moved: false, copied: false })
const cell = (value: string | null, from: ReturnType<typeof source> | null) => ({ value, from })
const empty = cell(null, null)
const image = {
  program: cell('codex', source('agent', handle)), model: cell('synthetic-model', source('human', owner)), effort: empty, difficulty: empty, quota: empty, cost: empty,
  labels: empty, probability: empty, out_until: empty, why: cell('Synthetic reason', source('agent', alias)), marked: true,
  native: { model: 'synthetic-model', provider: null, variant: null }, selectionRevision: 'synthetic-revision',
  hold: { revision: 'synthetic-revision', run: 'SyntheticRun', refusal: { kind: 'model' as const, code: 'synthetic', said: 'Synthetic words' }, at },
} satisfies Record<CastingCell, CastingStoredCell> & Omit<CastingImage, 'cells'>
// An image as migration 0189 wrote it: four cells, no mark, and a source without `copied`.
const oldImage = { program: { value: 'codex', from: { at, by: { kind: 'agent', id: other }, decision: null, moved: false } }, model: empty, effort: empty, why: empty }

describe('the request a run was given', () => {
  it('reads the actor and each agent that wrote a message as stamps, and blocks what the request does not have', async () => {
    expect(await stored('agent_runs.request', request(handle, `agent:${other}`))).toEqual({
      found: [
        found('request.actorId', handle, 'RunRequest.actorId', 'stamp'),
        found('request.messages[0].writtenBy', other, 'RunRequestMessage.writtenBy', 'encoded', 'part'),
      ],
      blocks: [],
    })
    expect(blocksOf(await stored('agent_runs.request', request(alias, `agent:${alias}`)))).toEqual([
      ['request.actorId', 'cannot-tell'], ['request.messages[0].writtenBy', 'cannot-tell'],
    ])
    expect(blocksOf(await stored('agent_runs.request', request('synthetic-nobody', 'no type here')))).toEqual([
      ['request.actorId', 'names-no-agent'], ['request.messages[0].writtenBy', 'wrong-type'],
    ])
    const odd = request(other, 'robot:SyntheticRobot')
    const reading = await stored('agent_runs.request', { ...odd, thread: { ...odd.thread, mode: 'meeting' }, messages: [{ ...odd.messages[0], agentId: alias }] })
    expect(reading.found).toEqual([found('request.actorId', other, 'RunRequest.actorId', 'stamp')])
    expect(blocksOf(reading)).toEqual([['request.thread.mode', 'wrong-type'], ['request.messages[0].writtenBy', 'wrong-type'], ['request.messages[0].agentId', 'undeclared-field']])
  })
})

describe('the office map', () => {
  it('reads each placed agent by its key, each team by its id and inside each group key', async () => {
    expect(await stored('office_map_layouts.data', map)).toEqual({
      found: [
        found('data.regions[1].groupKey', other, 'ForestRegion.groupKey', 'encoded', 'part'),
        found('data.regions[1].teamId', other, 'ForestRegion.teamId', 'registry-id'),
        found('data.assignments["archived-cobalt"]', alias, 'ForestMapState.assignments', 'map-key', 'key'),
        found('data.assignments["archived-cobalt"].groupKey', other, 'ForestAssignment.groupKey', 'encoded', 'part'),
        found('data.assignments.CanonicalB2', other, 'ForestMapState.assignments', 'map-key', 'key'),
      ],
      blocks: [],
    })
    const keyed = (groupKey: string) => stored('office_map_layouts.data', { assignments: { [other]: { ...map.assignments[other], groupKey } } })
    expect(blocksOf(await keyed(JSON.stringify(['default', 'team'])))).toEqual([['data.assignments.CanonicalB2.groupKey', 'wrong-type']])
    expect(blocksOf(await keyed(JSON.stringify(['default', 'garden', null])))).toEqual([['data.assignments.CanonicalB2.groupKey', 'wrong-type']])
    expect(blocksOf(await keyed('a team'))).toEqual([['data.assignments.CanonicalB2.groupKey', 'wrong-type']])
    expect((await keyed(JSON.stringify([null, 'visitor', null]))).blocks).toEqual([])
    expect(blocksOf(await stored('office_map_layouts.data', { ...map, regions: [{ ...map.regions[0], teamId: agentRef(alias) }] }))).toEqual([['data.regions[0].teamId', 'wrong-type']])
  })
})

describe('the pieces of a folder reading', () => {
  it('reads a piece\'s data by the kind it names, and blocks whoever decided it, which may be a person or an agent', async () => {
    expect(await stored('folder_readings.pieces', [piece()])).toEqual({ found: [found('pieces[0].data.sentBy.id', alias, 'message.sentBy', 'participant')], blocks: [] })
    const decided = await stored('folder_readings.pieces', [
      piece({ state: 'accepted', recordId: 'SyntheticRecord2', decidedAt: at, decidedBy: other, data: { body: 'Synthetic words', editedBeforeAccepting: true } }),
      piece({ state: 'rejected', decidedAt: at, decidedBy: null, rejectionUndo: { token: 'synthetic-token', atMs: 1, fingerprint: 'synthetic' }, lastRejectionUndo: { at, by: other } }),
    ])
    expect(decided.found).toEqual([found('pieces[1].data.sentBy.id', alias, 'message.sentBy', 'participant')])
    expect(blocksOf(decided)).toEqual([['pieces[0].decidedBy', 'cannot-tell'], ['pieces[1].lastRejectionUndo.by', 'cannot-tell']])
    const nothing = async (one: unknown) => {
      const reading = await stored('folder_readings.pieces', [one])
      expect(reading.found, JSON.stringify(one)).toEqual([])
      return blocksOf(reading)
    }
    expect(await nothing(piece({ kind: 'no_such_kind' }))).toEqual([['pieces[0].data', 'unknown-kind']])
    expect(await nothing(piece({ data: { notAField: agentRef(alias) } }))).toEqual([['pieces[0].data.notAField', 'undeclared-field']])
    expect(await nothing(piece({ data: { editedBeforeAccepting: 'yes' } }))).toEqual([['pieces[0].data.editedBeforeAccepting', 'wrong-type']])
    expect(await nothing({ ...piece({ data: {} }), state: 'pending' })).toEqual([['pieces[0].state', 'wrong-type']])
  })
})

describe('the inputs of a one-press request and of a signing item', () => {
  it('reads them by the act the row names, and blocks an act the office does not know', async () => {
    for (const site of ['one_press_requests.inputs', 'signing_package_items.inputs']) {
      expect(await stored(site, { panel: 'what-is-kept', setting: 'synthetic', value: 3 }, 'change-a-setting'), site).toEqual({ found: [], blocks: [] })
      expect(await stored(site, { request: 'SyntheticAsk', answer: 'grant' }, 'answer-an-ask-at-the-door'), site).toEqual({ found: [], blocks: [] })
      expect(await stored(site, { chapter: 'SyntheticChapter', rule: 'SyntheticRule', only: true }, 'mark-a-rule-only-for-this-office'), site).toEqual({ found: [], blocks: [] })
      expect(await stored(site, { changes: [{ door: 'synthetic.door', answer: 'ask-first' }] }, 'change-what-the-grant-carries'), site).toEqual({ found: [], blocks: [] })
      expect(blocksOf(await stored(site, { request: 'SyntheticAsk', answer: 'grant' }, 'change-a-setting')), site).toEqual([['inputs.request', 'undeclared-field'], ['inputs.answer', 'undeclared-field']])
      expect(blocksOf(await stored(site, { request: 'SyntheticAsk', answer: 'maybe' }, 'answer-an-ask-at-the-door')), site).toEqual([['inputs.answer', 'wrong-type']])
      expect(blocksOf(await stored(site, { chapter: 'x', rule: 'x', only: true, by: agentRef(alias) }, 'mark-a-rule-only-for-this-office')), site).toEqual([['inputs.by', 'undeclared-field']])
      expect(blocksOf(await stored(site, {}, 'no-such-act')), site).toEqual([['act', 'unknown-variant']])
    }
  })
})

describe('a casting image before and after a change', () => {
  it('reads the agent that wrote each cell as a stamp, beside its kind, in today\'s images and in the oldest', async () => {
    for (const site of ['casting_row_changes.before', 'casting_row_changes.after', 'casting_changes.before', 'casting_changes.after']) {
      const column = site.split('.')[1]!
      const reading = await stored(site, image)
      expect(reading.found, site).toEqual([found(`${column}.program.from.by.id`, handle, 'CastingWriter.id', 'stamp')])
      expect(blocksOf(reading), site).toEqual([[`${column}.why.from.by.id`, 'cannot-tell']])
      expect(await stored(site, JSON.parse(JSON.stringify(oldImage))), site).toEqual({ found: [found(`${column}.program.from.by.id`, other, 'CastingWriter.id', 'stamp')], blocks: [] })
    }
    const nothing = async (value: unknown) => {
      const reading = await stored('casting_row_changes.after', value)
      expect(reading.found, JSON.stringify(value)).toEqual([])
      return blocksOf(reading)
    }
    expect(await nothing({ program: { value: 'codex', from: { ...source('agent', other), by: { id: other } } } })).toEqual([['after.program.from.by.id', 'no-writer-kind']])
    expect(await nothing({ program: cell('codex', source('robot', other)) })).toEqual([['after.program.from.by.kind', 'wrong-type']])
    expect(await nothing({ colour: cell('blue', source('agent', other)) })).toEqual([['after.colour', 'undeclared-field']])
    expect(await nothing({ hold: { ...image.hold, refusal: { kind: 'weather', code: 'x', said: 'x' } } })).toEqual([['after.hold.refusal.kind', 'wrong-type']])
  })
})

describe('the census of the stores that are not records', () => {
  const STORES = ['agent_runs', 'office_map_layouts', 'folder_readings', 'one_press_requests', 'signing_package_items', 'casting_changes', 'casting_row_changes']
  // The tables the census reads after the three of records: the seven stores, then the one only a plain column puts in it.
  const READ = [...STORES, 'signing_packages']
  const tables = () => Object.fromEntries([...STORES, 'signing_packages', 'records', 'revisions', 'changes', 'registry_aliases'].map(table => [table, t.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]))
  it('reads every row of all seven, keeps each block with its table and row, and writes nothing', async () => {
    const db = t.client.sqlite
    const run = db.prepare('INSERT INTO agent_runs (id, thread_id, runtime, request, created_at) VALUES (?, ?, ?, ?, ?)')
    run.run('SyntheticRun1', 'SyntheticThread', 'codex', JSON.stringify(request(handle, `agent:${alias}`)), at)
    run.run('SyntheticRun2', 'SyntheticThread', 'codex', 'not json', at)
    db.prepare('INSERT INTO office_map_layouts (configuration_key, data, updated_at) VALUES (?, ?, ?)').run('synthetic-configuration', JSON.stringify(map), at)
    db.prepare('INSERT INTO folder_readings (id, workspace_id, owner_id, folder, read_by, pieces, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('SyntheticReading', 'default', owner, '/srv/synthetic', owner, JSON.stringify([piece()]), at, at)
    db.prepare('INSERT INTO one_press_requests (id, workspace_id, act, inputs, asked_by, shows, state, asked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('SyntheticPress', 'default', 'no-such-act', '{}', other, 'Synthetic words', 'waiting', at)
    db.prepare('INSERT INTO signing_packages (id, workspace_id, brought_by, for_agent, task, state, brought_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('SyntheticPackage', 'default', other, other, 'Synthetic task', 'waiting', at)
    db.prepare('INSERT INTO signing_package_items (id, package_id, position, act, inputs, why, shows, changes, undone, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run('SyntheticItem', 'SyntheticPackage', 0, 'answer-an-ask-at-the-door', JSON.stringify({ request: 'SyntheticAsk', answer: 'maybe' }), 'x', 'x', 'x', 'x', 'waiting')
    db.prepare('INSERT INTO casting_changes (role, at, by_kind, by_id, decisions, before, after) VALUES (?, ?, ?, ?, ?, ?, ?)').run('worker', at, 'human', owner, '[]', null, JSON.stringify(oldImage))
    db.prepare('INSERT INTO casting_row_changes (casting_id, role, what, at, by_kind, by_id, decisions, before, after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(1, 'worker', 'remove', at, 'human', owner, '[]', JSON.stringify(image), null)
    const count = (table: string) => (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n

    const before = tables()
    const { takeIdentityCensus } = await import('../src/server/lib/registry-aliases/census.ts')
    const census = takeIdentityCensus(db)
    expect(tables()).toEqual(before)

    const { IDENTITY_CENSUS_TABLES } = await import('../src/server/lib/registry-aliases/census.ts')
    expect(census.read).toEqual(Object.fromEntries(IDENTITY_CENSUS_TABLES.map(({ table }) => [table, count(table)])))
    for (const table of READ) expect(census.read[table], table).toBeGreaterThan(0)
    expect(census.positions).toMatchObject({
      'RunRequest.actorId': 1, 'ForestRegion.groupKey': 1, 'ForestRegion.teamId': 1, 'ForestMapState.assignments': 2, 'ForestAssignment.groupKey': 1,
      'CastingWriter.id': 2,
    })
    expect(census.aliases).toContainEqual({ table: 'office_map_layouts', row: 'synthetic-configuration', path: 'data.assignments["archived-cobalt"]', stored: alias, canonical })
    expect(census.aliases).toContainEqual({ table: 'folder_readings', row: 'SyntheticReading', path: 'pieces[0].data.sentBy.id', stored: alias, canonical })
    const blocks = census.blocks.filter(one => STORES.includes(one.table)).map(one => [one.table, one.row, one.path, one.reason])
    expect(blocks).toEqual([
      ['agent_runs', 'SyntheticRun1', 'request.messages[0].writtenBy', 'cannot-tell'],
      ['agent_runs', 'SyntheticRun2', 'request', 'not-json'],
      ['one_press_requests', 'SyntheticPress', 'act', 'unknown-variant'],
      ['signing_package_items', 'SyntheticItem', 'inputs.answer', 'wrong-type'],
      ['casting_row_changes', '1', 'before.why.from.by.id', 'cannot-tell'],
    ])
  })

  it('reads only the rows it is given, a change row by its record\'s kind wherever that record is, and refuses a list that leaves a table out', async () => {
    const db = t.client.sqlite
    const reading = db.prepare('INSERT INTO folder_readings (id, workspace_id, owner_id, folder, read_by, pieces, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    reading.run('SyntheticReading1', 'default', owner, '/srv/synthetic', owner, JSON.stringify([piece()]), at, at)
    reading.run('SyntheticReading2', 'default', owner, '/srv/synthetic', owner, JSON.stringify([piece()]), at, at)
    const actor = { type: 'human', id: owner } as const
    const run = t.api.createRecord({ kind: 'session', workspaceId: 'default', title: 'Synthetic run', origin: 'fixture', data: { state: 'running', runtime: 'codex' }, actor })
    t.api.writeTheWorkerRun(run.id, alias, {
      state: 'started', askedAt: at, askedBy: { who: agentRef(alias), session: 'SyntheticParent' }, handle: 'synthetic-worker',
      brief: { path: '/srv/synthetic/brief.md', sha256: '0'.repeat(64), bytes: 1 }, sandbox: { folder: '/srv/synthetic', instance: 'synthetic', container: 'synthetic' },
    }, actor)
    const change = (db.prepare("SELECT id FROM changes WHERE record_id = ? AND field LIKE 'data.workerRuns.%'").get(run.id) as { id: string }).id

    const { IDENTITY_CENSUS_TABLES, takeIdentityCensus } = await import('../src/server/lib/registry-aliases/census.ts')
    // The register's other tables come after these, and tests/registry-alias-classified-id-columns.test.ts pins them.
    expect(IDENTITY_CENSUS_TABLES.map(one => one.table).slice(0, 3)).toEqual(['records', 'revisions', 'changes'])
    expect(IDENTITY_CENSUS_TABLES.map(one => one.table)).toEqual(expect.arrayContaining(READ))
    const only = new Map(IDENTITY_CENSUS_TABLES.map(one => [one.table, new Set<string>()]))
    only.set('folder_readings', new Set(['SyntheticReading2']))
    only.set('changes', new Set([change]))
    const before = tables()
    const census = takeIdentityCensus(db, only)
    expect(tables()).toEqual(before)
    expect(census.read).toEqual({ ...Object.fromEntries(IDENTITY_CENSUS_TABLES.map(({ table }) => [table, 0])), changes: 1, folder_readings: 1 })
    expect(census.aliases).toEqual([
      { table: 'changes', row: change, path: `new_value:data.workerRuns.${canonical}.askedBy.who.id`, stored: alias, canonical },
      { table: 'folder_readings', row: 'SyntheticReading2', path: 'pieces[0].data.sentBy.id', stored: alias, canonical },
    ])
    expect(census.blocks).toEqual([])

    only.delete('casting_row_changes')
    expect(() => takeIdentityCensus(db, only)).toThrow(/casting_row_changes/)
  })
})

describe('the register of the stores that are not records', () => {
  it('declares each stamp as a string, beside the kind that gates it, and reads every column by a type that parses', async () => {
    const { IDENTITY_POSITIONS } = await register()
    const { ADAPTER_SHAPES, STORED_COLUMNS, typeOf } = await bags()
    const fieldOf = (site: string) => {
      const [owner, key] = site.split('.')
      const ofAKind = (KIND_SPECS as Record<string, { fields: FieldSpec[] } | undefined>)[owner!]?.fields
      return (ADAPTER_SHAPES.find(shape => shape.name === owner)?.fields ?? SHAPE_SPECS[owner!]?.fields ?? ofAKind)?.find(field => field.key === key)
    }
    const stamps = IDENTITY_POSITIONS.filter(entry => entry.parse === 'stamp')
    expect(stamps.map(entry => entry.site).sort()).toEqual([
      'BundleExporter.actorId', 'CastingWriter.id', 'CheckAlsoGivenBy.actorId', 'GoalConfirmation.pressed_by', 'NotebookEntry.writtenById', 'ProvedHolder.claimed',
      'ReportParts.by', 'RunRequest.actorId', 'SessionOpenedBy.id', 'ShortForm.by', 'TheCheckTheOfficeAskedFor.askedOf', 'decision.decided_by', 'goal.filed_by',
    ])
    for (const entry of stamps) {
      expect(typeOf(fieldOf(entry.site)!.type), entry.site).toEqual(typeOf('string'))
      if (entry.pair === undefined) continue
      const gate = typeOf(fieldOf(`${entry.site.split('.')[0]}.${entry.pair.field}`)!.type)
      expect(gate.kind === 'literals' && gate.values.includes(entry.pair.agent), entry.site).toBe(true)
    }
    // The old casting table's four from cells are read as the casting rows' eleven and a label's meaning are, and three
    // of an agent's columns and two of each ledger row by their writers' types.
    expect(Object.keys(STORED_COLUMNS).sort()).toEqual([
      'agent_runs.request', 'agents.card_chosen_by', 'agents.elevation', 'agents.reads_releases_from_the_check',
      'casting.effort_from', 'casting.model_from', 'casting.program_from', 'casting.why_from', 'casting_changes.after', 'casting_changes.before',
      'casting_label_changes.after', 'casting_label_changes.before', 'casting_labels.meaning_from', 'casting_row_changes.after', 'casting_row_changes.before',
      'casting_rows.cost_from', 'casting_rows.difficulty_from', 'casting_rows.effort_from', 'casting_rows.labels_from', 'casting_rows.model_from',
      'casting_rows.out_until_from', 'casting_rows.probability_from', 'casting_rows.program_from', 'casting_rows.quota_from', 'casting_rows.why_from',
      'casting_rows.work_group_from', 'changes.elevation', 'changes.proved_holder', 'folder_readings.pieces',
      'office_map_layouts.data', 'one_press_requests.inputs', 'people.agent_tags', 'revisions.elevation', 'revisions.proved_holder', 'signing_package_items.inputs',

    ])
    for (const [site, column] of Object.entries(STORED_COLUMNS)) {
      expect(column.writer.length, site).toBeGreaterThan(0)
      const types = column.reads === 'type' ? [column.type] : Object.values(column.types)
      for (const type of types) expect(() => typeOf(type), site).not.toThrow()
      if (column.reads === 'by-act') {
        expect(Object.keys(column.types).sort(), site).toEqual(['answer-an-ask-at-the-door', 'change-a-setting', 'change-what-the-grant-carries', 'mark-a-rule-only-for-this-office'])
      }
    }
  })
})
