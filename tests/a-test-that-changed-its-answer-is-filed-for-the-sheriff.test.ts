// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A real throwaway office records changed test answers: at off and remind the list changes no verdict, and
 * at block it bounces the entry as red, even a green run, without filing anything.
 * Synthetic git trees, runs and observations exercise strict facts, refusals, both problem families,
 * open/fixed deduplication, default off, remind, block's bounce and the two holders' distinct notice.
 * Mutations: file at off, file at block, read block as remind, read remind as block, remove the flaky line
 * in the move table, move it after green, leave the flaky files out of redTests, keep the 422 for a green
 * run at block, keep a pair's green:true at block, remove either family's match, file before refusal,
 * hold fixed problems, borrow redOnMain's notice, default remind, turn a changed answer into red,
 * bound the list below redTests, or count nothing at block.
 * A red run's failure lines, sent on an item, are kept in the problem's extra and said in its symptom: what was kept,
 * a cut to the bound, the blocks left out, a log with no FAIL line, and a log that could not be read. An item with no
 * lines keeps the symptom it had. Mutations for those are named above each of the last three cases.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, afterEach, expect, it } from 'vitest'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { theMoveAStepMakes } from '../src/shared/merge-queue.ts'
import { sayInEnglish, type WordKey, type WordValues } from '../src/shared/i18n.ts'

