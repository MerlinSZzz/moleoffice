// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE TAKES BACK ONLY THE EXACT LANDED TREE.
 * Measures a real temporary office with its own HOME, database and kernel-chosen port. It reads git,
 * registry and settings independently, files one hand-back with a zoned deadline, deduplicates reds,
 * checks ordinary repairs and closes only on landing. The starter's ledger owns this test process.
 * Mutations: ignore exact tree, deadline, closure, duplicate, caller, main touch or recipients; count H toward N; ignore retirement; assume build; always remind; always off
 * at landing; omit red-on-main family; ignore repair results; omit closure. Each named case goes red.
 * Where it moves a stored due time, it writes dueAt with the deadline, as the office stores both since wave 13u round 73.
 */
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmodSync, readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, afterEach, expect, it } from 'vitest'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { stampInZone, momentOfStampInZone } from '../src/shared/time.ts'
import { theMoveAStepMakes } from '../src/shared/merge-queue.ts'
let t: TestDb, app: FastifyInstance, home: string
let door: typeof import('../src/server/lib/merge-entry-door.ts')
let queue: typeof import('../src/server/lib/merge-queue.ts')
let starter: string, author: string, submitter: string, secretary: string, round: string
const names = ['HOME', 'MOLE_OFFICE_GATE_FEW_FEATURE_REDS', 'MOLE_OFFICE_FEW_RED_FILES', 'MOLE_OFFICE_HAND_BACK_HOURS', 'MOLE_OFFICE_GATE_HOUSE_RULES', 'MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND']
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

