// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A replaced repair reservation or a wait for the previous run tells the line supervisor and the secretary.
 */
import { execFileSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
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
let coordinator: string, submitter: string, checker: string, secretary: string
const names = ['HOME', 'MOLE_OFFICE_GATE_FEW_FEATURE_REDS', 'MOLE_OFFICE_MESSAGE_WORKER', 'MOLE_OFFICE_BUILD_SHERIFF', 'MOLE_OFFICE_FEW_RED_FILES', 'MOLE_OFFICE_HAND_BACK_HOURS', 'MOLE_OFFICE_GATE_HOUSE_RULES', 'MOLE_OFFICE_GATE_WIDE_RED', 'MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND', 'MOLE_OFFICE_GATE_FLAKY', 'MOLE_OFFICE_RED_FIXING', 'MOLE_OFFICE_CLAUDE_SUPERVISORS_AT_ONCE']
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
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle: 'clerk', name: 'Made-up secretary', role: 'secretary' } })
  expect(registered.statusCode, registered.body).toBe(201); secretary = String(registered.json().agent.id)

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

function messagesAfter(existing: Set<string>, entry: string, line: string, why: RegExp) {
  const messages = t.api.listRecords({ workspaceId: 'default', kind: 'message' }).filter(m => !existing.has(m.id))
  for (const recipient of [line, secretary]) {
    const notice = messages.find(m => (m.data.to as { id: string }[] | undefined)?.some(to => to.id === recipient) && String(m.data.body).includes(entry))
    expect(notice, `The supervisor or secretary must be told about entry ${entry}`).toBeDefined()
    expect(String(notice!.data.body)).toContain(line)
    expect(String(notice!.data.body)).toMatch(/did not start/i)
    expect(String(notice!.data.body)).toMatch(why)
    expect(String(notice!.data.body)).toMatch(/sheriff|no one else/i)
  }
}

it('tells the line supervisor and secretary when another round replaces the reservation', async () => {
  const line = await aLine(), one = ready(line.id)
  await tested(one); await look(one); await land(one)
  const round = theNextRoundOf(line.sandboxRun)!
  const existing = new Set(t.api.listRecords({ workspaceId: 'default', kind: 'message' }).map(m => m.id))
  nextRound.askForTheNextRound({ agent: line.id, brief: round.brief.path, workspaceId: 'default', actor: person })
  messagesAfter(existing, one.id, line.id, /replaced/i)
})

it('tells the line supervisor and secretary when the previous run holds a repair too long', async () => {
  const line = await aLine(), one = ready(line.id)
  await tested(one); await look(one); await land(one)
  const future = new Date(Date.now() + 30 * 60_000).toISOString()
  t.client.sqlite.prepare("UPDATE records SET data=json_set(data, '$.nextRound.repair.dueAt', ?) WHERE id=?").run(future, line.sandboxRun)
  t.client.sqlite.prepare("UPDATE records SET data=json_set(data, '$.waitsForAFixRound.dueAt', ?) WHERE id=?").run(future, one.id)
  rows.push(resources.registerResource({ workspaceId: 'default', sessionRecordId: line.sandboxRun, type: 'process', key: String(process.pid), actor: person }).id)
  const existing = new Set(t.api.listRecords({ workspaceId: 'default', kind: 'message' }).map(m => m.id))
  nextRound.theRoundsToStart('default')
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(Date.now() + 21 * 60_000)
    nextRound.theRoundsToStart('default')
    expect(theNextRoundOf(line.sandboxRun)!.state).toBe('failed')
    messagesAfter(existing, one.id, line.id, /waited/i)
  } finally { vi.useRealTimers() }
})

it('tells the line supervisor and secretary when the entry is withdrawn before the repair starts', async () => {
  const line = await aLine(), one = ready(line.id)
  await tested(one); await look(one); await land(one)
  const existing = new Set(t.api.listRecords({ workspaceId: 'default', kind: 'message' }).map(m => m.id))
  t.client.sqlite.prepare("UPDATE records SET data=json_set(data, '$.state', 'withdrawn') WHERE id=?").run(one.id)
  nextRound.theRoundsToStart('default')
  expect(theNextRoundOf(line.sandboxRun)!.state).toBe('failed')
  messagesAfter(existing, one.id, line.id, /withdrawn/i)
})
