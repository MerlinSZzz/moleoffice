// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE DECIDES WHEN ONLY HOUSE RULES ARE RED.
 * WHAT IS MEASURED: a real throwaway office, database, HOME and port apply the default block,
 * remind and off, independently of tool claims and the entry's own list. Landings keep red evidence,
 * file one problem per file, notify both holders once, and share deduplication with red-on-main.
 * MUTATIONS: trust tool facts; read the entry tip; always remind; match only the old problem title;
 * accept marked H; accept P; file at landing although off. Each makes its named refusal or count red. Control and
 * restore run the whole file. Fixtures begin at testing so unrelated release rules are not bypassed
 * in production and cannot hide a faulty tested or landing decision.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, afterEach, expect, it } from 'vitest'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { theMoveAStepMakes } from '../src/shared/merge-queue.ts'

let t: TestDb, app: FastifyInstance
let door: typeof import('../src/server/lib/merge-entry-door.ts')
let home: string
const made: string[] = []
const saved = { HOME: process.env.HOME, gate: process.env.MOLE_OFFICE_GATE_HOUSE_RULES, fix: process.env.MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND, sheriff: process.env.MOLE_OFFICE_BUILD_SHERIFF }
const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
let sheriff: string, secretary: string
const at = '2026-10-21 09:00:00'
const red = ['tests/wording.test.ts', 'tests/naming.test.ts']
const inventory = (klass = 'H', mark = '', files = red) => `export const HOUSE_RULES = {\n${files.map(file => `  '${file}': { class: '${klass}', kind: 'wording'${mark === '' ? '' : `, mark: '${mark}'`} },`).join('\n')}\n}`
function git(dir: string, ...args: string[]) { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'house-rule-office-')); made.push(home); process.env.HOME = home
  delete process.env.MOLE_OFFICE_GATE_HOUSE_RULES; delete process.env.MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND
  t = await freshDb(); app = (await apiApp()).app
  door = await import('../src/server/lib/merge-entry-door.ts')
  // The loopback listener takes an unused port chosen by the kernel, never the live office's port.
  await app.listen({ host: '127.0.0.1', port: 0 })
  for (const role of ['secretary', 'worker']) {
    const handle = `${role}-${home.split('/').at(-1)}`.toLowerCase()
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle, name: `Synthetic ${role}`, role, ...(role === 'worker' ? { workArea: ['tests'] } : {}) } })
    expect(r.statusCode, r.body).toBe(201)
    if (role === 'secretary') secretary = r.json().agent.id
    else { sheriff = r.json().agent.id; process.env.MOLE_OFFICE_BUILD_SHERIFF = handle }
  }
}, 60_000)
afterEach(() => { delete process.env.MOLE_OFFICE_GATE_HOUSE_RULES; delete process.env.MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND })
afterAll(async () => {
  await app?.close(); t?.close()
  for (const [key, value] of Object.entries({ HOME: saved.HOME, MOLE_OFFICE_GATE_HOUSE_RULES: saved.gate, MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND: saved.fix, MOLE_OFFICE_BUILD_SHERIFF: saved.sheriff })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value
  }
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})
function ready(text: string | null = inventory(), ownList?: string) {
  const dir = mkdtempSync(join(home, 'tree-'))
  git(dir, 'init', '-q', '-b', 'main'); git(dir, 'config', 'user.name', 'Synthetic fixture'); git(dir, 'config', 'user.email', 'fixture@example.invalid')
  mkdirSync(join(dir, 'tests')); writeFileSync(join(dir, 'baseline'), 'baseline')
  if (text !== null) writeFileSync(join(dir, 'tests/house-rules.mjs'), text)
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'Synthetic main')
  const mainAt = git(dir, 'rev-parse', 'HEAD')
  git(dir, 'switch', '-q', '-c', 'work')
  writeFileSync(join(dir, 'tests/entry.test.ts'), 'entry'); if (ownList !== undefined) writeFileSync(join(dir, 'tests/house-rules.mjs'), ownList)
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'Synthetic entry')
  const tip = git(dir, 'rev-parse', 'HEAD')
  const run = t.api.createRecord({ kind: 'session', title: 'Synthetic house rule run', workspaceId: 'default', origin: 'fixture', actor: person, data: { state: 'running', servingAgent: sheriff, workingDirectory: dir, cutFrom: 'main', submission: { kind: 'git' } } }).id
  t.api.patchRecord(run, { dataPatch: { state: 'finished' } }, person)
  const seal = t.api.getRecord(run)!.data.sealedTip as string
  const sealHash = (t.api.getRecord(seal)!.data.seal as { hash: string }).hash
  const id = door.asTheMergeQueue(() => t.api.createRecord({ kind: 'merge_entry', title: 'Synthetic house rule entry', workspaceId: 'default', origin: 'fixture', actor: person, data: {
    state: 'testing', run, seal: { id: seal, hash: sealHash }, submittedBy: { kind: 'person', id: person.id }, occupies: dir,
    changeset: { adapter: 'git', root: dir, repository: dir, branch: 'main', commit: tip, base: mainAt },
    integration: { mainAt, result: tip, clone: dir, files: {}, at }, judged: {}, reinspected: [],
    verdict: { run, by: { kind: 'person', id: person.id }, at, how: 'Synthetic released fixture', message: null },
  } })).id
  return { id, run, tip, mainAt, dir }
}
async function step(one: ReturnType<typeof ready>, step: string, facts: Record<string, unknown>) {
  const machine = await import('../src/server/lib/merge-state-machine.ts')
  return machine.stepAMergeEntry({ id: one.id, workspaceId: 'default', step: step as Parameters<typeof machine.stepAMergeEntry>[0]['step'], facts, actor: person })
}
const tested = (one: ReturnType<typeof ready>, more = {}) => step(one, 'tested', { green: false, tip: one.tip, log: '/synthetic/red.log', redTests: red, ...more })
const problems = () => t.api.listRecords({ workspaceId: 'default', kind: 'problem' })
const notices = (run: string) => t.api.listRecords({ workspaceId: 'default', kind: 'message' }).filter(one => one.data.aboutRun === run && one.data.notice === 'redOnMain')
async function land(one: ReturnType<typeof ready>) {
  await step(one, 'landing', { mainAt: one.mainAt })
  return step(one, 'landed', { mainAfter: one.tip })
}
it('blocks class one by default', async () => {
  const result = await tested(ready())
  expect(result.entry.state).toBe('bounced'); expect(result.entry.machine?.['bounced']).toMatchObject({ reason: 'red', redTests: red })
  expect(result.decided).toContain('block')
})
it('bounces an unreported or wrong tested tip rather than filling it in', async () => {
  process.env.MOLE_OFFICE_GATE_HOUSE_RULES = 'remind'
  for (const tip of [undefined, 'unreported-tree']) {
    const one = ready()
    const result = await tested(one, { tip })
    expect(result.entry.state).toBe('bounced')
    expect(result.decided).toContain('tested tip')
    expect(result.entry.machine?.['tested']).toBeUndefined()
  }
})
it('at remind stays for the new reason, lands red, tells both holders and a later entry files nothing new', async () => {
  process.env.MOLE_OFFICE_GATE_HOUSE_RULES = 'remind'
  const one = ready(), before = problems().length
  const result = await tested(one)
  expect(result.entry.state).toBe('testing')
  expect(theMoveAStepMakes('testing', { step: 'tested', green: false, onlyHouseRulesRed: true })).toEqual({ move: 'stays', because: 'only-house-rules-red' })
  expect(result.entry.machine?.['tested']).toMatchObject({ green: false, houseRules: { class: 1, mainAt: one.mainAt, position: 'remind', files: red.map(file => ({ file, class: 'H' })) } })
  const landed = await land(one)
  expect(landed.entry.state).toBe('merged')
  expect(landed.entry.machine?.['integrated']).toMatchObject({ tests: { green: false, houseRules: { class: 1, mainAt: one.mainAt } } })
  const fresh = problems().slice(before)
  expect(fresh).toHaveLength(2)
  for (const p of fresh) { expect(p.data.symptom).toContain(one.id); expect(p.data.symptom).toContain('plain house rule'); expect(p.data.symptom).toContain('remind'); expect(p.title).not.toContain("no merge entry's") }
  expect(notices(one.run)).toHaveLength(2)
  expect(notices(one.run).flatMap(m => m.data.to)).toEqual(expect.arrayContaining([{ kind: 'agent', id: sheriff }, { kind: 'agent', id: secretary }]))
  const next = ready()
  const heard = await step(next, 'red-on-main', { mainAt: one.tip, files: red.map(file => ({ file })) })
  expect(problems()).toHaveLength(before + 2); expect(notices(next.run)).toHaveLength(0); expect(heard.decided).toContain('nothing was filed')
  // The other caller shares the same check too.
  await tested(next); const again = await land(next)
  expect(problems()).toHaveLength(before + 2); expect(again.decided).toContain('nothing was filed')
})
// The two off cases name red files no earlier case filed, because a filed file is never filed again and would hide a filing.
it('at off lands red without filing anything', async () => {
  process.env.MOLE_OFFICE_GATE_HOUSE_RULES = 'off'
  const quiet = ['tests/off-at-testing.test.ts']
  const one = ready(inventory('H', '', quiet)), before = problems().length
  expect((await tested(one, { redTests: quiet })).entry.state).toBe('testing')
  expect((await land(one)).entry.state).toBe('merged'); expect(problems()).toHaveLength(before); expect(notices(one.run)).toHaveLength(0)
})
it('rejects a tool claiming H for files absent from main', async () => {
  process.env.MOLE_OFFICE_GATE_HOUSE_RULES = 'remind'
  const one = ready('export const HOUSE_RULES = {\n}')
  const result = await tested(one, { houseRules: { mainAt: one.mainAt, list: { state: 'read' }, files: red.map(file => ({ file, class: 'H', kind: 'wording' })), class: 1, reason: 'Only plain house rules are red.' } })
  expect(result.entry.state).toBe('bounced'); expect(result.decided).toContain('differs'); expect(result.decided).toContain('feature test')
})
it('rejects the entry own list when main does not name its red files', async () => {
  process.env.MOLE_OFFICE_GATE_HOUSE_RULES = 'remind'
  expect((await tested(ready('export const HOUSE_RULES = {\n}', inventory()))).entry.state).toBe('bounced')
})
for (const [klass, mark] of [['P', ''], ['H', 'borderline']]) {
  it(`rejects ${klass} ${mark} at remind`, async () => {
    process.env.MOLE_OFFICE_GATE_HOUSE_RULES = 'remind'
    expect((await tested(ready(inventory(klass, mark)))).entry.state).toBe('bounced')
  })
}
it('refuses a new landing at block but finishes a landing already authorized', async () => {
  process.env.MOLE_OFFICE_GATE_HOUSE_RULES = 'remind'
  const one = ready(); await tested(one)
  process.env.MOLE_OFFICE_GATE_HOUSE_RULES = 'block'
  await expect(step(one, 'landing', { mainAt: one.mainAt })).rejects.toThrow('MOLE_OFFICE_GATE_HOUSE_RULES is now at block')
  process.env.MOLE_OFFICE_GATE_HOUSE_RULES = 'remind'; await step(one, 'landing', { mainAt: one.mainAt })
  process.env.MOLE_OFFICE_GATE_HOUSE_RULES = 'block'
  expect((await step(one, 'landed', { mainAfter: one.tip })).entry.state).toBe('merged')
})
it('reads off again at landing and does not file a reminder then', async () => {
  process.env.MOLE_OFFICE_GATE_HOUSE_RULES = 'remind'
  const quiet = ['tests/off-at-landing.test.ts']
  const one = ready(inventory('H', '', quiet)); await tested(one, { redTests: quiet }); const before = problems().length
  process.env.MOLE_OFFICE_GATE_HOUSE_RULES = 'off'
  expect((await land(one)).decided).toContain('House-rule reminders are off; nothing was filed.')
  expect(problems()).toHaveLength(before); expect(notices(one.run)).toHaveLength(0)
})
it('bounces when main inventory is unreadable or absent', async () => {
  process.env.MOLE_OFFICE_GATE_HOUSE_RULES = 'remind'
  const malformed = await tested(ready("export const HOUSE_RULES = {\n bad line\n}"))
  expect(malformed.entry.state).toBe('bounced'); expect(malformed.decided).toContain('could not read')
  const absent = await tested(ready(null))
  expect(absent.entry.state).toBe('bounced')
  expect(absent.decided).toContain("The office could not read main's house-rule list: the list is absent.")
})
it('leaves fix-round admission and green priority unchanged', async () => {
  process.env.MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND = '1'
  const one = ready(null), tip = one.tip, tree = git(one.dir, 'rev-parse', 'HEAD^{tree}')
  const common = { source: 'original', tip, tree, log: '/synthetic/original.log' }
  const result = await tested(one, { wholeSuiteRed: {
    outcome: 'admitted-for-fix-round', build: { ...common, exit: 0 },
    affected: { ...common, selection: 'complete', exit: 0, files: ['tests/affected.test.ts'], ran: 1, passed: 1, report: '/synthetic/affected.json' },
    suite: { ...common, complete: true, exit: 1, ran: 3, passed: 1, redTests: red, report: '/synthetic/suite.json' },
  } })
  expect(result.entry.state).toBe('testing'); expect(result.decided).toContain('admitted for a fix round')
  expect(result.entry.machine?.['tested']).not.toHaveProperty('houseRules')
  expect((await land(one)).entry.state).toBe('merged')
  expect(theMoveAStepMakes('testing', { step: 'tested', green: true, onlyHouseRulesRed: true, admittedForFixRound: true })).toEqual({ move: 'stays', because: 'green' })
})

it('counts each tested class one once in every position, while landing, completion and a wrong tested tip count nothing', async () => {
  const counts = () => (t.client.sqlite.prepare("SELECT would_stop, stopped, reminded FROM gate_counts WHERE gate = 'house-rule-reds'").get() as {would_stop: number; stopped: number; reminded: number} | undefined) ?? {would_stop: 0, stopped: 0, reminded: 0}
  for (const position of ['block', 'remind', 'off']) {
    process.env.MOLE_OFFICE_GATE_HOUSE_RULES = position
    const before = counts(), one = ready()
    const result = await tested(one)
    expect(result.entry.state).toBe(position === 'block' ? 'bounced' : 'testing')
    const expected = {would_stop: before.would_stop + 1, stopped: before.stopped + (position === 'block' ? 1 : 0), reminded: before.reminded + (position === 'remind' ? 1 : 0)}
    expect(counts()).toEqual(expected)
    if (position !== 'block') await land(one)
    expect(counts()).toEqual(expected)
    const wrongTip = ready()
    await tested(wrongTip, {tip: 'made-up-wrong-tested-tip'})
    expect(counts()).toEqual(expected)
  }
})
