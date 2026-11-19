// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Every record, plan, checklist and reason here is made up in a fresh test office. */
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { AGENT, apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { theWordAPageDraws } from './words-waiting-for-translation.ts'
import { SETTING_WORDS } from '../src/config/word-sources.mjs'

// THE OFFICE'S OWN CHECKS GET THEIR SWITCH ROWS (wave 13r round N, item 10c of briefs/REQUIREMENTS.md;
// uuH_OcQ4oI6-). Five block rows from round H's table and the whole suite's seats as a number row. A block row offers
// block and off, and starts at block in both kinds of office, which is what the office did before the row. Each guard
// reads its row once, where it would refuse: at block it refuses as before and counts the encounter as stopped, and at
// off the write goes on and the encounter is still counted.
interface DeclaredGate { id: string; class: string; group: string; setting: string; positions: {kind: string; allowed?: string[]; fewest?: number; most?: number}; whoMayChange: string; defaults: {buildsMoleOffice: string; ordinary: string}; countedBy: string; looksAgain: string | null }
interface GateList { GATES: DeclaredGate[]; GATE_GROUPS: {class: string; group: string}[] }
async function list(): Promise<GateList> { const path = '../src/config/gates.mjs'; return import(path) }
const AS_OWNER = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
let t: TestDb, app: FastifyInstance
beforeEach(async () => { t = await freshDb(); app = (await apiApp()).app; await app.ready() })
afterEach(async () => { await app.close(); t.close() })

function save(name: string, value: string | null) {
  return app.inject({ method: 'POST', url: '/api/office/settings', headers: AS_OWNER, payload: {changes: [{name, value}], because: 'Made-up reason for a gate'} })
}
async function turnOff(setting: string) { const saved = await save(setting, 'off'); expect(saved.statusCode, saved.body).toBe(200) }
/** The gate's row of counts, read past every door. */
function counted(gate: string) {
  return t.client.sqlite.prepare('SELECT would_stop, stopped, reminded FROM gate_counts WHERE gate = ?').get(gate) as {would_stop: number; stopped: number; reminded: number} | undefined
}
function send(method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, payload?: Record<string, unknown>): Promise<LightMyRequestResponse> {
  return app.inject({ method, url, headers: AS_OWNER, ...(payload === undefined ? {} : { payload }) })
}
async function versionOf(id: string): Promise<string> {
  const read = await send('GET', `/api/records/${id}`)
  expect(read.statusCode, read.body).toBe(200)
  return String(read.json().version)
}
/** A made-up module whose checklist has one part of two lines. */
function aModule(): string {
  return t.api.createRecord({ workspaceId: 'default', kind: 'module', title: 'Made-up module for the office checks', actor: AGENT, data: {
    context: 'A made-up module.', summary: 'Made up.',
    parts: [{ id: 'made-up-part', name: 'Made-up part', items: [{ id: 'line-1', text: 'Made-up first line', state: 'todo' }, { id: 'line-2', text: 'Made-up second line', state: 'todo' }] }],
  } }).id
}

const BLOCK_ROWS = [
  ['giving-back-a-held-seat', 'process', 'switches', 'the-person'],
  ['writes-that-empty-fields', 'quality', 'the-offices-own-checks', 'the-person'],
  ['writes-from-a-stale-copy', 'quality', 'the-offices-own-checks', 'the-person'],
  ['writes-over-unseen-checklist-lines', 'quality', 'the-offices-own-checks', 'the-person'],
  ['worker-cuts-the-sandbox-cannot-use', 'quality', 'the-offices-own-checks', 'the-person-or-a-secretary'],
] as const
/** A row's setting, read from the gate list, so no setting's name is written here a second time. */
async function settingOf(id: string): Promise<string> {
  const row = (await list()).GATES.find(one => one.id === id)
  expect(row, id).toBeDefined()
  return row!.setting
}
/** A word the page draws in English, which must be there and say something. */
function aSentence(key: string): string {
  const word = theWordAPageDraws('en', key)
  expect(typeof word === 'string' && word.trim() !== '', key).toBe(true)
  return word!
}

// Mutation: give a row remind, start one at off, put a row in another group or class, let a secretary change one of the
// four that only the person may change, put the whole suite's seats anywhere but after the browser test seats, or give a
// row's page words other than its setting's words.
it('declares the five office checks as block rows and the whole suite\'s seats as a number row, each with its words', async () => {
  const {GATES, GATE_GROUPS} = await list()
  // Each row's words on the page are its setting's words, one sentence kept in one place.
  for (const [id, kind, group, whoMayChange] of BLOCK_ROWS) {
    const row = GATES.find(one => one.id === id)
    expect(row, id).toEqual({id, class: kind, group, setting: row?.setting, positions: {kind: 'block-remind-off', allowed: ['block', 'off']}, whoMayChange, defaults: {buildsMoleOffice: 'block', ordinary: 'block'}, countedBy: 'the-server', looksAgain: null})
    const words = (SETTING_WORDS as Record<string, string | undefined>)[row!.setting]
    expect(aSentence(`gates.row.${id}`), id).toBe(words)
    expect(aSentence(`settingsWords.${row!.setting}`), id).toBe(words)
  }
  const seats = GATES.find(one => one.id === 'whole-suite-seats')
  expect(seats).toMatchObject({class: 'process', group: 'numbers', positions: {kind: 'number', fewest: 1}, whoMayChange: 'the-person', defaults: {buildsMoleOffice: '1', ordinary: '1'}, countedBy: 'the-server', looksAgain: null})
  expect(GATES.findIndex(one => one.id === 'whole-suite-seats')).toBe(GATES.findIndex(one => one.id === 'browser-test-seats') + 1)
  aSentence('gates.row.whole-suite-seats')
  expect(aSentence(`settingsWords.${seats!.setting}`)).toBe((SETTING_WORDS as Record<string, string | undefined>)[seats!.setting])
  // The new group sits in the quality class after its merge queue group, and has its heading. Main's stable version
  // group (13q) stands between them, so the case asks for after and not for right after.
  const at = GATE_GROUPS.findIndex(one => one.class === 'quality' && one.group === 'the-merge-queue')
  const own = GATE_GROUPS.findIndex(one => one.class === 'quality' && one.group === 'the-offices-own-checks')
  expect(own).toBeGreaterThan(at)
  expect(GATE_GROUPS.slice(at, own + 1).map(one => one.class)).toEqual(GATE_GROUPS.slice(at, own + 1).map(() => 'quality'))
  aSentence('gates.group.the-offices-own-checks')
  // The settings door takes off and block for each block row, and refuses remind, naming the setting and keeping nothing.
  for (const [id] of BLOCK_ROWS) {
    const setting = await settingOf(id)
    const refused = await save(setting, 'remind')
    expect(refused.statusCode, `${id}: ${refused.body}`).toBe(400)
    expect(refused.json().error, id).toContain(setting)
    expect(t.client.sqlite.prepare('SELECT value FROM runtime_settings WHERE name = ?').get(setting), id).toBeUndefined()
    for (const value of ['off', 'block']) { const saved = await save(setting, value); expect(saved.statusCode, `${id} ${value}: ${saved.body}`).toBe(200) }
  }
})

// Mutation: at off, refuse the write as before; at block, let it through; count nothing, count it twice, or count it as
// stopped at off; or count a write that sends replace and so empties nothing it did not mean to.
it('refuses a whole-data write that would empty fields at block and counts it, and at off writes it, names the fields and counts it', async () => {
  const id = aModule()
  const wholeData = async () => ({ data: { context: 'A made-up module, written whole.' }, ifVersion: await versionOf(id) })
  const refused = await send('PATCH', `/api/records/${id}`, await wholeData())
  expect(refused.statusCode, refused.body).toBe(400)
  expect(refused.json().code).toBe('recordFieldsWouldBeEmptied')
  expect(t.api.getRecord(id)!.data).toHaveProperty('summary', 'Made up.')
  expect(counted('writes-that-empty-fields')).toEqual({would_stop: 1, stopped: 1, reminded: 0})
  // A write that says it means to replace the whole data passes the gate, and is not counted.
  const meant = await send('PATCH', `/api/records/${id}`, { data: { context: 'A made-up module.', summary: 'Made up.', parts: [] }, replace: true, ifVersion: await versionOf(id) })
  expect(meant.statusCode, meant.body).toBe(200)
  expect(counted('writes-that-empty-fields')).toEqual({would_stop: 1, stopped: 1, reminded: 0})
  await turnOff(await settingOf('writes-that-empty-fields'))
  const written = await send('PATCH', `/api/records/${id}`, await wholeData())
  expect(written.statusCode, written.body).toBe(200)
  expect([...written.json().emptied as string[]].sort()).toEqual(['parts', 'summary'])
  expect(t.api.getRecord(id)!.data).toEqual({ context: 'A made-up module, written whole.' })
  expect(counted('writes-that-empty-fields')).toEqual({would_stop: 2, stopped: 1, reminded: 0})
})

// A value the row does not allow was put in past the settings door. The guard cannot read it, so the write fails and
// nothing is written; no position is guessed in its place.
// Mutation: read an unknown position as block, or as off.
it('fails a write whose gate holds a position its row does not allow, and writes nothing', async () => {
  const id = aModule()
  t.client.sqlite.prepare('INSERT INTO runtime_settings (name, value) VALUES (?, ?)').run(await settingOf('writes-that-empty-fields'), 'remind')
  const failed = await send('PATCH', `/api/records/${id}`, { data: { context: 'A made-up module, written whole.' }, ifVersion: await versionOf(id) })
  expect(failed.statusCode, failed.body).toBe(500)
  expect(t.api.getRecord(id)!.data).toHaveProperty('summary', 'Made up.')
  expect(counted('writes-that-empty-fields')).toBeUndefined()
})

// THE DOORS THAT TAKE A VERSION: a record's patch, a module's new part, one checklist line of a record, a plan, a
// checklist's line and its title, a flow's stage and its facts, and one's own notice rules, saved or put back. Each write
// below names a version somebody has written past. The flow and notice-rule doors joined in round O, after the check of
// round N found them refusing at off (inspector, jmggX746aV7s).
// Mutation: at off, refuse any one of them as before; at block, let one through; or count one door twice or not at all.
it('refuses a write from a stale copy at every door that takes a version at block and counts each once, and at off writes each and counts it', async () => {
  const id = aModule()
  const stale = await versionOf(id)
  expect((await send('PATCH', `/api/records/${id}`, { dataPatch: { summary: 'Made up, written first.' }, ifVersion: stale })).statusCode).toBe(200)
  const plan = await send('POST', '/api/plans', { title: 'Made-up week', body: '- one made-up line' })
  expect(plan.statusCode, plan.body).toBe(201)
  const planPath = `/api/plans/${String(plan.json().plan.id)}`
  const planStale = String((await send('GET', planPath)).json().version)
  expect((await send('PATCH', planPath, { title: 'Made-up week, renamed first', ifVersion: planStale })).statusCode).toBe(200)
  const made = await send('POST', '/api/checklists', { title: 'Made-up checklist', items: [{ words: 'Made-up item one' }, { words: 'Made-up item two' }] })
  expect(made.statusCode, made.body).toBe(201)
  const checklist = made.json().checklist as { id: string; items: { id: string }[] }
  const [one, two] = checklist.items
  const listStale = String((await send('GET', `/api/checklists/${checklist.id}`)).json().checklist.version)
  expect((await send('PATCH', `/api/checklists/${checklist.id}/items/${one!.id}`, { state: 'in progress', ifVersion: listStale })).statusCode).toBe(200)
  const source = t.api.createRecord({ workspaceId: 'default', kind: 'report', title: 'Made-up source of a flow', actor: AGENT, data: { blocks: [] } }).id
  const madeFlow = await send('POST', '/api/flows', {
    project: 'default', title: 'Made-up flow', runsBy: 'a made-up runner', trigger: 'A made-up kettle is ready.', leavesBehind: 'a made-up served kettle',
    declaredIn: 'tools/made-up-kettle.mjs', stages: [1, 2].map(k => ({ does: `Made-up stage ${String(k)}.`, why: `Made-up why ${String(k)}.`, sources: [source] })),
  })
  expect(madeFlow.statusCode, madeFlow.body).toBe(201)
  const flowPath = `/api/flows/${String(madeFlow.json().flow)}`
  const flowStale = String((await send('GET', flowPath)).json().version)
  expect((await send('PATCH', flowPath, { trigger: 'A made-up kettle is ready, said first.', ifVersion: flowStale })).statusCode).toBe(200)
  const rules = (mutedKinds: string[], because: string, ifVersion: string | null) => send('PUT', '/api/messages/notice-rules', { mutedKinds, because, ifVersion })
  const firstRules = await rules([], 'Made-up first choice', null)
  expect(firstRules.statusCode, firstRules.body).toBe(200)
  const rulesStale = String(firstRules.json().version)
  expect((await rules(['theBroadcastIsDue'], 'Made-up second choice', rulesStale)).statusCode).toBe(200)
  const writes = (): [string, () => Promise<LightMyRequestResponse>][] => [
    ['a record\'s patch', () => send('PATCH', `/api/records/${id}`, { dataPatch: { summary: 'Made up, from a stale copy.' }, ifVersion: stale })],
    ['a module\'s new part', () => send('POST', `/api/records/${id}/parts`, { id: 'made-up-new-part', name: 'Made-up new part', ifVersion: stale })],
    ['one checklist line of a record', () => send('PATCH', `/api/records/${id}/checklist/line-1`, { state: 'done', ifVersion: stale })],
    ['a plan', () => send('PATCH', planPath, { title: 'Made-up week, from a stale copy', ifVersion: planStale })],
    ['a checklist\'s line', () => send('PATCH', `/api/checklists/${checklist.id}/items/${two!.id}`, { state: 'in progress', ifVersion: listStale })],
    ['a checklist\'s title', () => send('PATCH', `/api/checklists/${checklist.id}`, { title: 'Made-up checklist, from a stale copy', ifVersion: listStale })],
    ['a flow\'s stage', () => send('PATCH', `${flowPath}/stages/1`, { does: 'Made-up stage 1, from a stale copy.', why: 'Made-up why 1.', sources: [source], cause: source, ifVersion: flowStale })],
    ['a flow\'s facts', () => send('PATCH', flowPath, { trigger: 'A made-up kettle is ready, from a stale copy.', ifVersion: flowStale })],
    ['one\'s notice rules', () => rules(['theBroadcastIsDue'], 'Made-up choice from a stale copy', rulesStale)],
    ['one\'s notice rules put back', () => send('POST', '/api/messages/notice-rules/restore', { seq: 1, because: 'Made-up restore from a stale copy', ifVersion: rulesStale })],
  ]
  const doors = writes().length
  let n = 0
  for (const [door, write] of writes()) {
    const refused = await write()
    expect(refused.statusCode, `${door}: ${refused.body}`).toBe(409)
    n++
    expect(counted('writes-from-a-stale-copy'), door).toEqual({would_stop: n, stopped: n, reminded: 0})
  }
  expect(t.api.getRecord(id)!.data).toMatchObject({ summary: 'Made up, written first.' })
  expect((await send('GET', flowPath)).json()).toMatchObject({ trigger: 'A made-up kettle is ready, said first.' })
  expect((await send('GET', '/api/messages/notice-rules')).json()).toMatchObject({ mutedKinds: ['theBroadcastIsDue'], because: 'Made-up second choice' })
  await turnOff(await settingOf('writes-from-a-stale-copy'))
  for (const [door, write] of writes()) {
    const written = await write()
    expect(written.statusCode, `${door}: ${written.body}`).toBeLessThan(300)
    n++
    expect(counted('writes-from-a-stale-copy'), door).toEqual({would_stop: n, stopped: doors, reminded: 0})
  }
  const data = t.api.getRecord(id)!.data as { summary: string; parts: { id: string; items: { id: string; state: string }[] }[] }
  expect(data.summary).toBe('Made up, from a stale copy.')
  expect(data.parts.map(part => part.id)).toEqual(['made-up-part', 'made-up-new-part'])
  expect(data.parts[0]!.items.find(item => item.id === 'line-1')!.state).toBe('done')
  expect((await send('GET', planPath)).json().plan.title).toBe('Made-up week, from a stale copy')
  const after = (await send('GET', `/api/checklists/${checklist.id}`)).json().checklist as { title: string; items: { id: string; state: string }[] }
  expect(after.title).toBe('Made-up checklist, from a stale copy')
  expect(after.items.find(item => item.id === two!.id)!.state).toBe('in progress')
  const flowAfter = (await send('GET', flowPath)).json() as { trigger: string; stages: { does: string }[] }
  expect(flowAfter.trigger).toBe('A made-up kettle is ready, from a stale copy.')
  expect(flowAfter.stages[0]!.does).toBe('Made-up stage 1, from a stale copy.')
  // The stale save and the stale put-back each wrote a version: the first choice is back, with four versions kept.
  const rulesAfter = (await send('GET', '/api/messages/notice-rules')).json() as { mutedKinds: string[]; because: string; history: unknown[] }
  expect(rulesAfter).toMatchObject({ mutedKinds: [], because: 'Made-up restore from a stale copy' })
  expect(rulesAfter.history).toHaveLength(4)
})

// Mutation: at off, refuse a drop or a rewrite as before; at block, let one through; count a write that both drops and
// rewrites twice; or count a write that names the version it read, which passes the gate.
it('refuses a module write that drops or rewrites unseen checklist lines at block and counts it, and at off writes it and counts it once', async () => {
  const id = aModule()
  const part = (items: {id: string; text: string; state: string}[]) => ({ dataPatch: { parts: [{ id: 'made-up-part', name: 'Made-up part', items }] } })
  const first = { id: 'line-1', text: 'Made-up first line', state: 'todo' }
  const rewritten = { id: 'line-1', text: 'Made-up first line, rewritten', state: 'todo' }
  const second = { id: 'line-2', text: 'Made-up second line', state: 'todo' }
  const linesNow = () => (t.api.getRecord(id)!.data as { parts: { items: unknown[] }[] }).parts[0]!.items
  const rewrite = await send('PATCH', `/api/records/${id}`, part([rewritten, second]))
  expect(rewrite.statusCode, rewrite.body).toBe(400)
  const drop = await send('PATCH', `/api/records/${id}`, part([first]))
  expect(drop.statusCode, drop.body).toBe(400)
  expect(linesNow()).toEqual([first, second])
  expect(counted('writes-over-unseen-checklist-lines')).toEqual({would_stop: 2, stopped: 2, reminded: 0})
  await turnOff(await settingOf('writes-over-unseen-checklist-lines'))
  const rewrote = await send('PATCH', `/api/records/${id}`, part([rewritten, second]))
  expect(rewrote.statusCode, rewrote.body).toBe(200)
  expect(counted('writes-over-unseen-checklist-lines')).toEqual({would_stop: 3, stopped: 2, reminded: 0})
  // One write that drops a line and rewrites another is one encounter.
  const both = await send('PATCH', `/api/records/${id}`, part([{ ...second, text: 'Made-up second line, rewritten' }]))
  expect(both.statusCode, both.body).toBe(200)
  expect(counted('writes-over-unseen-checklist-lines')).toEqual({would_stop: 4, stopped: 2, reminded: 0})
  expect(linesNow()).toEqual([{ id: 'line-2', text: 'Made-up second line, rewritten', state: 'todo' }])
  // A write that names the version it read passes the gate, and is not counted.
  const read = await send('PATCH', `/api/records/${id}`, { ...part([]), ifVersion: await versionOf(id) })
  expect(read.statusCode, read.body).toBe(200)
  expect(counted('writes-over-unseen-checklist-lines')).toEqual({would_stop: 4, stopped: 2, reminded: 0})
})