const worker = { type: 'agent', id: 'mole-office/the-message-worker' } as const
async function takeBacks() { return (await import('../src/server/lib/take-back.ts')).takeBacksForProject('default') }
/** Synthetic fixture: a due time the office moves to `ms` from now, written as fileAHandBackProblem writes one. */
function dueIn(ms: number) { const at = Date.now() + ms; return { deadline: stampInZone(at, 'UTC'), timeZone: 'UTC', dueAt: new Date(at).toISOString() } }
async function due() {
  const result = await handBack()
  const { THE_OFFICE } = await import('../src/server/lib/inspection.ts')
  const extra = result.problem.data.extra as Record<string, unknown>
  // Synthetic fixture: the office rewrites its own stored deadline into the past.
  t.api.patchRecord(result.problem.id, { dataPatch: { extra: { ...extra, handBack: { ...(extra.handBack as object), ...dueIn(-3_600_000), hours: 1 } } } }, THE_OFFICE)
  return result
}
async function prepared() {
  const s = await due(), clone = mkdtempSync(join(home, 'take-back-'))
  git(s.one.dir, 'clone', '--no-local', '--no-checkout', s.one.dir, clone)
  git(clone, 'config', 'user.name', 'Synthetic queue'); git(clone, 'config', 'user.email', 'fixture@example.invalid')
  git(clone, 'checkout', '-b', 'take-back/synthetic', s.one.tip)
  git(clone, 'revert', '--no-commit', s.one.tip); git(clone, 'commit', '-qm', 'Synthetic take-back')
  const repos = await import('../src/server/lib/repositories.ts')
  const repo = repos.registerRepository({ workspaceId: 'default', name: randomUUID(), root: s.one.dir, actor: person })
  return { ...s, clone, repo, branch: 'take-back/synthetic' }
}
type Prepared = Awaited<ReturnType<typeof prepared>>
async function submit(s: Prepared) {
  return (await import('../src/server/lib/take-back.ts')).submitATakeBack({ workspaceId: 'default', problem: s.problem.id, workingDirectory: s.clone, branch: s.branch, actor: worker, stillRed: redEvidence(s) })
}
const counts = () => t.client.sqlite.prepare('SELECT (SELECT count(*) FROM records) AS records, (SELECT count(*) FROM revisions) AS revisions').get()
async function refused(s: Prepared, words: RegExp) {
  const before = counts(); await expect(submit(s)).rejects.toThrow(words); expect(counts()).toEqual(before)
}
const takeNotices = (run: string) => t.api.listRecords({ workspaceId: 'default', kind: 'message' }).filter(m => m.data.aboutRun === run)
it('lists due after its deadline and leaves future deadlines out', async () => {
  const future = await handBack(), past = await due(), list = await takeBacks()
  expect(list.due.map(x => x.problem)).toContain(past.problem.id); expect(list.due.map(x => x.problem)).not.toContain(future.problem.id)
  const response = await app.inject({ method: 'GET', url: '/api/worker/merges', headers })
  expect(response.json().note).toContain('1 hand-back is due for take-back.')
})
it('leaves a closed hand-back past its deadline out of every list', async () => {
  const closed = await due(); t.api.patchRecord(closed.problem.id, { dataPatch: { state: 'fixed', fix: 'Synthetic closure.' } }, person)
  const list = await takeBacks()
  for (const named of [list.due, list.forAPerson, list.cannotBeRead]) expect(named.map(x => x.problem)).not.toContain(closed.problem.id)
})
it('names main touching a landed path, a missing agent and an unreadable deadline', async () => {
  const touched = await due(); writeFileSync(join(touched.one.dir, touched.one.file), 'main touched it'); git(touched.one.dir, 'commit', '-qam', 'Later main')
  const absent = await due(), bad = await due()
  for (const [s, change] of [[absent, { line: { agent: null, starter, run: round } }], [bad, { deadline: 'not a stamp' }]] as const) {
    const extra = t.api.getRecord(s.problem.id)!.data.extra as { handBack: object }
    t.api.patchRecord(s.problem.id, { dataPatch: { extra: { ...extra, handBack: { ...extra.handBack, ...change } } } }, (await import('../src/server/lib/inspection.ts')).THE_OFFICE)
  }
  // The recursive patch removes null keys; this synthetic stored fixture explicitly retains the nullable agent fact.
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.extra.handBack.line.agent', NULL) WHERE id = ?").run(absent.problem.id)
  const list = await takeBacks()
  expect(list.forAPerson.find(x => x.problem === touched.problem.id)?.says).toContain(touched.one.file)
  expect(list.forAPerson.find(x => x.problem === absent.problem.id)?.says).toContain('agent')
  expect(list.cannotBeRead.find(x => x.problem === bad.problem.id)?.says).toContain('deadline')
})
it('records a person note and tells the secretary exactly once, through the worker-only door', async () => {
  const s = await due(); writeFileSync(join(s.one.dir, s.one.file), 'touch'); git(s.one.dir, 'commit', '-qam', 'Touch')
  const url = `/api/worker/merges/hand-backs/${s.problem.id}/a-person-must-look`
  const denied = await app.inject({ method: 'POST', url, headers, payload: {} }); expect(denied.statusCode).toBe(403)
  const workerHeaders = { ...headers, 'x-mole-office-actor-type': worker.type, 'x-mole-office-actor-id': worker.id }
  const accepted = await app.inject({ method: 'POST', url, headers: workerHeaders, payload: {} }); expect(accepted.statusCode, accepted.body).toBe(200)
  expect(t.api.getRecord(s.problem.id)!.data.extra).toMatchObject({ takeBack: { aPersonMustLook: { says: expect.stringContaining(s.one.file) } } })
  const before = counts(); const again = await app.inject({ method: 'POST', url, headers: workerHeaders, payload: {} }); expect(again.statusCode).toBe(200); expect(counts()).toEqual(before)
  expect((await takeBacks()).forAPerson.map(x => x.problem)).not.toContain(s.problem.id)
  expect(t.api.listRecords({ workspaceId: 'default', kind: 'message' }).filter(m => m.data.notice === 'takeBackNeedsAPerson' && String(m.data.body).includes(s.problem.id))).toHaveLength(1)
})
it('files the finished office run, seal, rule and worker-submitted take-back atomically, then skips the check wait', async () => {
  const s = await prepared(), started = performance.now(), result = await submit(s), entry = result.entry, run = t.api.getRecord(entry.run)!
  console.info(`Office exact take-back check and transaction: ${(performance.now() - started).toFixed(1)} ms.`)
  expect(entry.submittedBy).toEqual({ kind: 'agent', id: worker.id }); expect(entry.fixRound).toEqual({ problem: s.problem.id, kind: 'takeout', reason: 'not fixed in time' })
  expect(entry.title).toBe('Taken back: A synthetic feature entry, not fixed in 1 hour')
  expect(t.api.getRecord(entry.id)!.data.takeBackOf).toEqual({ problem: s.problem.id, entry: s.one.id, commits: [s.one.tip], paths: [s.one.file], hours: 1 })
  expect(run.data).toMatchObject({ state: 'finished', servingAgentId: author, needsNoCheck: { rule: 'a-take-back-returns-main-to-a-checked-state' }, sealedTip: entry.seal.id })
  const first = t.client.sqlite.prepare('SELECT actor_id FROM revisions WHERE record_id = ? ORDER BY seq LIMIT 1').get(run.id) as { actor_id: string }
  expect(first.actor_id).toBe((await import('../src/server/lib/inspection.ts')).THE_OFFICE.id)
  const seal = t.api.getRecord(entry.seal.id)!.data.seal as { git: { files: { path: string; hash: string | null }[] } }
  const pinned = await (await import('../src/server/lib/merge-state-machine.ts')).stepAMergeEntry({ workspaceId: 'default', id: entry.id, step: 'pinned', actor: worker, facts: { files: Object.fromEntries(seal.git.files.map(f => [f.path, f.hash ?? 'absent'])) } })
  expect(pinned.entry.state).toBe('judged')
  const verdict = t.api.getRecord(entry.id)!.data.verdict as { by: unknown; how: string; message: unknown }
  expect(verdict.how).toBe(
    'the take-back rule: an exact take-back of a landing, which the office filed and sealed itself, lands with no inspector\'s release',
  )
  expect(verdict.how).not.toContain('secretary')
  expect(verdict.how).not.toContain('design/')
  const { THE_OFFICE } = await import('../src/server/lib/inspection.ts')
  expect(verdict.by).toEqual({ kind: 'agent', id: THE_OFFICE.id })
  expect(verdict.message).toBeNull()
  expect((await takeBacks()).due.map(x => x.problem)).not.toContain(s.problem.id)
})
it('refuses one extra line with nothing written', async () => {
  const s = await prepared(); writeFileSync(join(s.clone, s.one.file), readFileSync(join(s.clone, s.one.file), 'utf8') + '\nextra'); git(s.clone, 'commit', '-qam', 'Extra', '--amend'); await refused(s, /content/)
})
it('refuses before the deadline with nothing written', async () => {
  const s = await prepared(), extra = s.problem.data.extra as { handBack: object }
  t.api.patchRecord(s.problem.id, { dataPatch: { extra: { ...extra, handBack: { ...extra.handBack, ...dueIn(3_600_000) } } } }, (await import('../src/server/lib/inspection.ts')).THE_OFFICE)
  await refused(s, /deadline/)
})
it('refuses a closed hand-back with nothing written', async () => {
  const s = await prepared(); t.api.patchRecord(s.problem.id, { dataPatch: { state: 'fixed', fix: 'Synthetic closure.' } }, person); await refused(s, /fixed|open/)
})
it.each(['extra path', 'missing path', 'mode', 'unrelated parent', 'branch tip'] as const)('refuses %s with nothing written', async what => {
  const s = await prepared()
  if (what === 'extra path') { writeFileSync(join(s.clone, 'extra'), 'extra'); git(s.clone, 'add', '.'); git(s.clone, 'commit', '-qm', 'Extra', '--amend') }
  if (what === 'missing path') { git(s.clone, 'checkout', 'HEAD^', '--', s.one.file); git(s.clone, 'commit', '--allow-empty', '-qm', 'Missing', '--amend') }
  if (what === 'mode') { chmodSync(join(s.clone, s.one.file), 0o755); git(s.clone, 'commit', '-qam', 'Mode', '--amend') }
  if (what === 'unrelated parent') { git(s.clone, 'checkout', '-q', s.one.mainAt); git(s.clone, 'commit', '--allow-empty', '-qm', 'Unrelated'); git(s.clone, 'branch', '-f', s.branch, 'HEAD') }
  if (what === 'branch tip') git(s.clone, 'checkout', '-q', 'HEAD^')
  await refused(s, what === 'mode' ? /mode/ : what === 'extra path' ? /extra/ : what === 'missing path' ? /missing/ : what === 'branch tip' ? /tip/ : /ancestor|descend/)
})
it('refuses a second take-back in any state with nothing written', async () => {
  const s = await prepared(); await submit(s); await refused(s, /already/)
})
it('refuses a caller other than the message worker', async () => {
  const s = await prepared(), before = counts()
  const response = await app.inject({ method: 'POST', url: `/api/worker/merges/hand-backs/${s.problem.id}/take-back`, headers, payload: { workingDirectory: s.clone, branch: s.branch } })
  expect(response.statusCode).toBe(403); expect(counts()).toEqual(before)
})
async function testing(s: Prepared) {
  const result = await submit(s), original = t.api.getRecord(s.one.id)!.data
  door.asTheMergeQueue(() => t.api.patchRecord(result.entry.id, { dataPatch: { state: 'testing', occupies: s.one.dir, integration: { ...(original.integration as object), result: git(s.clone, 'rev-parse', 'HEAD'), clone: s.clone }, judged: {}, reinspected: [], verdict: original.verdict } }, person))
  return { ...s.one, id: result.entry.id, run: result.entry.run, tip: git(s.clone, 'rev-parse', 'HEAD') }
}
it('bounces a red take-back, never hands it back or admits class one', async () => {
  process.env.MOLE_OFFICE_GATE_HOUSE_RULES = 'remind'
  const s = await prepared(), one = await testing(s), result = await tested(one)
  expect(result.entry.state).toBe('bounced'); expect(result.entry.machine?.bounced).toMatchObject({ reason: 'red' })
  expect(t.api.getRecord(one.id)!.data.tested).not.toMatchObject({ mergeClass: { class: 2 } })
  expect(takeNotices(one.run).flatMap(m => m.data.to)).toContainEqual({ kind: 'agent', id: secretary })
  expect(takeNotices(one.run).some(m => String(m.data.body).includes('person must look'))).toBe(true)
})
it('bounces refused if a repair closes the problem before the next step', async () => {
  const s = await prepared(), one = await testing(s)
  t.api.patchRecord(s.problem.id, { dataPatch: { state: 'fixed', fix: 'Synthetic repair landed first.' } }, person)
  const result = await tested(one, { green: true })
  expect(result.entry.state).toBe('bounced'); expect(result.entry.machine?.bounced).toMatchObject({ reason: 'refused' }); expect(result.decided).toContain(s.problem.id); expect(result.decided).toContain('fixed')
  expect(takeNotices(one.run).flatMap(m => m.data.to)).toContainEqual({ kind: 'agent', id: secretary })
})
it('closes at landing, tells the original line and secretary and never the message worker', async () => {
  const s = await prepared(), one = await testing(s)
  await tested(one, { green: true }); await land(one)
  expect(t.api.getRecord(s.problem.id)!.data).toMatchObject({ state: 'fixed', fix: `Taken back by merge entry ${one.id}, landed commit ${one.tip}.` })
  const sent = takeNotices(one.run), to = sent.flatMap(m => m.data.to)
  expect(to).toEqual(expect.arrayContaining([author, starter, submitter, secretary].map(id => ({ kind: 'agent', id }))))
  expect(to).not.toContainEqual({ kind: 'agent', id: worker.id }); expect(sent.some(m => m.data.notice === 'takenBack')).toBe(true)
})

