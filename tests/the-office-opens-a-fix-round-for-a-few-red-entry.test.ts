// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A few-red entry reserves its repair before landing, then starts it on proved landed main in a new worktree.
 * The real temporary office, worker, argument adapter, worktree subprocess and run-filing tool are exercised here.
 * A synthetic launcher runs no model or container. The real sandbox CLI is covered in
 * tests/a-second-round-waits-for-the-first.test.ts with synthetic container and runtime programs.
 * Pending check requests use the office's actual stored shape. Replayed landing, later main, invalid bases,
 * changed/expired/replaced reservations, sheriff fallback and overdue take-back retain their evidence below.
 * Successful synthetic observations are printed as JSON so the named runner keeps their HEAD, cut and sealed snapshots.
 */
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { onePass, type WatchingARound, type WorkerSettings } from '../src/worker/index.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { momentOfAnInstant, nowStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb, app: FastifyInstance, home: string
let door: typeof import('../src/server/lib/merge-entry-door.ts')
let nextRound: typeof import('../src/server/lib/next-round.ts')
let resources: typeof import('../src/server/lib/resources.ts')
let keys: typeof import('../src/server/lib/keys.ts')
let coordinator: string, submitter: string, checker: string
let settings: WorkerSettings
const names = ['HOME', 'MOLE_OFFICE_GATE_FEW_FEATURE_REDS', 'MOLE_OFFICE_MESSAGE_WORKER', 'MOLE_OFFICE_BUILD_SHERIFF', 'MOLE_OFFICE_FEW_RED_FILES', 'MOLE_OFFICE_HAND_BACK_HOURS', 'MOLE_OFFICE_GATE_HOUSE_RULES', 'MOLE_OFFICE_GATE_WIDE_RED', 'MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND', 'MOLE_OFFICE_GATE_FLAKY', 'MOLE_OFFICE_RED_FIXING']
const saved = new Map(names.map(name => [name, process.env[name]]))
const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': person.id }
const rows: string[] = []
const lines = new Map<string, { folder: string; sealed: string }>()
function git(dir: string, ...args: string[]) { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'fix-round-office-')); process.env.HOME = home
  for (const name of names.slice(1)) delete process.env[name]
  process.env.MOLE_OFFICE_MESSAGE_WORKER = 'on'
  process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = 'remind'
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ person: randomBytes(32).toString('hex'), office: randomBytes(32).toString('hex'), providers: {} }), { mode: 0o600 })
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  door = await import('../src/server/lib/merge-entry-door.ts')
  nextRound = await import('../src/server/lib/next-round.ts')
  resources = await import('../src/server/lib/resources.ts')
  keys = await import('../src/server/lib/keys.ts')
  coordinator = await start('supervisor'); submitter = await start('worker'); checker = await start('inspector')
  const launcher = join(home, 'synthetic-launcher.mjs')
  writeFileSync(launcher, SYNTHETIC_LAUNCHER)
  settings = { mergesOnly: true, api: `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`, workspace: 'default', session: null, stopWithPid: null, checkout: new URL('..', import.meta.url).pathname, runs: 2, hops: 3, outputRoot: join(home, 'worker-output'), env: { ...process.env, MOLE_OFFICE_DB: t.file, MOLE_OFFICE_FAKE_ROUND_LAUNCHER: launcher } }
}, 60_000)
afterAll(async () => {
  for (const row of rows) t.client.sqlite.prepare('DELETE FROM session_resources WHERE id = ?').run(row)
  await app?.close(); t?.close()
  for (const [name, value] of saved) { if (value === undefined) delete process.env[name]; else process.env[name] = value }
  rmSync(home, { recursive: true, force: true })
})

const asAgent = (id: string) => ({ ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id, 'x-mole-office-key': keys.makeAnAgentKey(id, null) })
async function start(role: string, by: Record<string, string> = headers): Promise<string> {
  const result = await app.inject({ method: 'POST', url: '/api/agents/started', headers: by, payload: { handle: randomUUID(), name: 'A synthetic participant', role, workArea: ['tests'] } })
  expect(result.statusCode, result.body).toBe(201); return String(result.json().agent.id)
}

/** A container row that vouches for a made-up sandbox folder, as tools/sandbox.mjs up writes one. */
function aContainerRow(folder: string): string {
  const id = `row-${randomBytes(5).toString('hex')}`, name = folder.split('/').at(-1)!
  t.client.sqlite
    .prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES (?, 'default', 'fixture-session', 'container', ?, ?, '2026-10-25 10:00:00', 'agent:fixture')")
    .run(id, `mole-office-sandbox-${name}`, `Sandbox ${name}, from the template mole-office-dev; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.`)
  return id
}

