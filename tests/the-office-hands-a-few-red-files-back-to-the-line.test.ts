// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE HANDS A FEW RED FILES BACK TO THE LINE.
 * Measures a real temporary office with its own HOME, database and kernel-chosen port. It reads git,
 * registry and settings independently, files one hand-back with a zoned deadline, deduplicates reds,
 * checks ordinary repairs and closes only on landing. The starter's ledger owns this test process.
 * Mutations: trust tool; count H toward N; ignore retirement; assume build; always remind; always off
 * at landing; omit red-on-main family; ignore repair results; omit closure; at flaky block say the green
 * or red sentence for a failed repair; add the flaky file to a failed repair's redTests; leave a bounce's
 * changedTheirAnswer off; read block as remind; omit a class-two house-rule count. Each named case goes red.
 */
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, afterEach, expect, it } from 'vitest'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { momentOfStampInZone } from '../src/shared/time.ts'
import { theMoveAStepMakes } from '../src/shared/merge-queue.ts'
let t: TestDb, app: FastifyInstance, home: string
let door: typeof import('../src/server/lib/merge-entry-door.ts')
let queue: typeof import('../src/server/lib/merge-queue.ts')
let starter: string, author: string, submitter: string, secretary: string, round: string
const names = ['HOME', 'MOLE_OFFICE_GATE_FEW_FEATURE_REDS', 'MOLE_OFFICE_FEW_RED_FILES', 'MOLE_OFFICE_HAND_BACK_HOURS', 'MOLE_OFFICE_GATE_HOUSE_RULES', 'MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND', 'MOLE_OFFICE_GATE_FLAKY']
const saved = new Map(names.map(name => [name, process.env[name]]))
const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': person.id }
function git(dir: string, ...args: string[]) { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'hand-back-office-')); process.env.HOME = home
  for (const name of names.slice(1)) delete process.env[name]
  t = await freshDb(); app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  door = await import('../src/server/lib/merge-entry-door.ts'); queue = await import('../src/server/lib/merge-queue.ts')
  const start = async (role: string, by: Record<string, string> = headers) => {
    const result = await app.inject({ method: 'POST', url: '/api/agents/started', headers: by, payload: { handle: randomUUID(), name: 'A synthetic participant', role, ...(role === 'secretary' ? {} : { workArea: ['tests'] }) } })
    expect(result.statusCode, result.body).toBe(201); return String(result.json().agent.id)
  }
  starter = await start('supervisor'); secretary = await start('secretary'); submitter = await start('worker')
  const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  author = await start('worker', { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': starter, 'x-mole-office-key': makeAnAgentKey(starter, null) })
  round = t.api.createRecord({ kind: 'session', title: 'A synthetic open round', workspaceId: 'default', actor: person, data: { state: 'running', servingAgentId: starter } }).id
  const { registerResource } = await import('../src/server/lib/resources.ts')
  registerResource({ workspaceId: 'default', sessionRecordId: round, type: 'process', key: String(process.pid), actor: person })
}, 60_000)
afterEach(() => { for (const name of names.slice(1)) delete process.env[name]; t.client.sqlite.prepare('UPDATE agents SET retired = 0 WHERE id = ?').run(starter) })
afterAll(async () => {
  await app?.close(); t?.close()
  for (const [name, value] of saved) { if (value === undefined) delete process.env[name]; else process.env[name] = value }
  rmSync(home, { recursive: true, force: true })
})
function ready(file = `tests/${randomUUID()}.test.ts`, options: { database?: string; house?: string; inventory?: string; repository?: string; agent?: string } = {}) {
  const dir = options.repository ?? mkdtempSync(join(home, 'tree-'))
  if (options.repository === undefined) {
    git(dir, 'init', '-q', '-b', 'main'); git(dir, 'config', 'user.name', 'Synthetic fixture'); git(dir, 'config', 'user.email', 'fixture@example.invalid')
    mkdirSync(join(dir, 'tests')); writeFileSync(join(dir, 'tests/house-rules.mjs'), options.inventory ?? `export const HOUSE_RULES = {\n${options.house === undefined ? '' : `  '${options.house}': { class: 'H', kind: 'wording' },\n`}}\n`)
    writeFileSync(join(dir, file), 'main'); git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'Main')
  }
  const mainAt = git(dir, 'rev-parse', 'HEAD')
  writeFileSync(join(dir, file), randomUUID())
  if (options.house !== undefined) writeFileSync(join(dir, options.house), 'house')
  if (options.database !== undefined) { mkdirSync(dirname(join(dir, options.database)), { recursive: true }); writeFileSync(join(dir, options.database), 'database change') }
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'Entry')
  const tip = git(dir, 'rev-parse', 'HEAD')
  const run = t.api.createRecord({ kind: 'session', title: 'A synthetic entry run', workspaceId: 'default', actor: person, origin: 'fixture', data: { state: 'running', servingAgentId: options.agent ?? author, workingDirectory: dir, cutFrom: 'main', submission: { kind: 'git' } } }).id
  t.api.patchRecord(run, { dataPatch: { state: 'finished' } }, person)
  const seal = t.api.getRecord(run)!.data.sealedTip as string, hash = (t.api.getRecord(seal)!.data.seal as { hash: string }).hash
  const changeset = { adapter: 'git' as const, root: dir, repository: dir, branch: 'main', commit: tip, base: mainAt }
  const setup = { integration: { mainAt, result: tip, clone: dir, files: {}, at: '2026-10-21 09:00:00' }, judged: {}, reinspected: [], verdict: { run, by: { kind: 'person', id: person.id }, at: '2026-10-21 09:00:00', how: 'Synthetic released fixture', message: null } }
  const id = door.asTheMergeQueue(() => t.api.createRecord({ kind: 'merge_entry', title: 'A synthetic feature entry', workspaceId: 'default', origin: 'fixture', actor: person, data: { state: 'testing', run, seal: { id: seal, hash }, submittedBy: { kind: 'agent', id: submitter }, occupies: dir, changeset, ...setup } })).id
  return { id, run, dir, file, tip, mainAt, changeset, setup }
}
type Entry = ReturnType<typeof ready>
async function step(one: Entry, step: string, facts: Record<string, unknown>) {
  const machine = await import('../src/server/lib/merge-state-machine.ts')
  return machine.stepAMergeEntry({ id: one.id, workspaceId: 'default', step: step as Parameters<typeof machine.stepAMergeEntry>[0]['step'], facts, actor: person })
}
const tested = (one: Entry, more = {}) => step(one, 'tested', { green: false, redTests: [one.file], tip: one.tip, log: '/synthetic/red.log', build: { passed: true }, ...more })
const problems = () => t.api.listRecords({ workspaceId: 'default', kind: 'problem' })
const notices = (run: string) => t.api.listRecords({ workspaceId: 'default', kind: 'message' }).filter(one => one.data.aboutRun === run && one.data.notice === 'handedBack')
async function land(one: Entry) { await step(one, 'landing', { mainAt: one.mainAt }); return step(one, 'landed', { mainAfter: one.tip }) }
async function handBack() {
  process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = 'remind'
  const one = ready(), before = new Set(problems().map(problem => problem.id))
  await tested(one); await land(one)
  const problem = problems().find(p => !before.has(p.id) && p.title.startsWith('Handed back:'))!
  expect(problem).toBeDefined(); return { one, problem }
}
it('at default block bounces class two and names the setting', async () => {
  const one = ready(), result = await tested(one)
  expect(result.entry.state).toBe('bounced'); expect(result.entry.machine?.['bounced']).toMatchObject({ reason: 'red' })
  expect(result.decided).toContain('1 feature test file'); expect(result.decided).toContain('class 2'); expect(result.decided).toContain('MOLE_OFFICE_GATE_FEW_FEATURE_REDS is at block')
})
it('at remind lands handed back, files facts and deadline, tells the line and secretary, and holds later red-on-main', async () => {
  const { one, problem } = await handBack()
  expect(problem.data.state).toBe('open'); expect(problem.data.seen_in).toEqual([one.file])
  const extra = problem.data.extra as { redOnMainFamily: boolean; handBack: { files: string[]; commits: string[]; line: { agent: string; starter: string; run: string }; deadline: string; timeZone: string; landedAt: string; hours: number } }
  expect(extra.redOnMainFamily).toBe(true)
  expect(extra.handBack).toMatchObject({ files: [one.file], commits: [one.tip], line: { agent: author, starter, run: round }, hours: 24 })
  expect(problem.data.symptom).toContain(extra.handBack.deadline); expect(problem.data.symptom).toContain(extra.handBack.timeZone)
  expect(momentOfStampInZone(extra.handBack.deadline, extra.handBack.timeZone)! - momentOfStampInZone(extra.handBack.landedAt, extra.handBack.timeZone)!).toBe(24 * 3_600_000)
  expect(notices(one.run).flatMap(m => m.data.to)).toEqual(expect.arrayContaining([author, starter, submitter, secretary].map(id => ({ kind: 'agent', id }))))
  const next = ready(), before = problems().length
  expect((await step(next, 'red-on-main', { mainAt: one.tip, files: [{ file: one.file }] })).decided).toContain('nothing was filed')
  expect(problems()).toHaveLength(before)
  expect(t.api.getRecord(one.id)!.data.tested).toMatchObject({ green: false, mergeClass: { class: 2 } })
  expect(t.api.getRecord(one.id)!.data.integrated).toMatchObject({ tests: { green: false, mergeClass: { class: 2 } } })
})
it('at off lands and files nothing for a unique red file', async () => {
  process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = 'off'
  const one = ready(), before = problems().length
  expect((await tested(one)).decided).toContain('may land, handed back')
  expect((await land(one)).decided).toContain('nothing was filed'); expect(problems()).toHaveLength(before)
})
it('reads off again at landing for another unique file', async () => {
  process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = 'remind'
  const one = ready(); await tested(one); const before = problems().length
  process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = 'off'
  await land(one); expect(problems()).toHaveLength(before)
})
it('names retired starter and no running round as cause eight', async () => {
  process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = 'remind'
  t.client.sqlite.prepare('UPDATE agents SET retired = 1 WHERE id = ?').run(starter)
  const retired = await tested(ready()); expect(retired.entry.state).toBe('bounced'); expect(retired.decided).toContain('starter is retired')
  t.client.sqlite.prepare('UPDATE agents SET retired = 0 WHERE id = ?').run(starter)
  const noRound = await tested(ready(undefined, { agent: submitter })); expect(noRound.entry.state).toBe('bounced'); expect(noRound.decided).toContain('starter is not an agent')
  t.api.patchRecord(round, { dataPatch: { state: 'crashed' } }, person)
  const ended = await tested(ready()); expect(ended.entry.state).toBe('bounced'); expect(ended.decided).toContain('starter has no run going')
  t.api.patchRecord(round, { dataPatch: { state: 'running' } }, person)
})
it('does not take a missing build fact as a pass', async () => {
  process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = 'remind'
  const result = await tested(ready(), { build: undefined })
  expect(result.entry.state).toBe('bounced'); expect(result.decided).toContain('does not say whether the build passed')
})
it('reads database paths itself when the tool says none and says its reading wins', async () => {
  process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = 'remind'
  const one = ready(undefined, { database: 'drizzle/change.sql' })
  const result = await tested(one, { mergeClass: { class: 2, databasePaths: [], featureFiles: [one.file] } })
  expect(result.entry.state).toBe('bounced'); expect(result.decided).toContain('drizzle/change.sql'); expect(result.decided).toContain("office's reading wins")
})
it('does not count plain H toward N and requires its gate to allow landing', async () => {
  process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = 'remind'; process.env.MOLE_OFFICE_FEW_RED_FILES = '1'
  const house = 'tests/house.test.ts', one = ready(undefined, { house })
  const blocked = await tested(one, { redTests: [one.file, house] })
  expect(blocked.entry.state).toBe('bounced'); expect(blocked.decided).toContain('class 2'); expect(blocked.decided).toContain('MOLE_OFFICE_GATE_HOUSE_RULES is at block')
  process.env.MOLE_OFFICE_GATE_HOUSE_RULES = 'remind'
  const allowed = ready(undefined, { house }); expect((await tested(allowed, { redTests: [allowed.file, house] })).entry.state).toBe('testing')
  const before = problems().length; await land(allowed)
  expect(problems().slice(before)).toHaveLength(2)
})
it('refuses a new landing at block and finishes one already begun', async () => {
  process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = 'remind'
  const one = ready(); await tested(one)
  process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = 'block'
  await expect(step(one, 'landing', { mainAt: one.mainAt })).rejects.toThrow('MOLE_OFFICE_GATE_FEW_FEATURE_REDS is now at block')
  process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = 'remind'; await step(one, 'landing', { mainAt: one.mainAt })
  process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = 'block'; expect((await step(one, 'landed', { mainAfter: one.tip })).entry.state).toBe('merged')
})
async function repair(problem: string, original: Entry, kind: 'repair' | 'takeout' = 'repair') {
  const one = ready(original.file, { repository: original.dir })
  // The ordinary submission owns all correlation checks; only the later release/integration is a fixture here.
  door.asTheMergeQueue(() => t.api.patchRecord(one.id, { dataPatch: { state: 'bounced', occupies: null } }, person))
  const repositories = await import('../src/server/lib/repositories.ts')
  const repository = repositories.listRepositories('default').find(row => row.root === one.dir) ?? repositories.registerRepository({ workspaceId: 'default', name: randomUUID(), root: one.dir, actor: person })
  const submitted = queue.submitAMergeEntry({ workspaceId: 'default', actor: person, submission: { run: one.run, changeset: { adapter: 'git', repository: repository.id, branch: 'main' }, fixRound: { problem, kind } } })
  one.id = submitted.entry.id
  expect(t.api.getRecord(one.id)!.data.repairOf).toEqual({ problem, files: [original.file] })
  door.asTheMergeQueue(() => t.api.patchRecord(one.id, { dataPatch: { state: 'testing', occupies: one.dir, ...one.setup } }, person))
  return one
}
it('accepts repairs again after a bounced repair, rejects missing and failed results even when green, and closes only after landing', async () => {
  const { one, problem } = await handBack()
  const first = await repair(problem.id, one)
  const failed = await tested(first, { green: true, redTests: undefined, repair: { problem: problem.id, files: [{ file: one.file, passed: false }] } })
  expect(failed.entry.state).toBe('bounced'); expect(failed.decided).toContain(one.file); expect(failed.decided).toContain(problem.id)
  expect(t.api.getRecord(problem.id)!.data.state).toBe('open')
  const missing = await repair(problem.id, one)
  expect((await tested(missing, { green: true, redTests: undefined })).decided).toContain('did not report')
  const next = await repair(problem.id, one)
  expect((await tested(next, { green: true, redTests: undefined, repair: { problem: problem.id, files: [{ file: one.file, passed: true }] } })).entry.state).toBe('testing')
  expect(t.api.getRecord(problem.id)!.data.state).toBe('open')
  expect((await land(next)).decided).toContain('fixed')
  expect(t.api.getRecord(problem.id)!.data).toMatchObject({ state: 'fixed', fix: expect.stringContaining(next.id) })
  expect(String(t.api.getRecord(problem.id)!.data.fix)).toContain(next.tip)
})
it('at flaky block, a failed repair bounces with its own files and the repair sentence, says they stayed red, and files nothing for the changed answers', async () => {
  process.env.MOLE_OFFICE_GATE_FLAKY = 'block'
  try {
    const { one, problem } = await handBack()
    const first = await repair(problem.id, one)
    const flaky = 'tests/a-flaky-one.test.ts', before = problems().length
    const failed = await tested(first, { green: true, redTests: undefined, changedTheirAnswer: [{ file: flaky, how: 'green-alone', commit: first.tip, log: '/synthetic/changed.log' }], repair: { problem: problem.id, files: [{ file: one.file, passed: false }] } })
    const bounced = failed.entry.machine?.['bounced'] as { reason: string; redTests?: string[]; changedTheirAnswer?: string[]; says?: string }
    expect(failed.entry.state).toBe('bounced')
    expect(bounced).toMatchObject({ reason: 'red' })
    expect(bounced.redTests).toEqual([one.file])
    expect(bounced.redTests).not.toContain(flaky)
    expect(bounced.changedTheirAnswer).toEqual([flaky])
    const says = String(bounced.says)
    expect(says).toContain(`MOLE_OFFICE_GATE_FLAKY is at block, so nothing was filed for these files that changed their answer: ${flaky}.`)
    expect(says).not.toContain('so the entry bounces even though its run was green')
    expect(says).toContain('did not pass its exact named files')
    expect(says).toContain(problem.id)
    expect(says).toContain('Each was rerun alone on the same tree and stayed red.')
    expect(problems()).toHaveLength(before)
    expect(t.api.getRecord(problem.id)!.data.state).toBe('open')
  } finally {
    const was = saved.get('MOLE_OFFICE_GATE_FLAKY')
    if (was === undefined) delete process.env.MOLE_OFFICE_GATE_FLAKY
    else process.env.MOLE_OFFICE_GATE_FLAKY = was
  }
})
it('refuses a take-out naming a hand-back', async () => {
  const { one, problem } = await handBack()
  await expect(repair(problem.id, one, 'takeout')).rejects.toThrow('a take-back is filed by the office alone')
})
it('preserves end recipients and makes repair failure precede green in the move table', () => {
  const one = ready(), reading = queue.readMergeEntry(t.api.getRecord(one.id)!)
  expect(queue.whoIsToldOfAnEntrysEnd(reading).to).toEqual([author, starter, submitter].map(id => ({ kind: 'agent', id })))
  expect(theMoveAStepMakes('testing', { step: 'tested', green: true, repairPassed: false })).toEqual({ move: 'bounce', reason: 'red' })
  expect(theMoveAStepMakes('testing', { step: 'tested', green: false, handedBack: true })).toEqual({ move: 'stays', because: 'handed-back' })
})
it('declares safe defaults and refuses invalid numeric and gate values by name at the settings door', async () => {
  const config = await import('../src/config/settings.mjs')
  for (const [name, fallback] of [['MOLE_OFFICE_GATE_FEW_FEATURE_REDS', 'block'], ['MOLE_OFFICE_FEW_RED_FILES', '3'], ['MOLE_OFFICE_HAND_BACK_HOURS', '24']]) {
    expect(config.readSetting(name!, {}).value).toBe(fallback)
    for (const value of name!.endsWith('REDS') ? ['wide'] : ['0', '-1', '1.2', 'no']) {
      expect(() => config.readSetting(name!, { [name!]: value })).toThrow(name)
      const result = await app.inject({ method: 'POST', url: '/api/office/settings', headers, payload: { changes: [{ name, value }], because: 'Measure hand-back bounds.' } })
      expect(result.statusCode, result.body).toBe(400); expect(result.body).toContain(name)
    }
  }
})


