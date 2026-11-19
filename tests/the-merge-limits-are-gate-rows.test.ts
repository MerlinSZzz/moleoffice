// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Every office, record, name, path and value in this test is made up. No merge tool or worker starts.
 * The step and tool doors run against a throwaway database and git repository.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

import { gateNamed } from '../src/config/gates.mjs'
import { A_TOOL_RUN_ENDED, theMoveAStepMakes, type MergeState, type WhatHappenedToAnEntry } from '../src/shared/merge-queue.ts'

const THE_WORKER = 'mole-office/the-message-worker'
const WORKSPACE = 'default'

const as = (type: 'agent' | 'human', id: string) => ({ 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': type, 'x-mole-office-actor-id': id })
const asPerson = as('human', THE_TEST_OFFICES_OWNER.id)
const asSecretary = as('agent', 'again-secretary')
const asWorker = as('agent', 'again-worker')
const asInspector = as('agent', 'again-inspector')
const asTheOffice = as('agent', THE_WORKER)

let t: TestDb
let app: FastifyInstance
let base: string
let main: string
let repository: string
let queue: typeof import('../src/server/lib/merge-queue.ts')
let names = 0

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

const SYNTHETIC_AUTHOR = { GIT_AUTHOR_NAME: 'Synthetic', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Synthetic', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' }
const commit = (dir: string, message: string): void => {
  execFileSync('git', ['-C', dir, 'commit', '-q', '--allow-empty', '-m', message], { stdio: 'ignore', env: { ...process.env, ...SYNTHETIC_AUTHOR } })
}

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}

const step = (id: string, name: string, facts: Record<string, unknown>) => call('POST', `/api/merge-queue/${id}/step`, asTheOffice, { step: name, facts })
const askAgain = (id: string) => call('POST', `/api/merge-queue/${id}/land-again`, asSecretary, { because: 'Made-up: the backup is mended.' })

/** A worker's clone of main with one commit on `work`, sealed as a finished run, submitted, and released by the inspector. */
async function aReleasedEntry(): Promise<{ id: string; run: string; commit: string; content: Record<string, string> }> {
  names += 1
  const name = `entry-${String(names)}`
  const dir = join(base, name)
  execFileSync('git', ['clone', '-q', main, dir], { stdio: 'ignore' })
  git(dir, 'switch', '-q', '-c', 'work')
  writeFileSync(join(dir, 'src', `${name}.txt`), `Synthetic change ${name}.\n`)
  git(dir, 'add', '-A')
  commit(dir, `Synthetic submission ${name}`)
  const run = t.api.createRecord({
    kind: 'session',
    title: `Synthetic run ${name}`,
    workspaceId: WORKSPACE,
    actor: { type: 'agent', id: 'again-worker' },
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'again-worker', cutFrom: 'main', workingDirectory: realpathSync(dir) },
  }).id
  expect((await call('PATCH', `/api/records/${run}`, asWorker, { dataPatch: { state: 'finished' } })).status).toBe(200)
  const submitted = await call('POST', '/api/merge-queue', asWorker, { run, changeset: { adapter: 'git', repository, branch: name } })
  expect(submitted.status, submitted.raw).toBe(201)
  const sealId = String(t.api.getRecord(run)!.data['sealedTip'])
  const seal = t.api.getRecord(sealId)!.data['seal'] as { hash: string; git: { commit: string; forkBase: string; files: { path: string; hash: string }[] } }
  const read = { sealId, sealHash: seal.hash, worktree: realpathSync(dir), tip: seal.git.commit, ofItsOwn: true, says: 'Synthetic: a check of its own detached tree.' }
  const assembled = await call('POST', `/api/checks/${run}/assembled`, asInspector, {
    changes: seal.git.files.map((one) => ({ path: one.path, changes: 'a synthetic diff' })),
    base: { ref: seal.git.forkBase, how: 'fork point', says: 'Synthetic: the fixed fork base of the seal.' },
    read,
  })
  expect(assembled.status, assembled.raw).toBe(201)
  const verdict = await call('POST', `/api/checks/${run}`, asInspector, { verdict: 'released', traced: syntheticTrace(t, seal.git.files.map((one) => one.path)), check: 'Synthetic: read the changes and found nothing missing.', chaptersRead: [], read })
  expect(verdict.status, verdict.raw).toBe(201)
  return { id: String(submitted.body['entry'].id), run, commit: seal.git.commit, content: Object.fromEntries(seal.git.files.map((one) => [one.path, one.hash])) }
}