/** A supervisor its starter started, with a made-up sandbox and its last run there, which has no process going. */
async function aLine(starter = coordinator): Promise<{ id: string; folder: string; sandboxRun: string }> {
  const id = await start('supervisor', asAgent(starter))
  const folder = join(realpathSync(home), 'sandboxes', `s-${randomBytes(4).toString('hex')}`)
  mkdirSync(join(folder, 'briefs'), { recursive: true })
  const container = aContainerRow(folder)
  const sealed = join(folder, 'sealed')
  mkdirSync(sealed); git(sealed, 'init', '-q', '-b', 'main'); git(sealed, 'config', 'user.name', 'Synthetic fixture'); git(sealed, 'config', 'user.email', 'fixture@example.invalid')
  writeFileSync(join(sealed, 'kept.txt'), randomUUID()); git(sealed, 'add', '.'); git(sealed, 'commit', '-qm', 'Sealed context')
  const sandboxRun = t.api.createRecord({ kind: 'session', title: 'A made-up sandbox round', workspaceId: 'default', actor: person, origin: 'fixture',
    data: { state: 'running', servingAgentId: id, runtime: 'claude-code', model: 'claude-made-up-round-0', workingDirectory: sealed, cutFrom: git(sealed, 'rev-parse', 'HEAD'), submission: { kind: 'git' }, sandbox: { template: 'mole-office-dev', container, folder } } }).id
  t.api.patchRecord(sandboxRun, { dataPatch: { state: 'finished' } }, person)
  expect(t.api.getRecord(sandboxRun)!.data.sealedTip).toEqual(expect.any(String))
  const message = t.api.createRecord({ kind: 'message', title: 'Synthetic pending check', workspaceId: 'default', actor: person, origin: 'fixture', data: { body: 'Synthetic check request awaiting a verdict.', to: [{ kind: 'agent', id: checker }] } }).id
  const pendingCheck = { askedAt: nowStamp(), askedOf: (t.client.sqlite.prepare('SELECT handle FROM agents WHERE id=?').get(checker) as { handle: string }).handle, message, checkout: { directory: sealed, cutFrom: git(sealed, 'rev-parse', 'HEAD') }, says: 'Synthetic check request awaiting a verdict.' }
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.theCheck', json(?)) WHERE id = ?").run(JSON.stringify(pendingCheck), sandboxRun)
  expect((await import('../src/server/lib/inspection.ts')).theCheckAskedFor(t.api.getRecord(sandboxRun)!)).toEqual(pendingCheck)
  lines.set(id, { folder, sealed })
  return { id, folder, sandboxRun }
}

/** A run of `agent` that is going: running, with this test process as its process row. */
function aRunGoing(agent: string): string {
  const run = t.api.createRecord({ kind: 'session', title: 'A made-up run going', workspaceId: 'default', actor: person, origin: 'fixture', data: { state: 'running', servingAgentId: agent } }).id
  rows.push(resources.registerResource({ workspaceId: 'default', sessionRecordId: run, type: 'process', key: String(process.pid), actor: person }).id)
  return run
}

/** The round the office asked for is filed and going, as the launcher and the run key door leave it. */
function theRoundStarts(agent: string, holder: string): string {
  const run = aRunGoing(agent)
  nextRound.sayTheNextRoundStarted(holder, run, 'a-made-up-key-id')
  return run
}