it('requires the house-rule gate again at landing and clears the old decision on a new tested report', async () => {
  process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = 'remind'; process.env.MOLE_OFFICE_GATE_HOUSE_RULES = 'remind'
  const house = 'tests/landing-house.test.ts', one = ready(undefined, { house })
  await tested(one, { redTests: [one.file, house] })
  process.env.MOLE_OFFICE_GATE_HOUSE_RULES = 'block'
  await expect(step(one, 'landing', { mainAt: one.mainAt })).rejects.toThrow('MOLE_OFFICE_GATE_HOUSE_RULES is now at block')
  await tested(one, { green: true, redTests: undefined })
  const receipt = (await land(one)).entry.machine?.['integrated'] as { tests: { mergeClass?: unknown } }
  expect(receipt.tests.mergeClass).toBeUndefined()
})
it('bounces failed commands, refuses empty red lists, and bounces mismatched repair files', async () => {
  process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = 'remind'
  const empty = ready(), before = t.api.getRecord(empty.id)
  await expect(tested(empty, { redTests: [] })).rejects.toMatchObject({ status: 422 })
  expect(t.api.getRecord(empty.id)).toEqual(before)
  const unnamed = await tested(ready(), { redTests: ['npm test'] })
  expect(unnamed.entry.state).toBe('bounced'); expect(unnamed.decided).toContain('without naming a file')
  const { one, problem } = await handBack(), next = await repair(problem.id, one)
  const result = await tested(next, { green: true, redTests: undefined, repair: { problem: problem.id, files: [{ file: 'tests/some-other.test.ts', passed: true }] } })
  expect(result.entry.state).toBe('bounced'); expect(result.decided).toContain(one.file)
})