it('keeps the two take-out reasons in their own problem families and ordinary runs refused', async () => {
  for (const reason of ['hour expired', 'not fixed in time'] as const) {
    const s = await prepared(), ordinary = ready(s.one.file, { repository: s.one.dir })
    const before = counts()
    expect(() => queue.submitAMergeEntry({ workspaceId: 'default', actor: person, submission: { run: ordinary.run, changeset: { adapter: 'git', repository: s.repo.id, branch: 'main' }, fixRound: { problem: s.problem.id, kind: 'takeout', reason } } })).toThrow('a take-back is filed by the office alone')
    expect(counts()).toEqual(before)
  }
  const s = await prepared(), ordinary = ready(s.one.file, { repository: s.one.dir })
  const problem = t.api.createRecord({ kind: 'problem', workspaceId: 'default', actor: person, title: 'Synthetic main-suite problem', data: { state: 'open', symptom: 'Synthetic family boundary.' } })
  const before = counts()
  expect(() => queue.submitAMergeEntry({ workspaceId: 'default', actor: person, submission: { run: ordinary.run, changeset: { adapter: 'git', repository: s.repo.id, branch: 'main' }, fixRound: { problem: problem.id, kind: 'takeout', reason: 'not fixed in time' } } })).toThrow('not a main-suite fix round')
  expect(counts()).toEqual(before)
})