function ready(agent: string) {
  const file = `tests/${randomUUID()}.test.ts`
  const dir = mkdtempSync(join(home, 'tree-'))
  git(dir, 'init', '-q', '-b', 'main'); git(dir, 'config', 'user.name', 'Synthetic fixture'); git(dir, 'config', 'user.email', 'fixture@example.invalid')
  mkdirSync(join(dir, 'tests')); writeFileSync(join(dir, 'tests/house-rules.mjs'), 'export const HOUSE_RULES = {\n}\n')
  writeFileSync(join(dir, file), 'main'); git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'Main')
  const mainAt = git(dir, 'rev-parse', 'HEAD')
  git(dir, 'switch', '-qc', 'original'); writeFileSync(join(dir, file), randomUUID()); git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'Entry')
  const originalTip = git(dir, 'rev-parse', 'HEAD')
  git(dir, 'switch', '-q', 'main'); writeFileSync(join(dir, 'later.txt'), randomUUID()); git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'Main advanced')
  const replayBase = git(dir, 'rev-parse', 'HEAD')
  git(dir, 'cherry-pick', originalTip); const tip = git(dir, 'rev-parse', 'HEAD'); git(dir, 'reset', '--hard', replayBase)
  const sealedEntry = join(home, `entry-${randomUUID()}`); git(dir, 'worktree', 'add', '--detach', sealedEntry, originalTip)
  const run = t.api.createRecord({ kind: 'session', title: 'A synthetic entry run', workspaceId: 'default', actor: person, origin: 'fixture', data: { state: 'running', servingAgentId: agent, workingDirectory: sealedEntry, cutFrom: 'main', submission: { kind: 'git' } } }).id
  t.api.patchRecord(run, { dataPatch: { state: 'finished' } }, person)
  const seal = t.api.getRecord(run)!.data.sealedTip as string, hash = (t.api.getRecord(seal)!.data.seal as { hash: string }).hash
  const changeset = { adapter: 'git' as const, root: dir, repository: dir, branch: 'main', commit: originalTip, base: mainAt }
  const setup = { integration: { mainAt: replayBase, result: tip, clone: dir, files: {}, at: '2026-10-25 09:00:00' }, judged: {}, reinspected: [], verdict: { run, by: { kind: 'person', id: person.id }, at: '2026-10-25 09:00:00', how: 'Synthetic released fixture', message: null } }
  const id = door.asTheMergeQueue(() => t.api.createRecord({ kind: 'merge_entry', title: 'A synthetic feature entry', workspaceId: 'default', origin: 'fixture', actor: person, data: { state: 'testing', run, seal: { id: seal, hash }, submittedBy: { kind: 'agent', id: submitter }, occupies: dir, changeset, ...setup } })).id
  const line = lines.get(agent)
  if (line) git(home, 'clone', '-q', dir, join(line.folder, 'repo'))
  return { id, run, file, tip, originalTip, mainAt: replayBase, dir }
}
type Entry = ReturnType<typeof ready>
interface Ask { for: string; agent?: string; at: string; brief?: string; status?: number; said: string; holder?: string; started?: { at: string; run: string }; ended?: { at: string; said: string } }
interface Waits { since: string; time: { instant: string }; until: string; dueAt: string; timeZone: string; minutes: number; asks: Ask[]; reserved?: { for: string; agent: string; holder: string }; opened?: { for: string; agent: string; run: string } }

async function step(one: Entry, step: string, facts: Record<string, unknown>) {
  const machine = await import('../src/server/lib/merge-state-machine.ts')
  return machine.stepAMergeEntry({ id: one.id, workspaceId: 'default', step: step as Parameters<typeof machine.stepAMergeEntry>[0]['step'], facts, actor: person })
}
const tested = (one: Entry) => step(one, 'tested', { green: false, redTests: [one.file], tip: one.tip, log: '/synthetic/red.log', build: { passed: true } })
const look = (one: Entry) => step(one, 'fix-round-looked', {})
async function land(one: Entry) { await step(one, 'landing', { mainAt: one.mainAt }); git(one.dir, 'reset', '--hard', one.tip); return step(one, 'landed', { mainAfter: one.tip }) }
const machineOf = (one: Entry) => (t.api.getRecord(one.id)!.data) as Record<string, any>
const waitsOf = (one: Entry) => machineOf(one)['waitsForAFixRound'] as Waits | undefined
const theNextRoundOf = (run: string) => (JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }).data) as { nextRound?: Record<string, any> }).nextRound
const handBackOf = (one: Entry) => t.api.listRecords({ workspaceId: 'default', kind: 'problem' }).find(p => (p.data.extra as { handBack?: { entry?: string } } | undefined)?.handBack?.entry === one.id)
const toThePerson = () => t.api.listRecords({ workspaceId: 'default', kind: 'message' }).filter(m => (m.data.to as { kind: string }[] | undefined)?.some(to => to.kind === 'person')).length
async function theMinutes(): Promise<unknown> { return Reflect.get(await import('../src/shared/merge-queue.ts'), 'FIX_ROUND_MINUTES') }
async function theOffice() { return { office: (await import('../src/server/lib/inspection.ts')).THE_OFFICE, itself: (await import('../src/shared/participants.ts')).moleOffice() } }