it('gives class three only its first cause, even when privacy appears before safety', async () => {
  const privacy = 'tests/first-privacy.test.ts', safety = 'tests/second-safety.test.ts'
  const inventory = `export const HOUSE_RULES = {\n  '${privacy}': { class: 'P', kind: 'privacy' },\n  '${safety}': { class: 'S', kind: 'safety' },\n}\n`
  for (const build of [{ passed: false }, { passed: true }]) {
    const one = ready(privacy, { house: safety, inventory })
    const result = await tested(one, { redTests: [privacy, safety], build })
    expect(result.entry.state).toBe('bounced')
    expect(result.decided).toContain(build.passed ? `A safety house-rule test is red: ${safety}.` : 'The build failed.')
    expect(result.decided).not.toContain('class P')
    expect(result.decided).not.toContain('A privacy house-rule test is red')
    if (!build.passed) expect(result.decided).not.toContain('A safety house-rule test is red')
  }
})


it('reads stored repair references strictly rather than trusting a cast', () => {
  const one = ready()
  const original = (t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(one.id) as { data: string }).data
  try {
    for (const repairOf of [{ problem: 'held-problem', files: [one.file], extra: true }, { problem: 'held-problem' }, { problem: '', files: [one.file] }, { problem: 'held-problem', files: [42] }]) {
      t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.repairOf', json(?)) WHERE id = ?").run(JSON.stringify(repairOf), one.id)
      expect(() => queue.readMergeEntry(t.api.getRecord(one.id)!)).toThrow()
    }
  } finally { t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(original, one.id) }
})