/** Take a released entry to testing on main as it stands now, through the step door as the merge tool would. */
async function aTestingEntry(): Promise<{ id: string; run: string; mainAt: string }> {
  const one = await aReleasedEntry()
  const mainAt = git(main, 'rev-parse', 'HEAD')
  expect((await step(one.id, 'pinned', { files: one.content })).body['entry'].state).toBe('judged')
  expect((await step(one.id, 'integrating', {})).body['entry'].state).toBe('integrating')
  expect((await step(one.id, 'integrated', { result: one.commit, mainAt, files: one.content })).body['entry'].state).toBe('testing')
  return { id: one.id, run: one.run, mainAt }
}

async function aLandingEntry(): Promise<{ id: string; run: string; mainAt: string }> {
  const one = await aTestingEntry()
  const { mainAt } = one
  expect((await step(one.id, 'tested', { green: true, log: '/synthetic/suite.log', ran: 1, passed: 1 })).status).toBe(200)
  const landing = await step(one.id, 'landing', { mainAt })
  expect(landing.status, landing.raw).toBe(200)
  expect(landing.body['entry'].state).toBe('landing')
  return { id: one.id, run: one.run, mainAt }
}

/** One merge tool run through the tool doors that ends without moving the entry, as the worker records it. */
async function aRunThatEnds(id: string, reason: string): Promise<Record<string, any>> {
  const session = t.api.createRecord({ kind: 'session', title: 'Synthetic merge tool run', workspaceId: WORKSPACE, actor: { type: 'agent', id: THE_WORKER }, origin: 'fixture', data: { state: 'running', runtime: 'merge-tool' } }).id
  const started = await call('POST', `/api/merge-queue/${id}/tool-started`, asTheOffice, { session, log: '/synthetic/the-merger.log' })
  expect(started.status, started.raw).toBe(200)
  const ended = await call('POST', `/api/merge-queue/${id}/tool-ended`, asTheOffice, { session, reason })
  expect(ended.status, ended.raw).toBe(200)
  // A repeated report of the same ending must neither count nor tell the secretary again.
  const repeated = await call('POST', `/api/merge-queue/${id}/tool-ended`, asTheOffice, { session, reason })
  expect(repeated.status, repeated.raw).toBe(200)
  // The worker closes the run after it records the ending.
  t.api.patchRecord(session, { dataPatch: { state: 'crashed' } }, { type: 'agent', id: THE_WORKER })
  return ended.body['entry']
}


function count(gate: string) {
  return t.client.sqlite.prepare('SELECT would_stop, stopped, reminded FROM gate_counts WHERE gate = ?').get(gate)
}
const countedOnce = { would_stop: 1, stopped: 0, reminded: 0 }
async function readEntry(id: string) {
  const read = await call('GET', `/api/merge-queue/${id}`, asSecretary)
  expect(read.status, read.raw).toBe(200)
  return read.body['entry']
}
function linesToTheSecretary(run: string): string[] {
  const rows = t.client.sqlite.prepare("SELECT title FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ? ORDER BY rowid DESC").all(run) as { title: string }[]
  return rows.map(row => row.title).filter(title => title.startsWith('landing stalled '))
}
async function backToTesting(one: { id: string; mainAt: string }) {
  expect((await step(one.id, 'integrating', {})).body['entry'].state).toBe('integrating')
  const stored = t.api.getRecord(one.id)!.data
  const integration = stored['integration'] as { result: string; files: Record<string, string> }
  const integrated = await step(one.id, 'integrated', { result: integration.result, mainAt: one.mainAt, files: integration.files })
  expect(integrated.status, integrated.raw).toBe(200)
  expect(integrated.body['entry'].state).toBe('testing')
}