let t: TestDb, app: FastifyInstance
let door: typeof import('../src/server/lib/merge-entry-door.ts')
let home: string
const made: string[] = []
const fixtureMessages = new Set<string>()
const saved = { HOME: process.env.HOME, gate: process.env.MOLE_OFFICE_GATE_HOUSE_RULES, flaky: process.env.MOLE_OFFICE_GATE_FLAKY, fix: process.env.MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND, sheriff: process.env.MOLE_OFFICE_BUILD_SHERIFF, feature: process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS }
const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
let sheriff: string, secretary: string, sheriffHandle: string
const at = '2026-10-21 09:00:00'
const red = ['tests/wording.test.ts', 'tests/naming.test.ts']
const inventory = (klass = 'H', mark = '', files = red) => `export const HOUSE_RULES = {\n${files.map(file => `  '${file}': { class: '${klass}', kind: 'wording'${mark === '' ? '' : `, mark: '${mark}'`} },`).join('\n')}\n}`
function git(dir: string, ...args: string[]) { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'changed-answer-office-')); made.push(home); process.env.HOME = home
  delete process.env.MOLE_OFFICE_GATE_FLAKY; delete process.env.MOLE_OFFICE_GATE_HOUSE_RULES; delete process.env.MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND
  t = await freshDb(); app = (await apiApp()).app
  door = await import('../src/server/lib/merge-entry-door.ts')
  // The loopback listener takes an unused port chosen by the kernel, never the live office's port.
  await app.listen({ host: '127.0.0.1', port: 0 })
  for (const role of ['secretary', 'worker']) {
    const handle = `${role}-${home.split('/').at(-1)}`.toLowerCase()
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle, name: `Synthetic ${role}`, role, ...(role === 'worker' ? { workArea: ['tests'] } : {}) } })
    expect(r.statusCode, r.body).toBe(201)
    if (role === 'secretary') secretary = r.json().agent.id
    else { sheriff = r.json().agent.id; sheriffHandle = handle; process.env.MOLE_OFFICE_BUILD_SHERIFF = handle }
  }
}, 60_000)
afterEach(() => { delete process.env.MOLE_OFFICE_GATE_FLAKY; delete process.env.MOLE_OFFICE_GATE_HOUSE_RULES; delete process.env.MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND })
afterAll(async () => {
  await app?.close(); t?.close()
  for (const [key, value] of Object.entries({ HOME: saved.HOME, MOLE_OFFICE_GATE_FLAKY: saved.flaky, MOLE_OFFICE_GATE_HOUSE_RULES: saved.gate, MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND: saved.fix, MOLE_OFFICE_BUILD_SHERIFF: saved.sheriff, MOLE_OFFICE_GATE_FEW_FEATURE_REDS: saved.feature })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value
  }
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})
function ready(text: string | null = inventory(), ownList?: string, agent = sheriff) {
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
  const run = t.api.createRecord({ kind: 'session', title: 'Synthetic changed-answer run', workspaceId: 'default', origin: 'fixture', actor: person, data: { state: 'running', servingAgentId: agent, workingDirectory: dir, cutFrom: 'main', submission: { kind: 'git' } } }).id
  t.api.patchRecord(run, { dataPatch: { state: 'finished' } }, person)
  const seal = t.api.getRecord(run)!.data.sealedTip as string
  const sealHash = (t.api.getRecord(seal)!.data.seal as { hash: string }).hash
  const id = door.asTheMergeQueue(() => t.api.createRecord({ kind: 'merge_entry', title: 'Synthetic changed-answer entry', workspaceId: 'default', origin: 'fixture', actor: person, data: {
    state: 'testing', run, seal: { id: seal, hash: sealHash }, submittedBy: { kind: 'person', id: person.id }, occupies: dir,
    changeset: { adapter: 'git', root: dir, repository: dir, branch: 'main', commit: tip, base: mainAt },
    integration: { mainAt, result: tip, clone: dir, files: {}, at }, judged: {}, reinspected: [],
    verdict: { run, by: { kind: 'person', id: person.id }, at, how: 'Synthetic released fixture', message: null },
  } })).id
  for (const m of t.api.listRecords({ workspaceId: 'default', kind: 'message' }).filter(m => m.data.aboutRun === run)) fixtureMessages.add(m.id)
  return { id, run, tip, mainAt, dir }
}
// A SECOND ENTRY WAITING IN THE SAME LANE, for the pair's borrow: the driver names it and decides something for it.
function anotherOnTheSameLane(one: ReturnType<typeof ready>) {
  const run = t.api.createRecord({ kind: 'session', title: 'Synthetic paired run', workspaceId: 'default', origin: 'fixture', actor: person, data: { state: 'running', servingAgentId: sheriff, workingDirectory: one.dir, cutFrom: 'main', submission: { kind: 'git' } } }).id
  t.api.patchRecord(run, { dataPatch: { state: 'finished' } }, person)
  const seal = t.api.getRecord(run)!.data.sealedTip as string
  const sealHash = (t.api.getRecord(seal)!.data.seal as { hash: string }).hash
  const id = door.asTheMergeQueue(() => t.api.createRecord({ kind: 'merge_entry', title: 'Synthetic paired entry', workspaceId: 'default', origin: 'fixture', actor: person, data: {
    state: 'judged', run, seal: { id: seal, hash: sealHash }, submittedBy: { kind: 'person', id: person.id },
    changeset: { adapter: 'git', root: one.dir, repository: one.dir, branch: 'main', commit: one.tip, base: one.mainAt },
    integration: { mainAt: one.mainAt, result: one.tip, clone: one.dir, files: {}, at }, judged: {}, reinspected: [],
    verdict: { run, by: { kind: 'person', id: person.id }, at, how: 'Synthetic released fixture', message: null },
  } })).id
  for (const m of t.api.listRecords({ workspaceId: 'default', kind: 'message' }).filter(m => m.data.aboutRun === run)) fixtureMessages.add(m.id)
  return { id, run, tip: one.tip, mainAt: one.mainAt, dir: one.dir }
}
async function step(one: ReturnType<typeof ready>, step: string, facts: Record<string, unknown>) {
  const machine = await import('../src/server/lib/merge-state-machine.ts')
  return machine.stepAMergeEntry({ id: one.id, workspaceId: 'default', step: step as Parameters<typeof machine.stepAMergeEntry>[0]['step'], facts, actor: person })
}
const changed = (one: ReturnType<typeof ready>, file: string, how = 'green-alone') => ({ file, how, commit: one.tip, log: '/synthetic/changed.log' })
const tested = (one: ReturnType<typeof ready>, more = {}) => step(one, 'tested', { green: true, tip: one.tip, log: '/synthetic/suite.log', ...more })
const problems = () => t.api.listRecords({ workspaceId: 'default', kind: 'problem' })
const messages = (run: string) => t.api.listRecords({ workspaceId: 'default', kind: 'message' }).filter(one => one.data.aboutRun === run && !fixtureMessages.has(one.id))
const notices = (run: string) => messages(run).filter(one => one.data.notice === 'aTestChangedItsAnswer')
const flakyTitle = (file: string) => `A test changed its answer: ${file}`
/** A tested fact without its time: the stamp `at` and the clock reading `time` written beside it. */
function withoutTime(value: unknown) { const { at: _at, time: _time, ...rest } = value as Record<string, unknown>; return rest }
async function land(one: ReturnType<typeof ready>) {
  await step(one, 'landing', { mainAt: one.mainAt })
  return step(one, 'landed', { mainAfter: one.tip })
}
function openProblem(file: string, family: 'redOnMainFamily' | 'changedItsAnswerFamily' | null, title: string) {
  return t.api.createRecord({ kind: 'problem', title, workspaceId: 'default', origin: 'fixture', actor: person,
    data: { state: 'open', whose_move: 'agent', symptom: 'Synthetic family fixture', seen_in: [file], extra: family === null ? {} : { [family]: true } } })
}
it('case 1: defaults to off, names both files, files and tells nothing, and may land', async () => {
  const one = ready(), files = ['tests/off-first.test.ts', 'tests/off-second.test.ts'], before = problems().length
  const result = await tested(one, { changedTheirAnswer: files.map(file => changed(one, file)) })
  expect(problems()).toHaveLength(before); expect(messages(one.run)).toHaveLength(0)
  expect(result.decided).toBe(`Green. The entry may land. MOLE_OFFICE_GATE_FLAKY is off, so nothing was filed for the 2 file(s) that changed their answer: ${files.join(', ')}.`)
  expect(result.entry.state).toBe('testing'); expect((await land(one)).entry.state).toBe('merged')
})
it('case 2: remind files each observation, wakes both holders once, and keeps the green verdict', async () => {
  process.env.MOLE_OFFICE_GATE_FLAKY = 'remind'
  const one = ready(), files = ['tests/remind-alone.test.ts', 'tests/remind-pair.test.ts'], before = problems().length
  const noList = await tested(one)
  expect(noList.decided).toBe('Green. The entry may land.')
  const result = await tested(one, { changedTheirAnswer: files.map((file, index) => changed(one, file, index === 0 ? 'green-alone' : 'green-in-the-pair')) })
  expect(problems()).toHaveLength(before + 2)
  const fresh = files.map(file => problems().find(p => p.title === flakyTitle(file))!)
  expect(fresh.every(Boolean)).toBe(true)
  for (const [index, p] of fresh.entries()) {
    expect(p.title).toBe(flakyTitle(files[index]!))
    expect(p.data).toMatchObject({ state: 'open', whose_move: 'agent', seen_in: [files[index]], found_by: `the merge tool, while it tested merge entry ${one.id}`,
      extra: { changedItsAnswerFamily: true, buildSheriff: expect.any(String), mergeEntry: one.id, commit: one.tip, how: index === 0 ? 'green-alone' : 'green-in-the-pair', log: '/synthetic/changed.log' } })
    expect(p.data.symptom).toBe(`${files[index]} ${index === 0 ? 'was red in a run and then green alone on the same tree' : 'was red alone with the entry and then green with it in the pair beside main'} at commit ${one.tip.slice(0, 12)}; its log is /synthetic/changed.log. The list never changes a verdict. Whoever fixes the test closes this problem with state fixed and names the commit that fixed it in fix.`)
  }
  const told = notices(one.run)
  expect(told).toHaveLength(2)
  expect(told.flatMap(m => m.data.to)).toEqual(expect.arrayContaining([{ kind: 'agent', id: sheriff }, { kind: 'agent', id: secretary }]))
  const handle = sheriffHandle
  const line = `A test changed its answer: ${fresh.map((p, index) => `${files[index]} (problem ${p.id})`).join(', ')}, for the build sheriff ${handle}.`
  for (const m of told) { expect(m.title).toBe(line); expect(m.data.body).toBe(line) }
  expect(result.decided).toContain(`Filed ${fresh.map(p => p.id).join(', ')}.`)
  expect(result.decided).toContain('was told in message')
  expect(result.entry.machine?.['tested']).toMatchObject({ green: true })
  expect(result.entry.machine?.['tested']).not.toHaveProperty('changedTheirAnswer')
  expect(withoutTime(result.entry.machine?.['tested'])).toEqual(withoutTime(noList.entry.machine?.['tested']))
  expect(result.entry.state).toBe('testing'); expect((await land(one)).entry.state).toBe('merged')
})
it('case 3: an open flaky problem holds the same file and tells nobody again', async () => {
  process.env.MOLE_OFFICE_GATE_FLAKY = 'remind'
  const file = 'tests/open-flaky.test.ts', one = ready()
  await tested(one, { changedTheirAnswer: [changed(one, file)] })
  const next = ready(), before = problems().length
  const result = await tested(next, { changedTheirAnswer: [changed(next, file)] })
  expect(problems()).toHaveLength(before); expect(messages(next.run)).toHaveLength(0)
  expect(result.decided).toContain('Each file already has an open problem, so nothing was filed and nobody was told again.')
})
it('case 4: a fixed problem no longer holds its file', async () => {
  process.env.MOLE_OFFICE_GATE_FLAKY = 'remind'
  const one = ready(), file = 'tests/fixed-flaky.test.ts'
  await tested(one, { changedTheirAnswer: [changed(one, file)] })
  const old = problems().find(p => p.title === flakyTitle(file))!
  t.api.patchRecord(old.id, { dataPatch: { state: 'fixed', fix: `Synthetic repair commit ${one.tip}` } }, person)
  const next = ready(), before = problems().length
  await tested(next, { changedTheirAnswer: [changed(next, file)] })
  expect(problems()).toHaveLength(before + 1); expect(notices(next.run)).toHaveLength(2)
})
it('case 5: red bounces as before and still files the changed answer', async () => {
  process.env.MOLE_OFFICE_GATE_FLAKY = 'remind'
  const one = ready(), baseline = ready(), file = 'tests/red-flaky.test.ts'
  const plain = await tested(baseline, { green: false, redTests: red })
  const result = await tested(one, { green: false, redTests: red, changedTheirAnswer: [changed(one, file)] })
  expect(result.entry.state).toBe(plain.entry.state); expect(result.entry.state).toBe('bounced')
  expect(result.entry.machine?.['bounced']).toMatchObject({ reason: 'red', redTests: red })
  expect(result.entry.machine?.['tested']).toEqual(plain.entry.machine?.['tested'])
  expect(result.decided).toContain(plain.decided)
  expect(problems().filter(p => p.title === flakyTitle(file))).toHaveLength(1)
})
it('case 6: refusal for red without redTests files and tells nothing', async () => {
  process.env.MOLE_OFFICE_GATE_FLAKY = 'remind'
  const one = ready(), before = problems().length
  await expect(tested(one, { green: false, changedTheirAnswer: [changed(one, 'tests/refused-no-red-tests.test.ts')] })).rejects.toThrow('A red test run names the tests that stayed red on their own, in `redTests`. Nothing was written.')
  expect(problems()).toHaveLength(before); expect(messages(one.run)).toHaveLength(0)
  expect(t.api.getRecord(one.id)!.data.state).toBe('testing')
})
it('case 7: each family holds only its own files, also after a problem is retitled', async () => {
  process.env.MOLE_OFFICE_GATE_FLAKY = 'remind'
  const one = ready(), file = 'tests/red-family-first.test.ts', other = 'tests/flaky-family-first.test.ts'
  await step(one, 'red-on-main', { mainAt: one.mainAt, files: [{ file }] })
  await tested(one, { changedTheirAnswer: [changed(one, file), changed(one, other)] })
  expect(problems().filter(p => p.title === flakyTitle(file))).toHaveLength(1)
  await step(one, 'red-on-main', { mainAt: one.mainAt, files: [{ file: other }] })
  expect(problems().filter(p => p.title === `Red on main, and no merge entry's: ${other}`)).toHaveLength(1)
  const renamed = 'tests/retitled-flaky.test.ts'
  openProblem(renamed, 'changedItsAnswerFamily', 'Synthetic retitled flaky problem')
  const next = ready(), before = problems().length
  await tested(next, { changedTheirAnswer: [changed(next, renamed)] })
  expect(problems()).toHaveLength(before); expect(messages(next.run)).toHaveLength(0)
  const renamedMain = 'tests/retitled-red-main.test.ts'
  openProblem(renamedMain, 'redOnMainFamily', 'Synthetic retitled main problem')
  const heldBefore = problems().length
  await step(next, 'red-on-main', { mainAt: next.mainAt, files: [{ file: renamedMain }] })
  expect(problems()).toHaveLength(heldBefore); expect(messages(next.run)).toHaveLength(0)
  for (const [index, family] of ['flaky', 'main'].entries()) {
    const titleFile = `tests/title-only-${index}.test.ts`
    openProblem(titleFile, null, family === 'flaky' ? flakyTitle(titleFile) : `Red on main, and no merge entry's: ${titleFile}`)
    const count = problems().length
    if (family === 'flaky') await tested(next, { changedTheirAnswer: [changed(next, titleFile)] })
    else await step(next, 'red-on-main', { mainAt: next.mainAt, files: [{ file: titleFile }] })
    expect(problems()).toHaveLength(count); expect(messages(next.run)).toHaveLength(0)
  }
  const unrelated = 'tests/unrelated-flaky.test.ts'
  openProblem(unrelated, 'redOnMainFamily', 'Synthetic other family problem')
  await tested(next, { changedTheirAnswer: [changed(next, unrelated)] })
  expect(problems().filter(p => p.title === flakyTitle(unrelated))).toHaveLength(1)
})
it('case 8: duplicate files make one problem', async () => {
  process.env.MOLE_OFFICE_GATE_FLAKY = 'remind'
  const one = ready(), item = changed(one, 'tests/duplicate-flaky.test.ts'), before = problems().length
  await tested(one, { changedTheirAnswer: [item, item] })
  expect(problems()).toHaveLength(before + 1); expect(notices(one.run)).toHaveLength(2)
})
it('case 9: strict facts refuse unknown how and unknown keys without filing', async () => {
  process.env.MOLE_OFFICE_GATE_FLAKY = 'remind'
  for (const [index, more] of [{ how: 'unknown' }, { unknown: true }].entries()) {
    const one = ready(), before = problems().length
    await expect(tested(one, { changedTheirAnswer: [{ ...changed(one, `tests/strict-flaky-${index}.test.ts`), ...more }] })).rejects.toThrow()
    expect(problems()).toHaveLength(before); expect(messages(one.run)).toHaveLength(0)
  }
})
it('case 10: with no sheriff named the problem is filed and no sheriff is told', async () => {
  process.env.MOLE_OFFICE_GATE_FLAKY = 'remind'
  const named = process.env.MOLE_OFFICE_BUILD_SHERIFF
  delete process.env.MOLE_OFFICE_BUILD_SHERIFF
  try {
    const one = ready(), before = problems().length
    const result = await tested(one, { changedTheirAnswer: [changed(one, 'tests/no-sheriff-flaky.test.ts')] })
    expect(problems()).toHaveLength(before + 1); expect(notices(one.run)).toHaveLength(1)
    expect(result.decided).toContain('MOLE_OFFICE_BUILD_SHERIFF names nobody, so no sheriff was told.')
    expect(problems().find(p => p.title === flakyTitle('tests/no-sheriff-flaky.test.ts'))!.data.extra).toMatchObject({ buildSheriff: null })
  } finally { process.env.MOLE_OFFICE_BUILD_SHERIFF = named }
})
it('case 11: red-on-main keeps its exact title, symptom, extra, notices and entry evidence', async () => {
  const one = ready(), file = 'tests/unchanged-main-red.test.ts', log = '/synthetic/main-red.log'
  const result = await step(one, 'red-on-main', { mainAt: one.mainAt, files: [{ file, log }, { file, log }] })
  const p = problems().find(p => p.title === `Red on main, and no merge entry's: ${file}`)!
  const handle = sheriffHandle
  expect(p.data).toMatchObject({ state: 'open', whose_move: 'agent', seen_in: [file], found_by: `the merge tool, while it tested merge entry ${one.id}`,
    symptom: `${file} fails on main ${one.mainAt.slice(0, 12)} alone, run in the sandbox of merge entry ${one.id}; its log is ${log}. No entry's change is in that tree, so it belongs to no entry, and the merge queue lands the entries it holds as before.`,
    extra: { redOnMainFamily: true, buildSheriff: handle, mainAt: one.mainAt, mergeEntry: one.id, log } })
  expect(result.entry.state).toBe('testing')
  expect(result.entry.machine?.['redOnMain']).toEqual([{ file, mainAt: one.mainAt, log, problem: p.id, at: expect.any(String) }])
  const told = messages(one.run).filter(m => m.data.notice === 'redOnMain')
  expect(told).toHaveLength(2)
  const line = `Red on main, and no merge entry's: ${file} (problem ${p.id}), for the build sheriff ${handle}.`
  for (const m of told) { expect(m.title).toBe(line); expect(m.data.body).toBe(line) }
  expect(result.decided).toContain(`1 file(s) red on main alone belong to no entry, and the entry is not moved. Filed ${p.id}.`)
})
it('case 12: a list of 250 files is taken, as many as redTests may name, and the entry may land', async () => {
  const one = ready(), files = Array.from({ length: 250 }, (_, index) => `tests/long-list-${String(index)}.test.ts`)
  const result = await tested(one, { changedTheirAnswer: files.map(file => changed(one, file)) })
  expect(result.decided).toContain('MOLE_OFFICE_GATE_FLAKY is off, so nothing was filed for the 250 file(s) that changed their answer')
  expect(result.entry.state).toBe('testing'); expect((await land(one)).entry.state).toBe('merged')
})