it('counts each admitted class two once in its position, while landing, a wrong tested tip and class three count nothing', async () => {
  const counts = () => t.client.sqlite.prepare("SELECT COALESCE(SUM(would_stop), 0) AS would_stop, COALESCE(SUM(stopped), 0) AS stopped, COALESCE(SUM(reminded), 0) AS reminded FROM gate_counts WHERE gate = 'few-feature-reds'").get() as { would_stop: number; stopped: number; reminded: number }
  for (const position of ['block', 'remind', 'off']) {
    process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = position
    const before = counts(), one = ready()
    expect((await tested(one)).entry.state).toBe(position === 'block' ? 'bounced' : 'testing')
    const expected = { would_stop: before.would_stop + 1, stopped: before.stopped + (position === 'block' ? 1 : 0), reminded: before.reminded + (position === 'remind' ? 1 : 0) }
    expect(counts()).toEqual(expected)
    if (position !== 'block') await land(one)
    expect(counts()).toEqual(expected)
    expect((await tested(ready(), { tip: 'made-up-wrong-tested-tip' })).entry.state).toBe('bounced')
    expect((await tested(ready(), { build: { passed: false } })).entry.state).toBe('bounced')
    expect(counts()).toEqual(expected)
  }
})

function gateCounts(gate: string) {
  return t.client.sqlite.prepare('SELECT COALESCE(SUM(would_stop), 0) AS would_stop, COALESCE(SUM(stopped), 0) AS stopped, COALESCE(SUM(reminded), 0) AS reminded, COALESCE(SUM(ignored), 0) AS ignored FROM gate_counts WHERE gate = ?').get(gate) as { would_stop: number; stopped: number; reminded: number; ignored: number }
}