it('records a completed landing after the problem closed, leaves the problem unchanged and tells the line', async () => {
  const s = await prepared(), one = await testing(s)
  await tested(one, { green: true }); await step(one, 'landing', { mainAt: one.mainAt })
  t.api.patchRecord(s.problem.id, { dataPatch: { state: 'fixed', fix: 'Synthetic manual closure during landing.' } }, person)
  const before = t.api.getRecord(s.problem.id)!, result = await step(one, 'landed', { mainAfter: one.tip })
  expect(result.entry.state).toBe('merged'); expect(t.api.getRecord(s.problem.id)).toEqual(before)
  expect(result.decided).toContain('already fixed')
  const sent = takeNotices(one.run).filter(m => m.data.notice === 'takenBack')
  expect(sent).toHaveLength(1); expect(String(sent[0]!.data.body)).toContain('landed after the problem was closed')
  expect(sent.flatMap(m => m.data.to)).toEqual(expect.arrayContaining([author, starter, submitter, secretary].map(id => ({ kind: 'agent', id }))))
  expect(sent.flatMap(m => m.data.to)).not.toContainEqual({ kind: 'agent', id: worker.id })
})
it('preserves the empty-red 422 for a take-back with nothing written', async () => {
  const s = await prepared(), one = await testing(s), before = counts()
  await expect(tested(one, { redTests: [] })).rejects.toMatchObject({ status: 422 })
  expect(counts()).toEqual(before)
})
it('says that no secretary was told when nobody holds the card for a person-needed note', async () => {
  const s = await due(); writeFileSync(join(s.one.dir, s.one.file), 'main touched it'); git(s.one.dir, 'commit', '-qam', 'Touch')
  t.client.sqlite.prepare('UPDATE agents SET retired = 1 WHERE id = ?').run(secretary)
  try {
    const result = (await import('../src/server/lib/take-back.ts')).noteTakeBackNeedsAPerson('default', s.problem.id)
    expect(result.says).toContain('Nobody holds the secretary card, so no secretary was told.')
  } finally { t.client.sqlite.prepare('UPDATE agents SET retired = 0 WHERE id = ?').run(secretary) }
})