it('case 13: at block, a green run with two changed answers bounces as red, names them, and files and tells nobody', async () => {
  process.env.MOLE_OFFICE_GATE_FLAKY = 'block'
  const one = ready(), files = ['tests/block-green-first.test.ts', 'tests/block-green-second.test.ts'], before = problems().length
  const result = await tested(one, { changedTheirAnswer: files.map(file => changed(one, file)) })
  expect(result.entry.state).toBe('bounced')
  expect(result.entry.machine?.['bounced']).toMatchObject({ reason: 'red', redTests: files })
  const bounced = result.entry.machine?.['bounced'] as { says?: string }
  const says = String(bounced.says)
  for (const file of files) expect(says).toContain(file)
  expect(says).toContain('MOLE_OFFICE_GATE_FLAKY')
  expect(says).not.toContain('stayed red')
  for (const file of files) expect(result.decided).toContain(file)
  expect(result.decided).toContain('MOLE_OFFICE_GATE_FLAKY')
  expect(result.decided).toContain('nothing was filed')
  expect(result.decided).not.toContain('stayed red')
  expect(problems()).toHaveLength(before)
  expect(notices(one.run)).toHaveLength(0)
  expect(t.api.getRecord(one.id)!.data.state).toBe('bounced')
  await expect(step(one, 'landing', { mainAt: one.mainAt })).rejects.toThrow('final')
})
it('case 14: at block, a red run with one changed answer names its red tests then that file', async () => {
  process.env.MOLE_OFFICE_GATE_FLAKY = 'block'
  const one = ready(), file = 'tests/block-red-flaky.test.ts', ownRed = ['tests/block-red-first.test.ts'], before = problems().length
  const result = await tested(one, { green: false, redTests: ownRed, changedTheirAnswer: [changed(one, file)] })
  expect(result.entry.state).toBe('bounced')
  expect(result.entry.machine?.['bounced']).toMatchObject({ reason: 'red', redTests: [...ownRed, file] })
  expect(result.decided).toContain('MOLE_OFFICE_GATE_FLAKY')
  expect(result.decided).toContain(file)
  expect(problems()).toHaveLength(before)
  expect(notices(one.run)).toHaveLength(0)
})
it('case 15: at block, a red run with only plain house rules red bounces as red, where remind lets it land', async () => {
  process.env.MOLE_OFFICE_GATE_FLAKY = 'block'
  process.env.MOLE_OFFICE_GATE_HOUSE_RULES = 'remind'
  const plain = ready()
  const stayed = await tested(plain, { green: false, redTests: red })
  expect(stayed.entry.state).toBe('testing')
  expect(stayed.decided).toContain('only house rules red')
  const one = ready(), file = 'tests/block-house-flaky.test.ts', before = problems().length
  const result = await tested(one, { green: false, redTests: red, changedTheirAnswer: [changed(one, file)] })
  expect(result.entry.state).toBe('bounced')
  expect(result.entry.machine?.['bounced']).toMatchObject({ reason: 'red', redTests: [...red, file] })
  expect(problems()).toHaveLength(before)
  expect(notices(one.run)).toHaveLength(0)
})
it('case 16: at block, a strict-facts refusal and a refused borrow still refuse, with nothing filed or bounced', async () => {
  process.env.MOLE_OFFICE_GATE_FLAKY = 'block'
  const cases = [{ unknown: true }, { borrowedFrom: { entry: ready().id, tree: 'synthetic-tree' } }]
  for (const [index, more] of cases.entries()) {
    const one = ready(), before = problems().length
    await expect(tested(one, { ...more, changedTheirAnswer: [changed(one, `tests/block-refused-${index}.test.ts`)] })).rejects.toThrow('Nothing')
    expect(problems()).toHaveLength(before)
    expect(notices(one.run)).toHaveLength(0)
    expect(t.api.getRecord(one.id)!.data.state).toBe('testing')
    expect(t.api.getRecord(one.id)!.data.bounced).toBeUndefined()
  }
})
it('case 17: at block, a run with no changed answer is green and may land, as today', async () => {
  process.env.MOLE_OFFICE_GATE_FLAKY = 'block'
  const one = ready()
  const result = await tested(one)
  expect(result.entry.state).toBe('testing')
  expect(result.decided).toBe('Green. The entry may land.')
  expect((await land(one)).entry.state).toBe('merged')
})
it('case 18: block moved back to remind before the run lets it land and files as remind does', async () => {
  process.env.MOLE_OFFICE_GATE_FLAKY = 'block'
  process.env.MOLE_OFFICE_GATE_FLAKY = 'remind'
  const one = ready(), files = ['tests/remind-again-first.test.ts', 'tests/remind-again-second.test.ts'], before = problems().length
  const result = await tested(one, { changedTheirAnswer: files.map(file => changed(one, file)) })
  expect(result.entry.state).toBe('testing')
  expect(problems()).toHaveLength(before + 2)
  expect(notices(one.run)).toHaveLength(2)
  expect((await land(one)).entry.state).toBe('merged')
})
it("case 19: at block, a pair's green run keeps nothing, so its partner cannot borrow it as green", async () => {
  process.env.MOLE_OFFICE_GATE_FLAKY = 'block'
  const driver = ready(), partner = anotherOnTheSameLane(driver), tree = 'ab'.repeat(20), file = 'tests/block-pair-flaky.test.ts'
  const result = await tested(driver, { testedWith: { entry: partner.id, tree, forTheOther: { tree, green: true, says: 'Synthetic: green with the pair.' } }, changedTheirAnswer: [changed(driver, file)] })
  expect(result.entry.state).toBe('bounced')
  expect(result.entry.machine?.['tested']).toBeUndefined()
  // The bounce let the lane go, so the partner takes it and is tested, as its own turn would.
  door.asTheMergeQueue(() => t.api.patchRecord(partner.id, { dataPatch: { state: 'testing', occupies: driver.dir } }, person))
  const borrowed = step(partner, 'tested', { green: true, log: '/synthetic/pair-suite.log', tip: partner.tip, borrowedFrom: { entry: driver.id, tree } })
  await expect(borrowed).rejects.toThrow(`did not test merge entry ${partner.id}`)
  expect(t.api.getRecord(partner.id)!.data.state).toBe('testing')
})