it('counts the house-rule gate on a class-two entry it stops, and each gate in its own position', async () => {
  process.env.MOLE_OFFICE_FEW_RED_FILES = '1'
  process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = 'remind'
  process.env.MOLE_OFFICE_GATE_HOUSE_RULES = 'block'
  const house = 'tests/stopped-house.test.ts'
  const one = ready(undefined, { house }), houseBefore = gateCounts('house-rule-reds'), fewBefore = gateCounts('few-feature-reds')
  const result = await tested(one, { redTests: [one.file, house] })
  expect(result.entry.state).toBe('bounced')
  expect(result.decided).toContain('MOLE_OFFICE_GATE_HOUSE_RULES is at block')
  expect(gateCounts('house-rule-reds')).toEqual({ ...houseBefore, would_stop: houseBefore.would_stop + 1, stopped: houseBefore.stopped + 1 })
  expect(gateCounts('few-feature-reds')).toEqual({ ...fewBefore, would_stop: fewBefore.would_stop + 1, reminded: fewBefore.reminded + 1 })
  expect(gateCounts('house-rule-reds').ignored).toBe(0)
  expect(gateCounts('few-feature-reds').ignored).toBe(0)

  process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = 'block'
  const both = ready(undefined, { house }), houseBoth = gateCounts('house-rule-reds'), fewBoth = gateCounts('few-feature-reds')
  expect((await tested(both, { redTests: [both.file, house] })).entry.state).toBe('bounced')
  expect(gateCounts('house-rule-reds')).toEqual({ ...houseBoth, would_stop: houseBoth.would_stop + 1, stopped: houseBoth.stopped + 1 })
  expect(gateCounts('few-feature-reds')).toEqual({ ...fewBoth, would_stop: fewBoth.would_stop + 1, stopped: fewBoth.stopped + 1 })
})