describe('the merge limits are gate rows', () => {
  it('uses each row ordinary default without the office, and accepts the limits supplied by its caller', () => {
    const landing = Number(gateNamed('landing-attempts').defaults.ordinary)
    const tool = Number(gateNamed('tool-runs-in-one-place').defaults.ordinary)
    expect(theMoveAStepMakes('testing', { step: 'main-moved-while-testing', attempts: landing - 1 })).toEqual({ move: 'to', state: 'judged', attempts: landing })
    expect(theMoveAStepMakes('landing', { step: 'main-moved', attempts: landing })).toEqual({ move: 'bounce', reason: 'churn', attempts: landing + 1 })
    expect(theMoveAStepMakes('testing', { step: A_TOOL_RUN_ENDED, runs: tool - 2 })).toEqual({ move: 'to', state: 'testing', runs: tool - 1 })
    expect(theMoveAStepMakes('testing', { step: A_TOOL_RUN_ENDED, runs: tool - 1 })).toEqual({ move: 'bounce', reason: 'stalled', runs: tool })
    // This signature lets the criterion compile before the optional argument is implemented.
    const withLimits: (state: MergeState, happened: WhatHappenedToAnEntry, limits: { landingAttempts: number; toolRuns: number }) => ReturnType<typeof theMoveAStepMakes> = theMoveAStepMakes
    const limits = { landingAttempts: 1, toolRuns: 2 }
    expect(withLimits('landing', { step: 'main-moved', attempts: 0 }, limits)).toEqual({ move: 'to', state: 'judged', attempts: 1 })
    expect(withLimits('testing', { step: 'main-moved-while-testing', attempts: 1 }, limits)).toEqual({ move: 'bounce', reason: 'churn', attempts: 2 })
    expect(withLimits('testing', { step: A_TOOL_RUN_ENDED, runs: 0 }, limits)).toEqual({ move: 'to', state: 'testing', runs: 1 })
    expect(withLimits('testing', { step: A_TOOL_RUN_ENDED, runs: 1 }, limits)).toEqual({ move: 'bounce', reason: 'stalled', runs: 2 })
  })

  it('counts only the churn bounce after main moves beyond the setting, and says the stored count', async () => {
    vi.stubEnv('MOLE_OFFICE_LANDING_ATTEMPTS', '1')
    const one = await aTestingEntry()
    const first = await step(one.id, 'main-moved-while-testing', { mainAt: '1'.repeat(40) })
    expect(first.status, first.raw).toBe(200)
    expect(first.body['entry'].state).toBe('judged')
    expect(first.body['entry'].machine.attempts).toBe(1)
    expect(count('landing-attempts')).toBeUndefined()
    await backToTesting(one)
    expect((await step(one.id, 'tested', { green: true, log: '/synthetic/suite.log' })).status).toBe(200)
    expect((await step(one.id, 'landing', { mainAt: one.mainAt })).status).toBe(200)
    const second = await step(one.id, 'main-moved', { mainAt: '2'.repeat(40) })
    expect(second.status, second.raw).toBe(200)
    expect(second.body['entry'].state).toBe('bounced')
    expect(count('landing-attempts')).toEqual(countedOnce)
    const entry = second.body['entry']
    expect(entry.machine.attempts).toBe(2)
    expect(entry.machine.bounced.says).toContain(`moved under it ${String(entry.machine.attempts)} times`)
  })

  it('asks for a testing tool again without counting, then counts its stalled bounce at the setting', async () => {
    vi.stubEnv('MOLE_OFFICE_TOOL_RUNS_IN_ONE_PLACE', '2')
    const one = await aTestingEntry()
    const first = await aRunThatEnds(one.id, 'Made-up: the first test tool crashed.')
    expect(first.state).toBe('testing')
    expect(first.toolWanted).not.toBeNull()
    expect(count('tool-runs-in-one-place')).toBeUndefined()
    const second = await aRunThatEnds(one.id, 'Made-up: the second test tool crashed.')
    expect(second.state).toBe('bounced')
    expect(count('tool-runs-in-one-place')).toEqual(countedOnce)
    expect(second.machine.stalls.runs).toBe(2)
    expect(second.machine.bounced.says).toContain('ended 2 times without moving it')
  })

  it('keeps a landing stalled after its limit is raised, tells the secretary once, and accepts ask-again', async () => {
    vi.stubEnv('MOLE_OFFICE_TOOL_RUNS_IN_ONE_PLACE', '2')
    const one = await aLandingEntry()
    await aRunThatEnds(one.id, 'Made-up: the first backup failed.')
    const stopped = await aRunThatEnds(one.id, 'Made-up: the second backup failed.')
    expect(stopped.toolWanted).toBeNull()
    expect(count('tool-runs-in-one-place')).toEqual(countedOnce)
    expect(linesToTheSecretary(one.run)).toHaveLength(1)
    vi.stubEnv('MOLE_OFFICE_TOOL_RUNS_IN_ONE_PLACE', '5')
    const read = await readEntry(one.id)
    expect(read.waitsOn).toContain('a person:')
    const { oneLineForTheSecretary } = await import('../src/server/lib/merge-state-machine.ts')
    expect(oneLineForTheSecretary(read)).toContain('→ a person must look')
    expect(linesToTheSecretary(one.run)).toHaveLength(1)
    expect(linesToTheSecretary(one.run)[0]).toContain('→ a person must look')
    expect(count('tool-runs-in-one-place')).toEqual(countedOnce)
    const asked = await askAgain(one.id)
    expect(asked.status, asked.raw).toBe(200)
    expect(asked.body['entry'].toolWanted).not.toBeNull()
    expect(asked.body['entry'].machine.stalls.runs).toBe(0)
    expect(count('tool-runs-in-one-place')).toEqual(countedOnce)
  })

  it('keeps a landing running after its limit is lowered until its next run ends, then tells and counts once', async () => {
    vi.stubEnv('MOLE_OFFICE_TOOL_RUNS_IN_ONE_PLACE', '3')
    const one = await aLandingEntry()
    await aRunThatEnds(one.id, 'Made-up: the first backup failed.')
    vi.stubEnv('MOLE_OFFICE_TOOL_RUNS_IN_ONE_PLACE', '1')
    const read = await readEntry(one.id)
    expect(read.waitsOn).not.toContain('a person:')
    expect(linesToTheSecretary(one.run)).toHaveLength(0)
    expect(count('tool-runs-in-one-place')).toBeUndefined()
    const refused = await askAgain(one.id)
    expect(refused.status, refused.raw).toBe(409)
    expect(count('tool-runs-in-one-place')).toBeUndefined()
    const stopped = await aRunThatEnds(one.id, 'Made-up: the next backup failed.')
    expect(stopped.waitsOn).toContain('a person:')
    expect(linesToTheSecretary(one.run)).toHaveLength(1)
    expect(count('tool-runs-in-one-place')).toEqual(countedOnce)
  })
})
beforeAll(async () => {
  t = await freshDb()
  base = realpathSync(mkdtempSync(join(tmpdir(), 'merge-gate-limits-')))
  app = (await apiApp()).app
  queue = await import('../src/server/lib/merge-queue.ts')
  for (const [handle, role, payload] of [
    ['again-secretary', 'secretary', {}],
    ['again-inspector', 'inspector', {}],
    ['again-worker', undefined, { workArea: ['src'] }],
  ] as const) {
    const r = await call('POST', '/api/agents/started', asPerson, { handle, name: `Synthetic ${handle}`, ...(role === undefined ? {} : { role }), ...payload })
    expect(r.status, r.raw).toBe(201)
  }
  main = join(base, 'main')
  mkdirSync(join(main, 'src'), { recursive: true })
  git(main, 'init', '-q', '-b', 'main')
  writeFileSync(join(main, 'src', 'a.txt'), 'Synthetic baseline.\n')
  git(main, 'add', '-A')
  commit(main, 'Synthetic baseline')
  main = realpathSync(main)
  const repositories = await import('../src/server/lib/repositories.ts')
  repository = repositories.registerRepository({ workspaceId: WORKSPACE, name: 'fixture-land-again', root: main, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } }).id
}, 60_000)

beforeEach(() => {
  t.client.sqlite.prepare('DELETE FROM gate_counts WHERE gate IN (?, ?)').run('landing-attempts', 'tool-runs-in-one-place')
  vi.stubEnv('MOLE_OFFICE_LANDING_ATTEMPTS', gateNamed('landing-attempts').defaults.ordinary)
  vi.stubEnv('MOLE_OFFICE_TOOL_RUNS_IN_ONE_PLACE', gateNamed('tool-runs-in-one-place').defaults.ordinary)
})

/** FREE THE LANE AFTER EACH CASE. A landing entry cannot be withdrawn, so main moving sends it back to judged first. */
afterEach(async () => {
  const holder = queue.whoOccupies(main)
  vi.unstubAllEnvs()
  if (holder === null) return
  if (holder.state === 'landing') await step(holder.entry, 'main-moved', { mainAt: '0'.repeat(40) })
  await call('POST', `/api/merge-queue/${holder.entry}/withdraw`, asPerson, { because: 'Synthetic: the case is over; the lane is freed for the next one.' })
})

afterAll(async () => {
  await app?.close()
  t?.close()
  if (base !== undefined) rmSync(base, { recursive: true, force: true })
})