it('also appends filing after house-rule admission and fix-round admission', async () => {
  process.env.MOLE_OFFICE_GATE_FLAKY = 'remind'
  process.env.MOLE_OFFICE_GATE_HOUSE_RULES = 'remind'
  const house = ready(), houseFile = 'tests/house-branch-flaky.test.ts'
  const result = await tested(house, { green: false, redTests: red, changedTheirAnswer: [changed(house, houseFile)] })
  expect(result.decided).toContain('The entry may land, only house rules red:')
  expect(result.decided).toContain('Filed '); expect(notices(house.run)).toHaveLength(2)
  expect(result.entry.machine?.['tested']).toMatchObject({ green: false, houseRules: { class: 1 } })
  process.env.MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND = '1'
  const fix = ready(null), fixFile = 'tests/fix-round-flaky.test.ts', tree = git(fix.dir, 'rev-parse', 'HEAD^{tree}')
  const common = { source: 'original', tip: fix.tip, tree, log: '/synthetic/original.log' }
  const admitted = await tested(fix, { green: false, redTests: red, changedTheirAnswer: [changed(fix, fixFile)], wholeSuiteRed: {
    outcome: 'admitted-for-fix-round', build: { ...common, exit: 0 },
    affected: { ...common, selection: 'complete', exit: 0, files: ['tests/affected.test.ts'], ran: 1, passed: 1, report: '/synthetic/affected.json' },
    suite: { ...common, complete: true, exit: 1, ran: 3, passed: 1, redTests: red, report: '/synthetic/suite.json' },
  } })
  expect(admitted.decided).toContain('Whole suite red; admitted for a fix round. The entry may land. Filed ')
  expect(admitted.entry.state).toBe('testing'); expect(notices(fix.run)).toHaveLength(2)
})
it('borrowed-result and plugin refusals cannot file or tell either holder', async () => {
  process.env.MOLE_OFFICE_GATE_FLAKY = 'remind'
  for (const [index, facts] of [{ plugin: { id: 'synthetic-plugin', manifest: false } }, { borrowedFrom: { entry: ready().id, tree: 'synthetic-tree' } }].entries()) {
    const one = ready(), before = problems().length
    await expect(tested(one, { ...facts, changedTheirAnswer: [changed(one, `tests/refused-extra-${index}.test.ts`)] })).rejects.toThrow('Nothing')
    expect(problems()).toHaveLength(before); expect(messages(one.run)).toHaveLength(0)
  }
})