// A subprocess consumes the real worker and RoundAdapter arguments, makes the actual git worktree, and
// files its run through the real filing tool. No container or model runs in this synthetic office.
const SYNTHETIC_LAUNCHER = `
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { theAgentsWorktree, officeHeaders } from ${JSON.stringify(new URL('../tools/sandbox-common.mjs', import.meta.url).href)}
import { fileARun } from ${JSON.stringify(new URL('../tools/file-a-run.mjs', import.meta.url).href)}
const args=process.argv.slice(2), flag=name=>args[args.indexOf(name)+1]
if (!args.includes('--worktree') || !args.includes('--cut-from')) throw new Error('The synthetic repair launcher needs the fresh directory and exact cut from the worker.')
const api=flag('--api'), workspace=flag('--workspace'), as=flag('--as'), session=flag('--session')
const last=(await (await fetch(api+'/api/records/'+flag('--continues'), {headers:officeHeaders({workspace, agent:as, session, key:process.env.MOLE_AGENT_KEY})})).json()).record
const made=theAgentsWorktree({instanceDir:last.data.sandbox.folder, from:last.data.sandbox.folder, branch:flag('--agent'), value:flag('--worktree'), cutFrom:flag('--cut-from'), cutNamed:true})
const filed=fileARun({api, workspace, as, session, handle:flag('--agent'), worktree:made.dir, cutFrom:flag('--cut-from'), runtime:flag('--runtime'), model:flag('--model'), title:'Synthetic fresh repair', sandbox:last.data.sandbox, continues:last.id})
if (!filed.ok) throw new Error(filed.says)
`
async function launchThroughTheWorker(holder: string): Promise<string> {
  const rounds: WatchingARound[] = []
  const first = await onePass(settings, [], [], rounds)
  expect(first.rounds?.started.some(one => one.run === holder), JSON.stringify(first.rounds)).toBe(true)
  const until = Date.now() + 20_000
  while (rounds.some(round => round.adapter.alive(round.handle)) && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 30))
  await onePass(settings, [], [], rounds)
  const ask = theNextRoundOf(holder)!
  expect(ask.state, JSON.stringify(ask)).toBe('started')
  return ask.started.run
}

const sealedSnapshot = (line: Awaited<ReturnType<typeof aLine>>) => {
  const folder = lines.get(line.id)!.sealed
  return { head: git(folder, 'rev-parse', 'HEAD'), status: git(folder, 'status', '--porcelain=v1', '--untracked-files=all'), content: readFileSync(join(folder, 'kept.txt'), 'utf8') }
}
function wrapperFor(holder: string) {
  return t.api.createRecord({ kind: 'session', title: 'Synthetic repair launcher', workspaceId: 'default', actor: person, origin: 'fixture', data: { state: 'running', runtime: 'round-launcher', startedByMoleOffice: true, extra: { purpose: 'round', round: holder } } }).id
}
function prepare(holder: string, wrapper = wrapperFor(holder)) {
  return nextRound.startingTheNextRound({ run: holder, wrapper, workspaceId: 'default' }) as ReturnType<typeof nextRound.startingTheNextRound> & { worktree: string; cutFrom: string }
}
async function theMergeToolWaits(entry: unknown): Promise<boolean> {
  const module = new URL('../tools/merge-tool/fix-round.mjs', import.meta.url).href
  // Pass fixture data separately because the real tool reads its own arguments during import.
  const program = `const entry=JSON.parse(process.argv[1]), api=process.argv[2], dir=process.argv[3]; process.argv=[process.execPath,'synthetic-merge-tool','--entry','synthetic-entry','--session','synthetic-tool','--api',api,'--workspace','default','--workdir',dir]; const {itWaitsForAFixRound}=await import(${JSON.stringify(module)}); console.log(JSON.stringify(itWaitsForAFixRound(entry)))`
  return new Promise<boolean>((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', program, JSON.stringify(entry), settings.api, join(home, 'merge-tool')], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 20_000 })
    let out = '', err = ''; child.stdout.on('data', chunk => { out += chunk }); child.stderr.on('data', chunk => { err += chunk }); child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve(JSON.parse(out.trim().split('\n').at(-1)!)) : reject(new Error(err)))
  })
}