it('counts the house-rule gate on a class-two entry it reminds, and landing adds nothing', async () => {
  process.env.MOLE_OFFICE_FEW_RED_FILES = '1'
  process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = 'remind'
  process.env.MOLE_OFFICE_GATE_HOUSE_RULES = 'remind'
  const house = 'tests/reminded-house.test.ts'
  const one = ready(undefined, { house }), houseBefore = gateCounts('house-rule-reds'), fewBefore = gateCounts('few-feature-reds')
  const result = await tested(one, { redTests: [one.file, house] })
  expect(result.entry.state).toBe('testing')
  expect(result.decided).toContain('may land, handed back')
  const houseAfter = { ...houseBefore, would_stop: houseBefore.would_stop + 1, reminded: houseBefore.reminded + 1 }
  const fewAfter = { ...fewBefore, would_stop: fewBefore.would_stop + 1, reminded: fewBefore.reminded + 1 }
  expect(gateCounts('house-rule-reds')).toEqual(houseAfter)
  expect(gateCounts('few-feature-reds')).toEqual(fewAfter)
  await land(one)
  expect(gateCounts('house-rule-reds')).toEqual(houseAfter)
  expect(gateCounts('few-feature-reds')).toEqual(fewAfter)

  process.env.MOLE_OFFICE_GATE_HOUSE_RULES = 'off'
  const off = ready(undefined, { house }), offBefore = gateCounts('house-rule-reds'), offFewBefore = gateCounts('few-feature-reds')
  expect((await tested(off, { redTests: [off.file, house] })).entry.state).toBe('testing')
  expect(gateCounts('house-rule-reds')).toEqual({ ...offBefore, would_stop: offBefore.would_stop + 1 })
  expect(gateCounts('few-feature-reds')).toEqual({ ...offFewBefore, would_stop: offFewBefore.would_stop + 1, reminded: offFewBefore.reminded + 1 })
  await land(off)
  expect(gateCounts('house-rule-reds')).toEqual({ ...offBefore, would_stop: offBefore.would_stop + 1 })
})

it('counts nothing on the house-rule row for a class-two entry with no house-rule file', async () => {
  process.env.MOLE_OFFICE_FEW_RED_FILES = '1'
  process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = 'remind'
  process.env.MOLE_OFFICE_GATE_HOUSE_RULES = 'block'
  const before = gateCounts('house-rule-reds'), fewBefore = gateCounts('few-feature-reds')
  expect((await tested(ready())).entry.state).toBe('testing')
  expect(gateCounts('house-rule-reds')).toEqual(before)
  expect(gateCounts('few-feature-reds')).toEqual({ ...fewBefore, would_stop: fewBefore.would_stop + 1, reminded: fewBefore.reminded + 1 })
})
