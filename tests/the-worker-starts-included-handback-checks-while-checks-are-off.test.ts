// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The message worker starts a queued included-line check while checks are off.
 * Every record, package, line, agent and repository is made up in this test office.
 * Mutations a reviewer could run: stop all checks when the office switch is off,
 * or start checks outside the line set; each breaks this case.
 */
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import Database from 'better-sqlite3'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, thePersonsKeyHeader, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { whatOnMeans } from '../src/shared/checks-in-merges-only.ts'
import { onePass, whatTheWorkerLastSaidAbout, type WorkerSettings } from '../src/worker/index.ts'

let app: LiveApp
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []
let checkout: string
let worktree = ''
let theRun = ''
let theCheckMessage = ''
let groupMessage = ''
let inspectorId = ''
let permission = ''
const worktrees: string[] = []

function aThrowawayRepository(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'merges-only-check-')))
  const git = (...args: string[]): void => {
    execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })
  }
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'fixture@example.invalid')
  git('config', 'user.name', 'Synthetic merges-only check fixture')
  mkdirSync(join(dir, 'src', 'server', 'lib'), { recursive: true })
  writeFileSync(join(dir, 'src', 'server', 'lib', 'fixture.ts'), 'export const before = 1\n')
  git('add', '.')
  git('commit', '-q', '-m', 'Synthetic baseline')
  git('switch', '-q', '-c', 'work')
  writeFileSync(join(dir, 'src', 'server', 'lib', 'fixture.ts'), 'export const before = 1\nexport const after = 2\n')
  git('commit', '-q', '-am', 'Synthetic work')
  return dir
}

const asPerson = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string) => ({ ...asPerson, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })
/**
 * THE BUILDER WITH ITS OWN KEY, the one the office answered when the builder was registered. A run's own agent ends the
 * run only with a key, even while the key window is open, so the builder finishes its runs with it.
 */
let builderKey = ''
const asTheBuilder = () => ({ ...asAgent('builder-fixture'), 'x-mole-office-key': builderKey })

interface RecordRead { record: { id: string; data: Record<string, unknown> & { theCheck?: { message: string; execution?: { session: string; endedAt?: string } } } } }

async function request<T>(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = asPerson): Promise<T> {
  const res = await fetch(`${app.api}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`)
  return JSON.parse(text) as T
}
const record = (id: string) => request<RecordRead>(`/api/records/${id}`)

/** A builder's run in a throwaway repository of its own, finished, so the office asks for its check. Its id. */
async function aFinishedRun(title: string): Promise<string> {
  const dir = aThrowawayRepository()
  worktrees.push(dir)
  const tip = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const made = await request<RecordRead>('/api/records', 'POST', {
    kind: 'session', title,
    data: { state: 'running', servingAgent: 'builder-fixture', workingDirectory: dir, cutFrom: 'main', tip, deliveringMessage: groupMessage, doing: 'Synthetic fixture.', extra: { traceFixturePermission: permission } },
  }, asAgent('builder-fixture'))
  await request(`/api/records/${made.record.id}`, 'PATCH', { dataPatch: { state: 'finished' } }, asTheBuilder())
  return made.record.id
}

/** Passes until every check this file started has ended, so nothing it started outlives it. */
async function untilTheChecksEnd(runs: string[]): Promise<void> {
  const until = Date.now() + 20_000
  const ended = async (): Promise<boolean> => (await Promise.all(runs.map(async (run) => (await record(run)).record.data.theCheck?.execution?.endedAt !== undefined))).every(Boolean)
  while (!(await ended()) && Date.now() < until) {
    await onePass(settings, watching, [])
    await new Promise((go) => setTimeout(go, 100))
  }
}