for (const sheriffPath of [false, true]) it(`reserves then launches a fresh repair on landed main through ${sheriffPath ? 'the sheriff' : 'the line'}`, async () => {
  const line = await aLine(), sheriff = sheriffPath ? await aLine() : null
  if (sheriff) { aRunGoing(line.id); process.env.MOLE_OFFICE_BUILD_SHERIFF = sheriff.id }
  try {
    const owner = sheriff ?? line, one = ready(line.id), before = toThePerson(), snapshot = sealedSnapshot(owner)
    if (sheriff) git(home, 'clone', '-q', one.dir, join(sheriff.folder, 'repo'))
    const pendingCheck = t.api.getRecord(owner.sandboxRun)!.data.theCheck
    expect(one.tip).not.toBe(one.originalTip)
    const result = await tested(one)
    expect(result.entry.state, result.decided).toBe('testing')
    expect(await theMergeToolWaits(result.entry)).toBe(true)
    const waits = waitsOf(one)!
    const ask = waits.asks.at(-1)!
    expect(ask).toMatchObject({ for: sheriffPath ? 'sheriff' : 'line', agent: owner.id, status: 202, holder: owner.sandboxRun })
    expect(theNextRoundOf(owner.sandboxRun)).toMatchObject({ state: 'wanted', repair: { entry: one.id, dueAt: waits.dueAt } })
    const minutes = await theMinutes()
    expect(waits.minutes).toBe(minutes)
    expect(momentOfAnInstant(waits.dueAt)! - momentOfAnInstant(waits.time.instant)!).toBe((minutes as number) * 60_000)
    expect(nextRound.theRoundsToStart('default').some(r => r.run === owner.sandboxRun)).toBe(false)
    t.client.sqlite.prepare("UPDATE records SET data=json_set(data, '$.state', 'integrating') WHERE id=?").run(one.id)
    expect(nextRound.theRoundsToStart('default').some(r => r.run === owner.sandboxRun)).toBe(false)
    expect(() => prepare(owner.sandboxRun)).toThrow(expect.objectContaining({ status: 409 }))
    expect(theNextRoundOf(owner.sandboxRun)!.state).toBe('wanted')
    t.client.sqlite.prepare("UPDATE records SET data=json_set(data, '$.state', 'testing') WHERE id=?").run(one.id)
    const reserved = await look(one)
    expect(await theMergeToolWaits(reserved.entry)).toBe(false)
    expect(machineOf(one)['tested'].mergeClass).toMatchObject({ class: 2, roundOpen: { open: false, reserved: { holder: owner.sandboxRun, agent: owner.id } } })
    expect(machineOf(one)['tested'].mergeClass.roundOpen.run).toBeUndefined()
    expect((await land(one)).entry.state).toBe('merged')
    const problem = handBackOf(one)!, facts = (problem.data.extra as any).handBack
    expect(facts.line.run).toBeNull()
    expect(facts.commits).toContain(one.tip)
    expect(nextRound.theRoundsToStart('default').some(r => r.run === owner.sandboxRun)).toBe(true)
    git(join(owner.folder, 'repo'), 'fetch', '-q', one.dir, one.tip); git(join(owner.folder, 'repo'), 'merge', '--ff-only', 'FETCH_HEAD')
    const round = await launchThroughTheWorker(owner.sandboxRun)
    const data = t.api.getRecord(round)!.data
    const prepared = { worktree: data.workingDirectory as string, cutFrom: data.cutFrom as string }
    expect(prepared.cutFrom).toBe(one.tip)
    expect(prepared.worktree.startsWith(join(owner.folder, 'worktrees') + '/')).toBe(true)
    expect(prepared.worktree).not.toBe(lines.get(owner.id)!.sealed)
    expect(git(prepared.worktree, 'rev-parse', 'HEAD')).toBe(one.tip)
    expect(t.api.getRecord(round)!.data.cutFrom).toBe(git(prepared.worktree, 'rev-parse', 'HEAD'))
    expect((handBackOf(one)!.data.extra as any).handBack).toMatchObject({ deadline: facts.deadline, dueAt: facts.dueAt, line: { run: round, fixRound: { agent: owner.id, as: sheriffPath ? 'sheriff' : 'line' } } })
    const visible = String(handBackOf(one)!.data.symptom)
    expect(visible).toContain(round)
    expect(visible).toContain(facts.deadline)
    expect(visible).toContain(owner.id)
    expect(sealedSnapshot(owner)).toEqual(snapshot)
    expect(t.api.getRecord(owner.sandboxRun)!.data.theCheck).toEqual(pendingCheck)
    expect(toThePerson()).toBe(before)
    console.info('REPAIR_LAUNCH_PROOF ' + JSON.stringify({ path: sheriffPath ? 'sheriff' : 'line', originalTip: one.originalTip, landed: one.tip, run: round, worktree: prepared.worktree, cutFrom: prepared.cutFrom, head: git(prepared.worktree, 'rev-parse', 'HEAD'), sealedBefore: snapshot, sealedAfter: sealedSnapshot(owner), pendingCheckPreserved: JSON.stringify(t.api.getRecord(owner.sandboxRun)!.data.theCheck) === JSON.stringify(pendingCheck) }))
  } finally { delete process.env.MOLE_OFFICE_BUILD_SHERIFF }
})