it('also appends filing after feature files are handed back to an open line', async () => {
  process.env.MOLE_OFFICE_GATE_FLAKY = 'remind'
  const start = async (role: string, by = headers) => {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: by,
      payload: { handle: `${role}-${Math.random().toString(16).slice(2)}`, name: 'Synthetic line participant', role, ...(role === 'worker' ? { workArea: ['tests'] } : {}) } })
    expect(r.statusCode, r.body).toBe(201); return String(r.json().agent.id)
  }
  const starter = await start('supervisor')
  const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  const author = await start('worker', { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': starter, 'x-mole-office-key': makeAnAgentKey(starter, null) } as typeof headers)
  const round = t.api.createRecord({ kind: 'session', title: 'Synthetic open feature round', workspaceId: 'default', origin: 'fixture', actor: person, data: { state: 'running', servingAgentId: starter } }).id
  const { registerResource } = await import('../src/server/lib/resources.ts')
  registerResource({ workspaceId: 'default', sessionRecordId: round, type: 'process', key: String(process.pid), actor: person })
  const one = ready('export const HOUSE_RULES = {\n}', undefined, author), file = 'tests/feature-branch-flaky.test.ts'
  // The author and its starter have a live round; only the gate for the feature reds changes admission.
  process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = 'remind'
  try {
    const result = await tested(one, { green: false, redTests: ['tests/entry.test.ts'], build: { passed: true }, changedTheirAnswer: [changed(one, file)] })
    expect(result.decided).toContain('The entry may land, handed back: tests/entry.test.ts.')
    expect(result.decided).toContain('Filed '); expect(result.entry.state).toBe('testing')
    expect(notices(one.run)).toHaveLength(2)
  } finally { delete process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS }
})
it('counts the flaky-tests gate once for a tested step that names changed answers, in its position, and nothing for a step with none or a refused step', async () => {
  const counts = () => t.client.sqlite.prepare("SELECT COALESCE(SUM(would_stop), 0) AS would_stop, COALESCE(SUM(stopped), 0) AS stopped, COALESCE(SUM(reminded), 0) AS reminded FROM gate_counts WHERE gate = 'flaky-tests'").get() as { would_stop: number; stopped: number; reminded: number }
  for (const position of ['remind', 'off']) {
    process.env.MOLE_OFFICE_GATE_FLAKY = position
    const before = counts(), one = ready()
    await tested(one)
    expect(counts()).toEqual(before)
    await expect(tested(one, { green: false, changedTheirAnswer: [changed(one, `tests/counted-refused-${position}.test.ts`)] })).rejects.toThrow('Nothing was written.')
    expect(counts()).toEqual(before)
    const result = await tested(one, { changedTheirAnswer: [changed(one, `tests/counted-first-${position}.test.ts`), changed(one, `tests/counted-second-${position}.test.ts`, 'green-in-the-pair')] })
    expect(result.entry.state).toBe('testing')
    const expected = { would_stop: before.would_stop + 1, stopped: before.stopped, reminded: before.reminded + (position === 'remind' ? 1 : 0) }
    expect(counts()).toEqual(expected)
    expect((await land(one)).entry.state).toBe('merged')
    expect(counts()).toEqual(expected)
  }
})
it('counts the flaky-tests gate once at block for a run it bounces, as one would-stop and one stopped, and nothing for a refused step or a run with no changed answer', async () => {
  const counts = () => t.client.sqlite.prepare("SELECT COALESCE(SUM(would_stop), 0) AS would_stop, COALESCE(SUM(stopped), 0) AS stopped, COALESCE(SUM(reminded), 0) AS reminded FROM gate_counts WHERE gate = 'flaky-tests'").get() as { would_stop: number; stopped: number; reminded: number }
  process.env.MOLE_OFFICE_GATE_FLAKY = 'block'
  const before = counts(), clean = ready()
  expect((await tested(clean)).entry.state).toBe('testing')
  expect(counts()).toEqual(before)
  const one = ready()
  await expect(tested(one, { unknown: true, changedTheirAnswer: [changed(one, 'tests/counted-refused-block.test.ts')] })).rejects.toThrow('Nothing')
  expect(counts()).toEqual(before)
  const result = await tested(one, { changedTheirAnswer: [changed(one, 'tests/counted-first-block.test.ts'), changed(one, 'tests/counted-second-block.test.ts', 'green-in-the-pair')] })
  expect(result.entry.state).toBe('bounced')
  expect(counts()).toEqual({ would_stop: before.would_stop + 1, stopped: before.stopped + 1, reminded: before.reminded })
})