const workerHeaders = () => ({ ...headers, 'x-mole-office-actor-type': worker.type, 'x-mole-office-actor-id': worker.id })
const redEvidence = (s: Awaited<ReturnType<typeof due>>) => ({ mainAt: git(s.one.dir, 'rev-parse', 'main'), files: [{ file: s.one.file, result: 'red', log: '/synthetic/still-red.log' }] })
const greenEvidence = (s: Awaited<ReturnType<typeof due>>) => ({ mainAt: git(s.one.dir, 'rev-parse', 'main'), files: [{ file: s.one.file, log: '/synthetic/green.log' }] })
async function unchangedRefusal(url: string, payload: unknown, status: number, caller: Record<string, string> = workerHeaders()) {
  const before = counts(), response = await app.inject({ method: 'POST', url, headers: caller, payload: payload as object })
  expect(response.statusCode, response.body).toBe(status); expect(counts()).toEqual(before)
}
it.each(['no evidence', 'no red', 'missing file', 'extra file', 'file twice', 'off main', 'before landing'] as const)('refuses take-back still-red evidence: %s, with nothing written', async what => {
  const s = await prepared(), stillRed = redEvidence(s)
  if (what === 'no red') stillRed.files[0]!.result = 'passed'
  if (what === 'missing file') stillRed.files = []
  if (what === 'extra file') stillRed.files.push({ file: 'tests/extra.test.ts', result: 'red', log: '/synthetic/extra.log' })
  if (what === 'file twice') stillRed.files.push({ ...stillRed.files[0]! })
  if (what === 'off main') stillRed.mainAt = git(s.clone, 'rev-parse', 'HEAD')
  if (what === 'before landing') stillRed.mainAt = s.one.mainAt
  await unchangedRefusal(`/api/worker/merges/hand-backs/${s.problem.id}/take-back`, { workingDirectory: s.clone, branch: s.branch, ...(what === 'no evidence' ? {} : { stillRed }) }, 409)
})
it('keeps the still-red run on the problem beside its hand-back facts', async () => {
  const s = await prepared(), before = t.api.getRecord(s.problem.id)!.data.extra
  await submit(s)
  expect(t.api.getRecord(s.problem.id)!.data.extra).toMatchObject({ ...(before as object), takeBack: { stillRed: { at: expect.any(String), ...redEvidence(s) } } })
})
it.each(['not worker', 'closed', 'not due', 'missing file', 'extra file', 'file twice', 'off main', 'before landing'] as const)('refuses fixed-on-main: %s, with nothing written', async what => {
  const s = await due(), body = greenEvidence(s), url = `/api/worker/merges/hand-backs/${s.problem.id}/fixed-on-main`
  if (what === 'closed') t.api.patchRecord(s.problem.id, { dataPatch: { state: 'fixed', fix: 'Synthetic closure.' } }, person)
  if (what === 'not due') {
    const extra = t.api.getRecord(s.problem.id)!.data.extra as { handBack: object }
    t.api.patchRecord(s.problem.id, { dataPatch: { extra: { ...extra, handBack: { ...extra.handBack, ...dueIn(3_600_000) } } } }, (await import('../src/server/lib/inspection.ts')).THE_OFFICE)
  }
  if (what === 'missing file') body.files = []
  if (what === 'extra file') body.files.push({ file: 'tests/extra.test.ts', log: '/synthetic/extra.log' })
  if (what === 'file twice') body.files.push({ ...body.files[0]! })
  if (what === 'off main') body.mainAt = git(s.one.dir, 'commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-m', 'Unlanded')
  if (what === 'before landing') body.mainAt = s.one.mainAt
  await unchangedRefusal(url, body, what === 'not worker' ? 403 : 409, what === 'not worker' ? headers : workerHeaders())
})
it('closes fixed-on-main once, keeps evidence and extra facts, tells the line and secretary, and accepts an ancestor of current main', async () => {
  const s = await due(), body = greenEvidence(s)
  writeFileSync(join(s.one.dir, 'unrelated'), 'later'); git(s.one.dir, 'add', '.'); git(s.one.dir, 'commit', '-qm', 'Later main')
  const extra = t.api.getRecord(s.problem.id)!.data.extra as object
  const before = t.client.sqlite.prepare("SELECT count(*) AS count FROM records WHERE kind IN ('session', 'sealed_tip', 'merge_entry')").get()
  const url = `/api/worker/merges/hand-backs/${s.problem.id}/fixed-on-main`
  const response = await app.inject({ method: 'POST', url, headers: workerHeaders(), payload: body })
  expect(response.statusCode, response.body).toBe(200)
  expect(t.api.getRecord(s.problem.id)!.data).toMatchObject({ state: 'fixed', fix: expect.stringContaining('ran green by name'), extra: { ...extra, takeBack: { fixedOnMain: { at: expect.any(String), ...body } } } })
  expect(String(t.api.getRecord(s.problem.id)!.data.fix)).toContain(body.mainAt)
  expect(String(t.api.getRecord(s.problem.id)!.data.fix)).toContain('nothing was taken back')
  expect(t.client.sqlite.prepare("SELECT count(*) AS count FROM records WHERE kind IN ('session', 'sealed_tip', 'merge_entry')").get()).toEqual(before)
  const told = t.api.listRecords({ workspaceId: 'default', kind: 'message' }).filter(m => m.data.notice === 'handedBack' && String(m.data.body).includes(s.problem.id) && String(m.data.body).includes('ran green by name'))
  expect(told).toHaveLength(1)
  expect(told[0]!.data.to).toEqual(expect.arrayContaining([author, secretary].map(id => ({ kind: 'agent', id }))))
  await unchangedRefusal(url, body, 409)
})
it('says when no secretary can be told of a fixed-on-main closure', async () => {
  const s = await due(); t.client.sqlite.prepare('UPDATE agents SET retired = 1 WHERE id = ?').run(secretary)
  try {
    const result = await app.inject({ method: 'POST', url: `/api/worker/merges/hand-backs/${s.problem.id}/fixed-on-main`, headers: workerHeaders(), payload: greenEvidence(s) })
    expect(result.statusCode, result.body).toBe(200); expect(result.json().says).toContain('No secretary could be told')
  } finally { t.client.sqlite.prepare('UPDATE agents SET retired = 0 WHERE id = ?').run(secretary) }
})