it('uses later current main, and refuses an unproved base or a reused repair directory', async () => {
  for (const failure of ['later', 'not-on-main', 'missing-main', 'reused']) {
    const line = await aLine(), one = ready(line.id), before = sealedSnapshot(line)
    await tested(one); await look(one); await land(one)
    let expected = one.tip
    if (failure === 'later') { writeFileSync(join(one.dir, 'after-landing.txt'), randomUUID()); git(one.dir, 'add', '.'); git(one.dir, 'commit', '-qm', 'Later main'); expected = git(one.dir, 'rev-parse', 'HEAD') }
    if (failure === 'not-on-main') git(one.dir, 'reset', '--hard', one.mainAt)
    if (failure === 'missing-main') git(one.dir, 'update-ref', '-d', 'refs/heads/main')
    const wrapper = wrapperFor(line.sandboxRun)
    if (failure === 'reused') mkdirSync(join(line.folder, 'worktrees', `${(t.client.sqlite.prepare('SELECT handle FROM agents WHERE id = ?').get(line.id) as any).handle}-${wrapper}`), { recursive: true })
    if (failure === 'later') {
      git(join(line.folder, 'repo'), 'fetch', '-q', one.dir, expected); git(join(line.folder, 'repo'), 'merge', '--ff-only', 'FETCH_HEAD')
      const run = await launchThroughTheWorker(line.sandboxRun), data = t.api.getRecord(run)!.data
      expect(data.cutFrom).toBe(expected)
      expect(git(data.workingDirectory as string, 'rev-parse', 'HEAD')).toBe(expected)
      expect(git(one.dir, 'merge-base', '--is-ancestor', one.tip, data.cutFrom as string)).toBe('')
      console.info('REPAIR_LAUNCH_PROOF ' + JSON.stringify({ path: 'later-main', originalTip: one.originalTip, landed: one.tip, mainAtLaunch: expected, run, worktree: data.workingDirectory, cutFrom: data.cutFrom, head: git(data.workingDirectory as string, 'rev-parse', 'HEAD'), sealedBefore: before, sealedAfter: sealedSnapshot(line) }))
    } else expect(() => prepare(line.sandboxRun, wrapper)).toThrow(expect.objectContaining({ status: 409 }))
    expect(sealedSnapshot(line)).toEqual(before)
  }
})

it('rechecks failed, replaced, changed and expired reservations at landing', async () => {
  for (const change of ['failed', 'replaced', 'changed', 'expired']) {
    const line = await aLine(), one = ready(line.id)
    await tested(one); await look(one)
    if (change === 'failed') t.client.sqlite.prepare("UPDATE records SET data=json_set(data, '$.nextRound.state', 'failed') WHERE id=?").run(line.sandboxRun)
    if (change === 'replaced') t.client.sqlite.prepare("UPDATE records SET data=json_set(data, '$.nextRound.repair.entry', 'another-entry') WHERE id=?").run(line.sandboxRun)
    if (change === 'changed') writeFileSync(theNextRoundOf(line.sandboxRun)!.brief.path, '# Changed synthetic brief')
    if (change === 'expired') { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(momentOfAnInstant(waitsOf(one)!.dueAt)! + 1) }
    try { await expect(step(one, 'landing', { mainAt: one.mainAt })).rejects.toMatchObject({ status: 409 }); expect(handBackOf(one)).toBeUndefined() } finally { vi.useRealTimers() }
  }
})