// A RED RUN'S FAILURE LINES (wave 13u round 180). The tool reads them from the red run's log and
// sends them on the item; the office keeps them in the problem and says what it kept, so the problem does not depend on
// the log being kept. Cases 2 and 11 send no lines, as an older tool does, and their symptoms stay as they were.
type ABlock = { line: number; lines: string[]; cut: boolean }
type TheLines = { log: string; found: 'blocks'; blocks: ABlock[]; leftOut: number } | { log: string; found: 'none'; lines: number } | { log: string; found: 'unread'; why: string }
const REPO = fileURLToPath(new URL('..', import.meta.url))
/** An English word of the wave's list, which must exist. */
function say(key: string, values: WordValues = {}) {
  const words = sayInEnglish(key as WordKey, values)
  expect(words.startsWith('⟦'), key).toBe(false)
  return words
}
async function theBound() {
  const module = (await import(join(REPO, 'src/shared/the-failure-lines-of-a-red-run.ts'))) as { HOW_MUCH_OF_A_RED_RUN_IS_KEPT?: { blocks: number; linesAfter: number; characters: number } }
  expect(module.HOW_MUCH_OF_A_RED_RUN_IS_KEPT).toBeDefined()
  return module.HOW_MUCH_OF_A_RED_RUN_IS_KEPT!
}
/** The state machine's own width for a commit in a symptom, and its sentence for a file red on main alone. */
async function theMachinesWords() {
  const machine = await import(join(REPO, 'src/server/lib/merge-state-machine.ts'))
  const width: unknown = Reflect.get(machine, 'HOW_MUCH_OF_A_COMMIT_A_SYMPTOM_NAMES')
  const redOnMainAlone: unknown = Reflect.get(machine, 'theRedOnMainAloneSymptom')
  expect(width).toBeTypeOf('number')
  expect(redOnMainAlone).toBeTypeOf('function')
  return { width: width as number, redOnMainAlone: redOnMainAlone as (file: string, mainAt: string, entry: string, log: string | undefined) => string }
}
const RULE = '⎯'.repeat(30)
/**
 * The symptom the office writes for a file green alone, read from the word list and the commit's width from the state
 * machine, so neither is copied here.
 */