beforeAll(async () => {
  checkout = process.cwd()
  app = await liveApp({ name: 'merges-only-check', viewport: { width: 1440, height: 1000 } })
  worktree = aThrowawayRepository()
  await request('/api/agents/started', 'POST', { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, runtime: 'claude-code', role: 'secretary' })
  inspectorId = (await request<{ agent: { id: string } }>('/api/agents/started', 'POST', { handle: 'inspector-fixture', name: 'Synthetic Inspector', runtime: 'claude-code', role: 'inspector' })).agent.id
  builderKey = (await request<{ whatToGiveIt: { key: string } }>('/api/agents/started', 'POST', { handle: 'builder-fixture', name: 'Synthetic Builder', runtime: 'claude-code', role: 'worker', chapters: ['5:full'], workArea: ['src/server/lib'] }, asAgent(THE_TEST_OFFICES_SECRETARY.handle))).whatToGiveIt.key
  const opened = await request<{ group: { id: string } }>('/api/groups', 'POST', { name: 'Synthetic merges-only check conversation', because: 'Synthetic worker fixture.', members: [THE_TEST_OFFICES_SECRETARY.handle, 'builder-fixture'].map((id) => ({ who: { kind: 'agent', id }, because: 'Synthetic test participant.' })) })
  const conversation = await request<{ messages: { id: string }[] }>(`/api/groups/${opened.group.id}`)
  groupMessage = conversation.messages[0]!.id
  settings = {
    api: app.api, workspace: 'default', session: null, stopWithPid: null, checkout, runs: 2, hops: 3, outputRoot: join(app.dir, 'runs'), mergesOnly: true,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_INSPECTION_TOOL: join(checkout, 'tests/fake-inspection-tool.mjs'), MOLE_OFFICE_FAKE_RUNTIME: join(checkout, 'tests/fake-runtime.mjs'),
      FAKE_INSPECTION_TOOL_KEY_FILE: join(app.dir, 'keys.json'), MOLE_OFFICE_DB: join(app.dir, 'panelx.db') },
  }
  permission = (await request<RecordRead>('/api/records', 'POST', { kind: 'note', title: 'Synthetic permission for the merges-only check fixture',
    summary: 'Synthetic permission for the test to change src/server/lib/fixture.ts.', data: {} })).record.id
  const tip = execFileSync('git', ['-C', worktree, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const made = await request<RecordRead>('/api/records', 'POST', {
    kind: 'session', title: 'Synthetic run sealed while the worker is merges-only',
    data: { state: 'running', servingAgent: 'builder-fixture', workingDirectory: worktree, cutFrom: 'main', tip, deliveringMessage: groupMessage, doing: 'Synthetic fixture.', extra: { traceFixturePermission: permission } },
  }, asAgent('builder-fixture'))
  await request(`/api/records/${made.record.id}`, 'PATCH', { dataPatch: { state: 'finished' } }, asTheBuilder())
  theRun = made.record.id
  theCheckMessage = (await record(theRun)).record.data.theCheck!.message
}, 180_000)

afterAll(async () => {
  for (const run of watching) if (run.adapter.alive(run.handle)) run.adapter.stop(run.handle, 'The merges-only check test ended.')
  await app?.stop()
  if (worktree !== '') rmSync(worktree, { recursive: true, force: true })
  for (const dir of worktrees) rmSync(dir, { recursive: true, force: true })
}, 60_000)


async function lineChoice(): Promise<void> {
  await request('/api/office/settings', 'POST', { changes: [{ name: 'MOLE_OFFICE_LINES_THE_INSPECTOR_ANSWERS', value: 'line-a' }], because: 'A made-up choice.' },
    { ...asPerson, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) })
}

async function aHandedBackRun(line: string): Promise<{ run: string; message: string }> {
  const dir = aThrowawayRepository()
  worktrees.push(dir)
  const tip = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const made = await request<RecordRead>('/api/records', 'POST', { kind: 'session', title: 'A made-up hand-back run',
    data: { state: 'running', servingAgent: 'builder-fixture', workingDirectory: dir, cutFrom: 'main', tip,
      deliveringMessage: groupMessage, doing: 'Made up.', extra: { traceFixturePermission: permission } } }, asAgent('builder-fixture'))
  const task = await request<RecordRead>('/api/records', 'POST', { kind: 'task', title: 'A made-up package', data: {} })
  const pkg = { bundleId: 'made-up-bundle', forTheOutside: 'Made up.', acceptance: 'Made up.',
    parent: { kind: 'decision', id: 'made-up-parent' }, lines: [line], pointIds: ['made-up-point'],
    at: '2090-01-01 12:00:00', by: { actorType: 'human', actorId: THE_PERSON },
    handedBack: [{ by: { actorType: 'agent', actorId: 'builder-fixture' }, at: '2090-01-01 12:00:01', run: made.record.id,
      points: [{ pointId: 'made-up-point', outcome: 'done', words: 'Made up.' }] }] }
  const db = new Database(join(app.dir, 'panelx.db'))
  try { db.prepare("UPDATE records SET data = json_set(data, '$.package', json(?)) WHERE id = ?").run(JSON.stringify(pkg), task.record.id) }
  finally { db.close() }
  await request(`/api/records/${made.record.id}`, 'PATCH', { dataPatch: { state: 'finished' } }, asTheBuilder())
  return { run: made.record.id, message: (await record(made.record.id)).record.data.theCheck!.message }
}

it('starts only the included hand-back check with checks switched off', async () => {
  await lineChoice()
  await request('/api/office/checks-in-merges-only', 'POST', { on: true, because: 'Set up a waiting excluded check.' },
    { ...asPerson, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) })
  const excluded = await aHandedBackRun('line-b')
  await request('/api/office/checks-in-merges-only', 'POST', { on: false, because: 'A made-up off choice.' },
    { ...asPerson, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) })
  const included = await aHandedBackRun('line-a')
  const pass = await onePass(settings, watching, [])
  expect(pass.started.map(one => one.messageId)).toContain(included.message)
  expect(pass.started.map(one => one.messageId)).not.toContain(excluded.message)
  expect(pass.started.map(one => one.messageId)).not.toContain(theCheckMessage)
  await untilTheChecksEnd([included.run])
}, 180_000)