it('3. neither round opens, and at the bound the entry bounces naming both answers', async () => {
  const line = await aLine(), sheriff = await aLine()
  process.env.MOLE_OFFICE_BUILD_SHERIFF = sheriff.id
  try {
    const one = ready(line.id)
    expect((await tested(one)).entry.state).toBe('testing')
    expect(waitsOf(one)!.asks.map(ask => ask.for)).toEqual(['line'])
    const failed = { at: '2026-10-25 12:00:00', says: `A made-up launcher failure ${randomUUID()}.` }
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.nextRound.state', 'failed', '$.nextRound.failed', json(?)) WHERE id = ?").run(JSON.stringify(failed), line.sandboxRun)

    const after = await look(one)
    expect(after.entry.state, after.decided).toBe('testing')
    const asks = waitsOf(one)!.asks
    expect(asks[0]!.ended).toEqual(failed)
    expect(asks[1]).toMatchObject({ for: 'sheriff', agent: sheriff.id, status: 202, holder: sheriff.sandboxRun })
    expect(theNextRoundOf(sheriff.sandboxRun)).toMatchObject({ state: 'wanted', askedBy: { as: 'the office' } })
    expect((await look(one)).entry.state).toBe('testing')

    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(momentOfAnInstant(waitsOf(one)!.dueAt)! + 1000)
      const bounced = await look(one)
      expect(bounced.entry.state, bounced.decided).toBe('bounced')
      const stored = machineOf(one)['bounced'] as { reason: string; says: string }
      expect(stored.reason).toBe('red')
      for (const said of [asks[0]!.said, failed.says, asks[1]!.said]) expect(stored.says).toContain(said)
    } finally { vi.useRealTimers() }
  } finally { delete process.env.MOLE_OFFICE_BUILD_SHERIFF }
})

it('4. a retired starter bounces at once and asks nobody, where a live one waits', async () => {
  const starter = await start('supervisor')
  const live = await aLine(starter), retired = await aLine(starter)
  expect((await tested(ready(live.id))).entry.state).toBe('testing')

  t.client.sqlite.prepare('UPDATE agents SET retired = 1 WHERE id = ?').run(starter)
  const one = ready(retired.id)
  const machine = await import('../src/server/lib/merge-state-machine.ts')
  const queue = await import('../src/server/lib/merge-queue.ts')
  const reading = machine.theRoundOpenForAnEntry(queue.readMergeEntry(t.api.getRecord(one.id)!))
  expect(reading.open).toBe(false)
  const r = await tested(one)
  expect(r.entry.state).toBe('bounced')
  expect(r.decided).toContain(reading.reason)
  expect(waitsOf(one)).toBeUndefined()
  expect(theNextRoundOf(retired.sandboxRun)).toBeUndefined()
})