const flakySymptom = async (one: ReturnType<typeof ready>, file: string) =>
  say('flakyTests.symptom', { file, observation: say('flakyTests.greenAlone'), commit: one.tip.slice(0, (await theMachinesWords()).width), log: '/synthetic/changed.log' })

// Mutation: keep the lines out of extra, say nothing of them, read them from another file's block, say the bound cut a
// block it did not cut, or name a line the block does not stand on, and this case goes red.
it('a made-up red run whose problem carries its failure lines, read by the tool from the run that was red', async () => {
  process.env.MOLE_OFFICE_GATE_FLAKY = 'remind'
  const tool = (await import(join(REPO, 'tools/merge-tool/the-failure-lines.mjs'))) as { withTheirFailureLines?: (changed: Record<string, unknown>[], reruns: { file: string; log?: string | null }[], redRun: string | null) => Record<string, unknown>[] }
  expect(tool.withTheirFailureLines).toBeTypeOf('function')
  const one = ready(), file = 'tests/kept-lines.test.ts', other = 'tests/kept-lines-other.test.ts'
  const suite = join(mkdtempSync(join(home, 'logs-')), 'suite.log')
  const log = [' ❯ synthetic progress line', '', ` FAIL  ${other} > is another file's case`, 'Error: synthetic other', '', `${RULE}[1/2]⎯`, '',
    ` FAIL  ${file} > keeps the synthetic total`, 'AssertionError: expected 3 to be 4', ` ❯ ${file}:9:21`, '', `${RULE}[2/2]⎯`, '']
  writeFileSync(suite, log.join('\n'))
  const [item] = tool.withTheirFailureLines!([changed(one, file)], [{ file, log: '/synthetic/changed.log' }], suite)
  const lines: TheLines = { log: suite, found: 'blocks', blocks: [{ line: 8, lines: [` FAIL  ${file} > keeps the synthetic total`, 'AssertionError: expected 3 to be 4', ` ❯ ${file}:9:21`], cut: false }], leftOut: 0 }
  expect(item).toEqual({ ...changed(one, file), failureLines: lines })
  const result = await tested(one, { changedTheirAnswer: [item] })
  expect(result.entry.state).toBe('testing')
  const p = problems().find(p => p.title === flakyTitle(file))!
  expect(p.data.extra).toEqual({ changedItsAnswerFamily: true, buildSheriff: sheriffHandle, mergeEntry: one.id, commit: one.tip, how: 'green-alone', log: '/synthetic/changed.log', failureLines: lines })
  expect(p.data.symptom).toBe(`${await flakySymptom(one, file)} ${say('failureLines.kept', { count: 1, log: suite, lines: '8' })}`)
  expect(result.entry.machine?.['tested']).not.toHaveProperty('changedTheirAnswer')
})

