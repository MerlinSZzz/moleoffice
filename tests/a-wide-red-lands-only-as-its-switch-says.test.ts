// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic offices and git trees measure wide-red admission, durable checks, filing and notices.
 * Mutations: broaden causes; skip cause/position/file checks; remove narrower gates; file at off;
 * put wide red before take-back; skip the landing refusal; count nothing where a class three is decided; count
 * only wide red there; count at landing as well. Each is measured by the cases below.
 */
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, afterEach, expect, it } from 'vitest'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { theProblemRowsAReadingReads } from './the-problem-rows-a-reading-reads.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { redMergeAuthorizesLanding } from '../src/shared/merge-class.ts'
import { theMoveAStepMakes } from '../src/shared/merge-queue.ts'
import { mergeTestsAuthorizeLanding } from '../src/config/whole-suite-red.mjs'
let t: TestDb, app: FastifyInstance, home: string
let door: typeof import('../src/server/lib/merge-entry-door.ts')
let queue: typeof import('../src/server/lib/merge-queue.ts')
let starter: string, author: string, submitter: string, secretary: string, round: string
let counter: ReturnType<typeof theProblemRowsAReadingReads>
const madeUpProblems = new Map<string, string>()
const names = ['HOME', 'MOLE_OFFICE_GATE_WIDE_RED', 'MOLE_OFFICE_BUILD_SHERIFF', 'MOLE_OFFICE_GATE_FEW_FEATURE_REDS', 'MOLE_OFFICE_FEW_RED_FILES', 'MOLE_OFFICE_HAND_BACK_HOURS', 'MOLE_OFFICE_GATE_HOUSE_RULES', 'MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND']
const saved = new Map(names.map(name => [name, process.env[name]]))
const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': person.id }
function git(dir: string, ...args: string[]) { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'wide-red-office-')); process.env.HOME = home
  for (const name of names.slice(1)) delete process.env[name]
  t = await freshDb()
  for (const [marker, entry] of [['a made-up ordinary symptom <sample-a>', undefined], ['a made-up wide-red symptom <sample-b>', 'made-up-entry-of-another-line'], ['a made-up wide-red symptom <sample-c>', 14]] as const) {
    const problem = t.api.createRecord({ kind: 'problem', title: 'A made-up problem a landing must not read', workspaceId: 'default', actor: person, origin: 'fixture',
      data: { state: 'open', symptom: marker, ...(entry === undefined ? {} : { extra: { wideRed: { entry } } }) } })
    madeUpProblems.set(problem.id, marker)
  }
  counter = theProblemRowsAReadingReads(t, madeUpProblems)
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  door = await import('../src/server/lib/merge-entry-door.ts'); queue = await import('../src/server/lib/merge-queue.ts')
  const start = async (role: string, by: Record<string, string> = headers) => {
    const result = await app.inject({ method: 'POST', url: '/api/agents/started', headers: by, payload: { handle: randomUUID(), name: 'A synthetic participant', role, ...(role === 'secretary' ? {} : { workArea: ['tests'] }) } })
    expect(result.statusCode, result.body).toBe(201); return String(result.json().agent.id)
  }
  starter = await start('supervisor'); secretary = await start('secretary'); submitter = await start('worker')
  const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  author = await start('worker', { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': starter, 'x-mole-office-key': makeAnAgentKey(starter, null) })
  round = t.api.createRecord({ kind: 'session', title: 'A synthetic open round', workspaceId: 'default', actor: person, origin: 'fixture', data: { state: 'running', servingAgentId: starter } }).id
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
const notices = (run: string) => t.api.listRecords({ workspaceId: 'default', kind: 'message' }).filter(one => one.data.aboutRun === run && one.data.notice === 'landedWithAWideRed')
async function land(one: Entry) { await step(one, 'landing', { mainAt: one.mainAt }); return step(one, 'landed', { mainAfter: one.tip }) }
function gateCounts(gate: string) {
  return t.client.sqlite.prepare('SELECT COALESCE(SUM(would_stop), 0) AS would_stop, COALESCE(SUM(stopped), 0) AS stopped, COALESCE(SUM(reminded), 0) AS reminded FROM gate_counts WHERE gate = ?').get(gate) as { would_stop: number; stopped: number; reminded: number }
}
const inventory = (file: string, klass: string, house?: string) => `export const HOUSE_RULES = {
  '${file}': { class: '${klass}', kind: 'synthetic' },
${house === undefined ? '' : `  '${house}': { class: 'H', kind: 'synthetic' },
`}}
`
function safety(house?: string) {
  const file = `tests/${randomUUID()}.test.ts`
  return ready(file, { house, inventory: inventory(file, 'S', house) })
}
function remind() { process.env.MOLE_OFFICE_GATE_WIDE_RED = 'remind'; process.env.MOLE_OFFICE_BUILD_SHERIFF = submitter }
function wideProblem(one: Entry) {
  const found = problems().filter(p => (p.data.extra as { wideRed?: { entry: string } } | undefined)?.wideRed?.entry === one.id)
  expect(found).toHaveLength(1); return found[0]!
}
it('1 default block bounces a safety red and names the gate', async () => {
  const one = safety(), result = await tested(one)
  expect(result.entry.state).toBe('bounced'); expect(result.entry.machine?.['bounced']).toMatchObject({ reason: 'red' })
  expect(result.decided).toContain(one.file); expect(result.decided).toContain('MOLE_OFFICE_GATE_WIDE_RED is at block')
})
it('2 remind lands a safety red and files all files once for sheriff and secretary', async () => {
  remind(); process.env.MOLE_OFFICE_GATE_HOUSE_RULES = 'remind'
  const house = `tests/${randomUUID()}.test.ts`, one = safety(house), before = problems().length
  const result = await tested(one, { redTests: [one.file, house] })
  expect(result.entry.state).toBe('testing'); expect(result.decided).toContain('may land with a wide red')
  expect((result.entry as any).machine.tested.mergeClass).toMatchObject({ class: 3, cause: 4 })
  const { stateInWords } = await import('../src/web/pages/MergeQueuePage.tsx')
  expect(stateInWords(result.entry as any, null).word).toBe('may land, wide red')
  expect((await land(one)).entry.state).toBe('merged')
  expect(problems()).toHaveLength(before + 1)
  const problem = wideProblem(one)
  expect(problem.title).toBe('Landed with a wide red: A synthetic feature entry')
  expect(problem.data).toMatchObject({ state: 'open', whose_move: 'agent', seen_in: [one.file, house], extra: { redOnMainFamily: true, wideRed: { cause: 4, files: [one.file, house], commits: [one.tip], buildSheriff: expect.any(String) } } })
  for (const text of [one.id, 'A synthetic feature entry', `A safety house-rule test is red: ${one.file}.`, one.file, house, one.tip, 'remind', 'fixed', 'fix']) expect(problem.data.symptom).toContain(text)
  const messages = notices(one.run); expect(messages).toHaveLength(2)
  expect(messages.flatMap(m => m.data.to)).toEqual(expect.arrayContaining([submitter, secretary].map(id => ({ kind: 'agent', id }))))
  for (const message of messages) expect(String(message.data.body).split('\n')).toHaveLength(1)
  const next = safety(); await step(next, 'red-on-main', { mainAt: one.tip, files: [{ file: one.file }, { file: house }] })
  expect(problems()).toHaveLength(before + 1)
  const duplicate = safety(); await tested(duplicate)
  const prior = t.api.createRecord({ kind: 'problem', title: 'A synthetic existing wide-red problem', workspaceId: 'default', actor: person, origin: 'fixture', data: { state: 'open', extra: { wideRed: { entry: duplicate.id } } } })
  const count = problems().length
  expect((await land(duplicate)).decided).toContain(`Wide-red problem ${prior.id} already holds this entry; nothing was filed again.`)
  expect(problems()).toHaveLength(count); expect(notices(duplicate.run)).toHaveLength(0)
})
it('2b three stored gate positions are kept apart on a class-3 decision', async () => {
  remind(); process.env.MOLE_OFFICE_GATE_HOUSE_RULES = 'off'; process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = 'block'
  const house = `tests/${randomUUID()}.test.ts`, one = safety(house)
  const result = await tested(one, { redTests: [one.file, house] })
  expect(result.entry.state).toBe('testing'); expect(result.decided).toContain('may land with a wide red')
  expect((result.entry as any).machine.tested.mergeClass).toMatchObject({ class: 3, cause: 4, position: 'remind', houseRulesPosition: 'off', fewFeatureRedsPosition: 'block' })
})
it('3 off lands a database change without filing or telling anyone', async () => {
  process.env.MOLE_OFFICE_GATE_WIDE_RED = 'off'; process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = 'off'
  const one = ready(undefined, { database: 'drizzle/synthetic.sql' }), before = problems().length
  await tested(one); const result = await land(one)
  expect(result.entry.state).toBe('merged'); expect(result.decided).toContain('MOLE_OFFICE_GATE_WIDE_RED is off; nothing was filed.')
  expect(problems()).toHaveLength(before); expect(notices(one.run)).toHaveLength(0)
  process.env.MOLE_OFFICE_GATE_WIDE_RED = 'remind'
  const next = safety(); await tested(next)
  process.env.MOLE_OFFICE_GATE_WIDE_RED = 'off'
  expect((await land(next)).decided).toContain('MOLE_OFFICE_GATE_WIDE_RED is off; nothing was filed.')
  expect(problems()).toHaveLength(before); expect(notices(next.run)).toHaveLength(0)
})
it('4 too many feature reds need the few-feature-red gate at admission and landing', async () => {
  remind(); process.env.MOLE_OFFICE_FEW_RED_FILES = '1'
  const other = `tests/${randomUUID()}.test.ts`, blocked = ready(undefined, { house: other, inventory: 'export const HOUSE_RULES = {\n}\n' })
  const refused = await tested(blocked, { redTests: [blocked.file, other] })
  expect(refused.entry.state).toBe('bounced'); expect(refused.decided).toContain('MOLE_OFFICE_GATE_FEW_FEATURE_REDS is at block')
  process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = 'remind'
  const one = ready(undefined, { house: other, inventory: 'export const HOUSE_RULES = {\n}\n' })
  expect((await tested(one, { redTests: [one.file, other] })).entry.state).toBe('testing')
  process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = 'block'
  await expect(step(one, 'landing', { mainAt: one.mainAt })).rejects.toMatchObject({ status: 409, message: expect.stringContaining('MOLE_OFFICE_GATE_FEW_FEATURE_REDS is now at block') })
  process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = 'remind'
  await land(one); expect(wideProblem(one).data.extra).toMatchObject({ wideRed: { cause: 7 } })
})
it('5 no round open lands at remind', async () => {
  remind(); process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = 'remind'
  const one = ready(undefined, { agent: submitter })
  await tested(one); await land(one); expect(wideProblem(one).data.extra).toMatchObject({ wideRed: { cause: 8 } })
})
it('6 privacy red lands at off', async () => {
  process.env.MOLE_OFFICE_GATE_WIDE_RED = 'off'
  const file = `tests/${randomUUID()}.test.ts`, one = ready(file, { inventory: inventory(file, 'P') })
  await tested(one); expect((await land(one)).entry.state).toBe('merged')
})
it('7 unread facts and failed or unknown builds bounce at remind and off', async () => {
  for (const position of ['remind', 'off']) {
    process.env.MOLE_OFFICE_GATE_WIDE_RED = position
    for (const kind of ['failed', 'unknown', 'not-file', 'unreadable-list', 'wrong-tip']) {
      const one = kind === 'unreadable-list' ? ready(undefined, { inventory: 'unreadable synthetic list' }) : safety()
      const more = kind === 'failed' ? { build: { passed: false } } : kind === 'unknown' ? { build: undefined } : kind === 'not-file' ? { redTests: ['synthetic command, not a file'] } : kind === 'wrong-tip' ? { tip: one.mainAt } : {}
      const result = await tested(one, more)
      expect(result.entry.state, kind).toBe('bounced'); expect(result.entry.machine?.['bounced']).toMatchObject({ reason: 'red' })
      expect(result.decided).toContain('refused at every position of MOLE_OFFICE_GATE_WIDE_RED')
      if (kind === 'failed' || kind === 'unknown') expect(result.decided).toContain("a main that does not build stops every line's rebase and every whole-suite receipt")
    }
  }
})
it('8 moved-back wide gate refuses new landing without writes and permits an already begun landing', async () => {
  remind(); const one = safety(); await tested(one)
  const before = t.api.getRecord(one.id), count = problems().length
  process.env.MOLE_OFFICE_GATE_WIDE_RED = 'block'
  await expect(step(one, 'landing', { mainAt: one.mainAt })).rejects.toMatchObject({ status: 409, message: `Merge entry ${one.id} was admitted with a wide red, and MOLE_OFFICE_GATE_WIDE_RED is now at block, so it may not land. Nothing was written.` })
  expect(t.api.getRecord(one.id)).toEqual(before); expect(problems()).toHaveLength(count)
  process.env.MOLE_OFFICE_GATE_WIDE_RED = 'remind'; await step(one, 'landing', { mainAt: one.mainAt })
  process.env.MOLE_OFFICE_GATE_WIDE_RED = 'block'; expect((await step(one, 'landed', { mainAfter: one.tip })).entry.state).toBe('merged')
})
it('9 a plain house rule beside safety needs its own gate at admission and landing', async () => {
  remind(); const house = `tests/${randomUUID()}.test.ts`, blocked = safety(house)
  const refused = await tested(blocked, { redTests: [blocked.file, house] })
  expect(refused.entry.state).toBe('bounced'); expect(refused.decided).toContain('MOLE_OFFICE_GATE_HOUSE_RULES is at block')
  process.env.MOLE_OFFICE_GATE_HOUSE_RULES = 'remind'; const one = safety(house)
  await tested(one, { redTests: [one.file, house] }); process.env.MOLE_OFFICE_GATE_HOUSE_RULES = 'block'
  await expect(step(one, 'landing', { mainAt: one.mainAt })).rejects.toMatchObject({ status: 409, message: expect.stringContaining('MOLE_OFFICE_GATE_HOUSE_RULES is now at block') })
})
it('10 tampered decisions never authorize and passed positions are checked independently', () => {
  const decision = { class: 3, cause: 8, mainAt: 'synthetic-main', files: [{ file: 'tests/synthetic.test.ts' }], featureFiles: ['tests/synthetic.test.ts'], houseRuleFiles: [], reason: 'Synthetic no round.', build: true, databasePaths: [], roundOpen: { open: false, reason: 'Synthetic closed round.' }, fewRedFiles: 1, position: 'remind', houseRulesPosition: 'remind', fewFeatureRedsPosition: 'remind' }
  const run = (mergeClass: any) => ({ green: false, tip: 'synthetic-tip', redTests: ['tests/synthetic.test.ts'], mergeClass })
  expect(redMergeAuthorizesLanding(run(decision), 'synthetic-tip', { wideRed: 'remind' } as any)).toBe(true)
  expect(redMergeAuthorizesLanding({ ...run(decision), redTests: ['tests/other.test.ts'] })).toBe(false)
  expect(redMergeAuthorizesLanding(run(decision), 'another-synthetic-tip')).toBe(false)
  for (const more of [{ cause: 3 }, { cause: 6 }, { cause: 7 }, { featureFiles: [] }, { houseRuleFiles: ['tests/synthetic-house.test.ts'] }, { position: 'block' }, { files: [{ file: 'tests/other.test.ts' }] }]) expect(redMergeAuthorizesLanding(run({ ...decision, ...more }))).toBe(false)
  for (const positions of [{ wideRed: 'block' }, { fewFeatureReds: 'block' }]) expect(redMergeAuthorizesLanding(run(decision), 'synthetic-tip', positions as any)).toBe(false)
  expect(mergeTestsAuthorizeLanding(run(decision), 'synthetic-tip', undefined, false, 'remind', 'remind', 'block')).toBe(false)
  expect(mergeTestsAuthorizeLanding(run(decision), 'synthetic-tip', undefined, false, 'remind', 'remind', 'remind')).toBe(true)
  expect(redMergeAuthorizesLanding(run({ ...decision, fewFeatureRedsPosition: 'block' }))).toBe(false)
  const withHouse = { ...decision, files: [...decision.files, { file: 'tests/synthetic-house.test.ts', class: 'H', kind: 'synthetic' }], houseRuleFiles: ['tests/synthetic-house.test.ts'] }
  expect(redMergeAuthorizesLanding({ ...run(withHouse), redTests: withHouse.files.map(f => f.file) }, 'synthetic-tip', { houseRules: 'block' })).toBe(false)
  expect(redMergeAuthorizesLanding({ ...run({ ...withHouse, houseRulesPosition: 'block' }), redTests: withHouse.files.map(f => f.file) })).toBe(false)
})
it('11 no sheriff named still files the problem and says nobody was told as sheriff', async () => {
  process.env.MOLE_OFFICE_GATE_WIDE_RED = 'remind'
  const one = safety(); await tested(one)
  expect((await land(one)).decided).toContain('no sheriff was told'); wideProblem(one)
})
it('12 move table keeps take-back and failed repair ahead of wide red', () => {
  expect(theMoveAStepMakes('testing', { step: 'tested', green: false, wideRed: true } as any)).toEqual({ move: 'stays', because: 'wide-red' })
  for (const more of [{ takeBack: true }, { repairPassed: false }]) expect(theMoveAStepMakes('testing', { step: 'tested', green: false, wideRed: true, ...more } as any)).toEqual({ move: 'bounce', reason: 'red' })
})
it('13 counts the wide-red gate once in its position where the office decides a class three, and nothing for unread facts or at landing', async () => {
  const counts = () => t.client.sqlite.prepare("SELECT COALESCE(SUM(would_stop), 0) AS would_stop, COALESCE(SUM(stopped), 0) AS stopped, COALESCE(SUM(reminded), 0) AS reminded FROM gate_counts WHERE gate = 'wide-red'").get() as { would_stop: number; stopped: number; reminded: number }
  for (const position of ['block', 'remind', 'off']) {
    process.env.MOLE_OFFICE_GATE_WIDE_RED = position
    const before = counts()
    expect((await tested(safety(), { build: { passed: false } })).entry.state, position).toBe('bounced')
    expect(counts(), `${position}: unread facts`).toEqual(before)
    const one = safety(), result = await tested(one)
    expect(result.entry.state, position).toBe(position === 'block' ? 'bounced' : 'testing')
    const expected = { would_stop: before.would_stop + 1, stopped: before.stopped + (position === 'block' ? 1 : 0), reminded: before.reminded + (position === 'remind' ? 1 : 0) }
    expect(counts(), position).toEqual(expected)
    if (position === 'block') continue
    expect((await land(one)).entry.state, position).toBe('merged')
    expect(counts(), `${position}: landing`).toEqual(expected)
  }
})
it('14 counts the house-rule gate once in its position where the office decides a class three holding a house-rule file', async () => {
  remind()
  for (const position of ['block', 'remind', 'off']) {
    process.env.MOLE_OFFICE_GATE_HOUSE_RULES = position
    const house = `tests/${randomUUID()}.test.ts`, one = safety(house)
    const beforeHouse = gateCounts('house-rule-reds'), beforeFew = gateCounts('few-feature-reds'), beforeWide = gateCounts('wide-red')
    const result = await tested(one, { redTests: [one.file, house] })
    expect(result.entry.state, position).toBe(position === 'block' ? 'bounced' : 'testing')
    const houseExpected = { would_stop: beforeHouse.would_stop + 1, stopped: beforeHouse.stopped + (position === 'block' ? 1 : 0), reminded: beforeHouse.reminded + (position === 'remind' ? 1 : 0) }
    const wideExpected = { would_stop: beforeWide.would_stop + 1, stopped: beforeWide.stopped, reminded: beforeWide.reminded + 1 }
    expect(gateCounts('house-rule-reds'), `${position}: the house-rule row`).toEqual(houseExpected)
    expect(gateCounts('few-feature-reds'), `${position}: no feature file`).toEqual(beforeFew)
    expect(gateCounts('wide-red'), `${position}: the wide-red row`).toEqual(wideExpected)
    if (position === 'block') continue
    expect((result.entry as any).machine.tested.mergeClass).toMatchObject({ class: 3, cause: 4, houseRuleFiles: [house], featureFiles: [] })
    expect((await land(one)).entry.state, position).toBe('merged')
    expect(gateCounts('house-rule-reds'), `${position}: landing`).toEqual(houseExpected)
    expect(gateCounts('few-feature-reds'), `${position}: landing`).toEqual(beforeFew)
    expect(gateCounts('wide-red'), `${position}: landing`).toEqual(wideExpected)
  }
})
it('15 counts the few-feature-red gate once in its position where the office decides a class three holding feature files', async () => {
  remind(); process.env.MOLE_OFFICE_FEW_RED_FILES = '1'
  for (const position of ['block', 'remind', 'off']) {
    process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = position
    const other = `tests/${randomUUID()}.test.ts`, one = ready(undefined, { house: other, inventory: 'export const HOUSE_RULES = {\n}\n' })
    const beforeFew = gateCounts('few-feature-reds'), beforeHouse = gateCounts('house-rule-reds'), beforeWide = gateCounts('wide-red')
    const result = await tested(one, { redTests: [one.file, other] })
    expect(result.entry.state, position).toBe(position === 'block' ? 'bounced' : 'testing')
    const fewExpected = { would_stop: beforeFew.would_stop + 1, stopped: beforeFew.stopped + (position === 'block' ? 1 : 0), reminded: beforeFew.reminded + (position === 'remind' ? 1 : 0) }
    const wideExpected = { would_stop: beforeWide.would_stop + 1, stopped: beforeWide.stopped, reminded: beforeWide.reminded + 1 }
    expect(gateCounts('few-feature-reds'), `${position}: the few-feature-red row`).toEqual(fewExpected)
    expect(gateCounts('house-rule-reds'), `${position}: no house-rule file`).toEqual(beforeHouse)
    expect(gateCounts('wide-red'), `${position}: the wide-red row`).toEqual(wideExpected)
    if (position === 'block') continue
    expect((result.entry as any).machine.tested.mergeClass).toMatchObject({ class: 3, cause: 7, houseRuleFiles: [], featureFiles: expect.arrayContaining([one.file, other]) })
    expect((await land(one)).entry.state, position).toBe('merged')
    expect(gateCounts('few-feature-reds'), `${position}: landing`).toEqual(fewExpected)
    expect(gateCounts('house-rule-reds'), `${position}: landing`).toEqual(beforeHouse)
    expect(gateCounts('wide-red'), `${position}: landing`).toEqual(wideExpected)
  }
})
it('16 a class three with no house-rule file counts nothing on the house-rule row, and one with no feature file nothing on the few-feature-red row', async () => {
  remind()
  for (const position of ['block', 'remind', 'off']) {
    process.env.MOLE_OFFICE_GATE_HOUSE_RULES = position; process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = position
    const beforeHouse = gateCounts('house-rule-reds'), beforeFew = gateCounts('few-feature-reds')
    const one = safety()
    expect((await tested(one)).entry.state, position).toBe('testing')
    expect(gateCounts('house-rule-reds'), `${position}: no house-rule file`).toEqual(beforeHouse)
    expect(gateCounts('few-feature-reds'), `${position}: no feature file`).toEqual(beforeFew)
  }
})
it('17 unread facts count nothing on the house-rule or few-feature-red row', async () => {
  remind(); process.env.MOLE_OFFICE_FEW_RED_FILES = '1'; process.env.MOLE_OFFICE_GATE_HOUSE_RULES = 'remind'; process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = 'remind'
  const house = `tests/${randomUUID()}.test.ts`, withHouse = safety(house)
  let beforeHouse = gateCounts('house-rule-reds'), beforeFew = gateCounts('few-feature-reds'), beforeWide = gateCounts('wide-red')
  expect((await tested(withHouse, { redTests: [withHouse.file, house], build: { passed: false } })).entry.state).toBe('bounced')
  expect(gateCounts('house-rule-reds'), 'failed build with a house-rule file: the house-rule row').toEqual(beforeHouse)
  expect(gateCounts('few-feature-reds'), 'failed build with a house-rule file: the few-feature-red row').toEqual(beforeFew)
  expect(gateCounts('wide-red'), 'failed build with a house-rule file: the wide-red row').toEqual(beforeWide)
  const other = `tests/${randomUUID()}.test.ts`, withFeatures = ready(undefined, { house: other, inventory: 'export const HOUSE_RULES = {\n}\n' })
  beforeHouse = gateCounts('house-rule-reds'); beforeFew = gateCounts('few-feature-reds'); beforeWide = gateCounts('wide-red')
  expect((await tested(withFeatures, { redTests: [withFeatures.file, other], build: { passed: false } })).entry.state).toBe('bounced')
  expect(gateCounts('house-rule-reds'), 'failed build with feature files: the house-rule row').toEqual(beforeHouse)
  expect(gateCounts('few-feature-reds'), 'failed build with feature files: the few-feature-red row').toEqual(beforeFew)
  expect(gateCounts('wide-red'), 'failed build with feature files: the wide-red row').toEqual(beforeWide)
})
it('18 a landing reads only the wide-red problem of its own entry', async () => {
  remind()
  const one = safety()
  await tested(one)
  await step(one, 'landing', { mainAt: one.mainAt })
  counter.reset()
  const landed = await step(one, 'landed', { mainAfter: one.tip })
  expect(landed.entry.state).toBe('merged')
  const read = counter.read(), madeUp = [...madeUpProblems.keys()]
  expect(read.problemIds.filter(id => madeUp.includes(id))).toEqual([])
  expect(read.wholeProblemIds.filter(id => madeUp.includes(id))).toEqual([])
  wideProblem(one)
})