it('5. any caller but the office meets today\'s rules, and the office is taken only with its mark', async () => {
  const line = await aLine(), other = await aLine()
  const brief = join(line.folder, 'briefs', 'a-made-up-brief.md'), elsewhere = join(line.folder, 'briefs', 'another-brief.md')
  writeFileSync(brief, '# A made-up brief\n'); writeFileSync(elsewhere, '# Another made-up brief\n')
  const { office, itself } = await theOffice()

  const named = await app.inject({ method: 'POST', url: `/api/agents/${line.id}/next-round`, headers: { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': office.id }, payload: { brief } })
  expect(named.statusCode, named.body).toBe(403)
  expect(theNextRoundOf(line.sandboxRun)).toBeUndefined()

  const markPath = '../src/server/lib/the-office-asks-for-a-round.ts'
  const mark = (await import(markPath)) as { asTheOfficeAsking: <T>(ask: { agent: string; brief: string }, act: () => T) => T }
  const ask = () => nextRound.askForTheNextRound({ agent: line.id, brief, workspaceId: 'default', actor: office })
  for (const asked of [ask, () => mark.asTheOfficeAsking({ agent: other.id, brief }, ask), () => mark.asTheOfficeAsking({ agent: line.id, brief: elsewhere }, ask)]) {
    expect(asked).toThrow(expect.objectContaining({ status: 403 }))
    expect(theNextRoundOf(line.sandboxRun)).toBeUndefined()
  }

  const taken = mark.asTheOfficeAsking({ agent: line.id, brief }, ask)
  expect(taken.nextRound.askedBy).toEqual({ who: itself, as: 'the office' })
  expect(theNextRoundOf(line.sandboxRun)).toMatchObject({ state: 'wanted', askedBy: { as: 'the office' } })

  const own = await app.inject({ method: 'POST', url: `/api/agents/${line.id}/next-round`, headers: asAgent(line.id), payload: { brief } })
  expect(own.statusCode, own.body).toBe(202)
  expect(theNextRoundOf(line.sandboxRun)).toMatchObject({ state: 'wanted', askedBy: { who: { kind: 'agent', id: line.id }, as: 'the run’s agent' } })
})

it('6. a line whose sandbox run has no create row keeps the door\'s 500 as its answer, and the sheriff\'s round opens', async () => {
  const line = await aLine(), sheriff = await aLine()
  const gone = t.client.sqlite.prepare("DELETE FROM changes WHERE record_id = ? AND op = 'create'").run(line.sandboxRun)
  expect(gone.changes, `the create row of ${line.sandboxRun}`).toBe(1)
  const handle = (t.client.sqlite.prepare('SELECT handle FROM agents WHERE id = ?').get(line.id) as { handle: string }).handle
  const the500 = (() => { try { nextRound.theLastSandboxRunOf(line.id, handle, 'default'); return null } catch (error) { return error as { status?: number; message?: string } } })()
  expect(the500?.status, String(the500?.message)).toBe(500)
  expect(the500?.message).toContain(`Run ${line.sandboxRun} `)
  process.env.MOLE_OFFICE_BUILD_SHERIFF = sheriff.id
  try {
    const one = ready(line.id)
    const r = await tested(one)
    expect(r.entry.state, r.decided).toBe('testing')
    const asks = waitsOf(one)!.asks
    expect(asks).toHaveLength(2)
    expect(asks[0]).toEqual({ for: 'line', agent: line.id, at: expect.any(String), said: `${the500!.message} The door was not asked.` })
    expect(r.decided).toContain(`For a fix round, the line's supervisor, agent ${line.id}, was not asked at the door: ${asks[0]!.said}`)
    expect(asks[1]).toMatchObject({ for: 'sheriff', agent: sheriff.id, status: 202, holder: sheriff.sandboxRun })
    expect(theNextRoundOf(line.sandboxRun)).toBeUndefined()
    expect(theNextRoundOf(sheriff.sandboxRun)).toMatchObject({ state: 'wanted', askedBy: { as: 'the office' } })
  } finally { delete process.env.MOLE_OFFICE_BUILD_SHERIFF }
})

it('falls back to a fresh sheriff repair after a landed launch fails, without moving the hand-back deadline', async () => {
  const line = await aLine(), sheriff = await aLine(), one = ready(line.id)
  git(home, 'clone', '-q', one.dir, join(sheriff.folder, 'repo'))
  process.env.MOLE_OFFICE_BUILD_SHERIFF = sheriff.id
  try {
    await tested(one); await look(one); await land(one)
    const before = (handBackOf(one)!.data.extra as any).handBack
    const wrapper = wrapperFor(line.sandboxRun); prepare(line.sandboxRun, wrapper)
    expect(() => nextRound.theNextRoundsLauncherEnded({ run: line.sandboxRun, wrapper, ok: false, says: 'Synthetic launcher failed before filing.', workspaceId: 'default' })).toThrow(expect.objectContaining({ status: 409 }))
    expect(theNextRoundOf(sheriff.sandboxRun)).toMatchObject({ state: 'wanted', repair: { entry: one.id } })
    git(join(sheriff.folder, 'repo'), 'fetch', '-q', one.dir, one.tip); git(join(sheriff.folder, 'repo'), 'merge', '--ff-only', 'FETCH_HEAD')
    const run = await launchThroughTheWorker(sheriff.sandboxRun)
    expect((handBackOf(one)!.data.extra as any).handBack).toMatchObject({ deadline: before.deadline, dueAt: before.dueAt, line: { run, fixRound: { agent: sheriff.id, as: 'sheriff' } } })
    const visible = String(handBackOf(one)!.data.symptom)
    expect(visible).toContain(run)
    expect(visible).toContain(before.deadline)
    expect(visible).toContain(sheriff.id)
  } finally { delete process.env.MOLE_OFFICE_BUILD_SHERIFF }
})

it('expires an unstarted landed reservation and keeps the original hand-back eligible for automatic take-back', async () => {
  const line = await aLine(), one = ready(line.id)
  await tested(one); await look(one); await land(one)
  const problem = handBackOf(one)!, facts = (problem.data.extra as any).handBack
  expect(facts.line.run).toBeNull()
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(momentOfAnInstant(facts.dueAt)! + 1)
    expect(nextRound.theRoundsToStart('default').some(r => r.run === line.sandboxRun)).toBe(false)
    expect(theNextRoundOf(line.sandboxRun)!.state).toBe('failed')
    const { takeBacksForProject } = await import('../src/server/lib/take-back.ts')
    expect(takeBacksForProject('default', problem.id).due.map(one => one.problem)).toContain(problem.id)
    expect((handBackOf(one)!.data.extra as any).handBack.dueAt).toBe(facts.dueAt)
  } finally { vi.useRealTimers() }
})