// Mutation: leave a cut unsaid, say a cut where there is none, count the blocks left out wrongly, say none for a log
// that was not read, or drop the lines a log had, and this case goes red.
it('says a long block was cut to the bound and counts the blocks left out, and says a run with no FAIL block and an unread log so', async () => {
  process.env.MOLE_OFFICE_GATE_FLAKY = 'remind'
  const bound = await theBound(), one = ready()
  const block = (line: number, cut: boolean): ABlock => ({ line, lines: [` FAIL  tests/synthetic.test.ts > case ${String(line)}`, 'Error: synthetic'], cut })
  const shapes: Array<[string, TheLines, string]> = [
    ['tests/lines-cut.test.ts', { log: '/synthetic/cut.log', found: 'blocks', blocks: [block(3, true), block(30, false)], leftOut: 0 },
      `${say('failureLines.kept', { count: 2, log: '/synthetic/cut.log', lines: '3, 30' })} ${say('failureLines.cut', { linesAfter: bound.linesAfter, characters: bound.characters })}`],
    ['tests/lines-left-out.test.ts', { log: '/synthetic/left-out.log', found: 'blocks', blocks: [block(3, false), block(9, false), block(15, false)], leftOut: 4 },
      `${say('failureLines.kept', { count: 3, log: '/synthetic/left-out.log', lines: '3, 9, 15' })} ${say('failureLines.leftOut', { blocks: bound.blocks, leftOut: 4 })}`],
    ['tests/lines-cut-and-left-out.test.ts', { log: '/synthetic/both.log', found: 'blocks', blocks: [block(3, false), block(9, true)], leftOut: 1 },
      `${say('failureLines.kept', { count: 2, log: '/synthetic/both.log', lines: '3, 9' })} ${say('failureLines.cut', { linesAfter: bound.linesAfter, characters: bound.characters })} ${say('failureLines.leftOut', { blocks: bound.blocks, leftOut: 1 })}`],
    ['tests/lines-none.test.ts', { log: '/synthetic/green.log', found: 'none', lines: 41 }, say('failureLines.none', { log: '/synthetic/green.log', lines: 41 })],
    ['tests/lines-unread.test.ts', { log: '/synthetic/gone.log', found: 'unread', why: 'ENOENT: no such file or directory' }, say('failureLines.unread', { log: '/synthetic/gone.log', why: 'ENOENT: no such file or directory' })],
  ]
  expect(new Set(shapes.map(([, , said]) => said)).size).toBe(shapes.length)
  await tested(one, { changedTheirAnswer: shapes.map(([file, failureLines]) => ({ ...changed(one, file), failureLines })) })
  for (const [file, failureLines, said] of shapes) {
    const p = problems().find(p => p.title === flakyTitle(file))!
    expect(p.data.extra, file).toMatchObject({ failureLines })
    expect(p.data.symptom, file).toBe(`${await flakySymptom(one, file)} ${said}`)
  }
})

// Mutation: keep the lines out of a red-on-main problem's extra or symptom, or keep them in the entry's redOnMain, and
// this case goes red.
it('red on main keeps its failure lines in the problem, says them in its symptom, and keeps them off the entry', async () => {
  const one = ready(), file = 'tests/main-red-with-lines.test.ts', log = '/synthetic/main-red.log'
  const lines: TheLines = { log, found: 'blocks', blocks: [{ line: 12, lines: [` FAIL  ${file} > is red on main`, 'Error: synthetic'], cut: false }], leftOut: 0 }
  const result = await step(one, 'red-on-main', { mainAt: one.mainAt, files: [{ file, log, failureLines: lines }] })
  const p = problems().find(p => p.title === `Red on main, and no merge entry's: ${file}`)!
  expect(p.data.extra).toEqual({ redOnMainFamily: true, buildSheriff: sheriffHandle, mainAt: one.mainAt, mergeEntry: one.id, log, failureLines: lines })
  // THE SENTENCE BEFORE THE LINES is the state machine's own; case 11 holds its words.
  const { redOnMainAlone } = await theMachinesWords()
  expect(p.data.symptom).toBe(`${redOnMainAlone(file, one.mainAt, one.id, log)} ${say('failureLines.kept', { count: 1, log, lines: '12' })}`)
  expect(result.entry.machine?.['redOnMain']).toEqual([{ file, mainAt: one.mainAt, log, problem: p.id, at: expect.any(String) }])
})
