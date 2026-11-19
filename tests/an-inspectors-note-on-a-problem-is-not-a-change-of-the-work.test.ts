// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
/** The old check-window fixture omitted submitted identity. New finishes remain real Git seals; each synthetic assembly and verdict now names that seal so every original guard assertion reaches its intended boundary. */
/** Fixture update: the inspector's edit of the worker run is now refused at the door, as a run's record is changed only by those who hold the run; the case reads that refusal. */
import type { SealedTip } from '../src/shared/sealed-tip.ts'
/**
 * Problem uWrryx5475xy: a seen_in addition made an hour before assembly blocked every later
 * verdict. These isolated API checks exercise actual ledger writes and verdicts. A note is an
 * inspector-authored annotation; adding it or its problem link does not repair the worker's work.
 * Mutation: restore the lifetime join (remove window and finding filters), then rerun this file.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, liveApp, waitForThePage, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let db: TestDb
let app: FastifyInstance
let count = 0

/**
 * WHERE THE FIXTURE RUNS WORKED: a throwaway repository, never this checkout (message VtCw66ZmGn74). A run
 * finished in the real checkout seals the checkout, so this file read the checkout's own state: it went red whenever the
 * checkout held uncommitted work, and its seal read every file of it, which kept every document from landing alone
 * . The seal is still a real git seal: a baseline on main, and one change on a branch.
 */
let worktree: string
function aThrowawayRepository(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'an-inspectors-note-')))
  const git = (...args: string[]): void => {
    execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })
  }
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'fixture@example.invalid')
  git('config', 'user.name', 'Synthetic inspector-note fixture')
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(join(dir, 'src', 'fixture.txt'), 'before\n')
  git('add', '.')
  git('commit', '-q', '-m', 'Synthetic baseline')
  git('switch', '-q', '-c', 'work')
  writeFileSync(join(dir, 'src', 'fixture.txt'), 'before\nthe work\n')
  git('commit', '-q', '-am', 'Synthetic work')
  return dir
}
const headers = (id: string, session?: string) => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  ...(session ? { 'x-mole-office-session': session } : {}),
})
const person = { ...headers(THE_PERSON), 'x-mole-office-actor-type': 'human' }
async function register(by: Record<string, string>, handle: string, role: string) {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: by,
    payload: { handle, name: handle, role, ...(role === 'worker' ? { workArea: ['src'] } : {}) } })
  expect(reply.statusCode, reply.body).toBe(201)
}
async function record(by: string, kind: string, data: Record<string, unknown>, title = 'A fixture record') {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers: headers(by), payload: { kind, title, data } })
  expect(reply.statusCode, reply.body).toBe(201)
  return reply.json().record.id as string
}
async function fixture() {
  const worker = `window-worker-${++count}`
  await register(headers(THE_TEST_OFFICES_SECRETARY.handle), worker, 'worker')
  const run = await record(worker, 'session', { state: 'finished', servingAgent: worker, workingDirectory: worktree, doing: 'Fixture work' })
  const problem = await record(worker, 'problem', { symptom: 'Fixture symptom', seen_in: ['first occurrence'] })
  return { worker, run, problem }
}
function submittedIdentity(run: string) {
  const id = db.api.getRecord(run)!.data['sealedTip'] as string
  const seal = db.api.getRecord(id)!.data['seal'] as unknown as SealedTip
  return {
    base: { ref: seal.git!.forkBase, how: 'fork point', says: 'Synthetic check of the sealed fixture base.' },
    read: { sealId: id, sealHash: seal.hash, worktree: seal.git!.directory, tip: seal.git!.commit, ofItsOwn: false, says: 'Synthetic fixture identity; no model judged work.' },
  }
}
async function assemble(run: string, session?: string) {
  const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}/assembled`, headers: headers('window-inspector', session), payload: { changes: [], ...submittedIdentity(run) } })
  expect(reply.statusCode, reply.body).toBe(201)
  return reply.json().whatTheCheckWouldRead.assemblyId as string
}
async function patch(id: string, dataPatch: Record<string, unknown>) {
  const reply = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: headers('window-inspector'), payload: { dataPatch } })
  expect(reply.statusCode, reply.body).toBe(200)
}
function verdict(run: string, session?: string) {
  return app.inject({ method: 'POST', url: `/api/checks/${run}`, headers: headers('window-inspector', session),
    payload: { read: submittedIdentity(run).read, traced: syntheticTrace(db, ['src/fixture.txt']), verdict: 'released', check: 'A fixture check, no model ran.', chaptersRead: [] } })
}
beforeAll(async () => {
  worktree = aThrowawayRepository()
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await register(person, THE_TEST_OFFICES_SECRETARY.handle, 'secretary')
  await register(person, 'window-inspector', 'inspector')
})
afterAll(async () => {
  await app.close()
  db.close()
  rmSync(worktree, { recursive: true, force: true })
})

describe('the inspector only changes the work inside its own check window', () => {
  it('ignores edits before assembly, including a prior check of the same worker', async () => {
    const { run, problem } = await fixture()
    await patch(problem, { symptom: 'An earlier edit, before this check began' })
    await assemble(run)
    const reply = await verdict(run)
    expect(reply.statusCode, reply.body).toBe(201)
  })
  it('allows an appended occurrence, a problem link and an annotation during the check', async () => {
    const { run, problem } = await fixture()
    await assemble(run)
    await patch(problem, { seen_in: ['first occurrence', 'this check'] })
    const note = await record('window-inspector', 'annotation', {
      body: 'Fixture inspection note', context: { target: { kind: 'record', recordId: problem, workspaceId: 'default' } },
    })
    const link = await app.inject({ method: 'POST', url: '/api/links', headers: headers('window-inspector'),
      payload: { fromId: problem, toId: note, type: 'about' } })
    expect(link.statusCode, link.body).toBe(201)
    const reply = await verdict(run)
    expect(reply.statusCode, reply.body).toBe(201)
  })
  it('allows whole-data occurrence append without losing the other fields', async () => {
    const { run, problem } = await fixture()
    await assemble(run)
    const reply = await app.inject({ method: 'PATCH', url: `/api/records/${problem}`, headers: headers('window-inspector'),
      payload: { data: { ...db.api.getRecord(problem)!.data, seen_in: ['first occurrence', 'whole replacement'] } } })
    expect(reply.statusCode, reply.body).toBe(200)
    expect((await verdict(run)).statusCode).toBe(201)
  })
  it.each(['symptom', 'seen_in'])('still refuses a change to existing problem %s', async (field) => {
    const { run, problem } = await fixture()
    await assemble(run)
    await patch(problem, field === 'symptom' ? { symptom: 'Inspector repaired it' } : { seen_in: ['rewrote the original'] })
    const reply = await verdict(run)
    expect(reply.statusCode, reply.body).toBe(403)
    expect(reply.body).toContain(problem)
  })
  it('still refuses an inspector edit of the worker run', async () => {
    const { run } = await fixture()
    await assemble(run)
    // The door refuses the edit itself, before any verdict: the inspector does not hold the worker's run.
    const { WHO_MAY_CHANGE_A_RUN } = await import('../src/server/lib/records.ts')
    const reply = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: headers('window-inspector'),
      payload: { dataPatch: { doing: 'Inspector rewrote the work' } } })
    expect(reply.statusCode, reply.body).toBe(403)
    expect(reply.body).toContain(WHO_MAY_CHANGE_A_RUN)
  })
  it('refuses a verdict that has no assembly to establish its window', async () => {
    const { run } = await fixture()
    const reply = await verdict(run)
    expect(reply.statusCode, reply.body).toBe(409)
    expect(reply.body).toContain('No assembly is recorded')
  })
  it('keeps simultaneous checks of one run separate even when the second assembles later', async () => {
    const { run, problem } = await fixture()
    const first = await record('window-inspector', 'session', { servingAgent: 'window-inspector', state: 'running' }, 'First fixture check')
    const second = await record('window-inspector', 'session', { servingAgent: 'window-inspector', state: 'running' }, 'Second fixture check')
    const firstAssembly = await assemble(run, first)
    await patch(problem, { symptom: 'Edited between assemblies' })
    const secondAssembly = await assemble(run, second)
    expect(firstAssembly).not.toBe(secondAssembly)
    expect((await verdict(run, first)).statusCode).toBe(403)
    expect((await verdict(run, second)).statusCode).toBe(201)
  })
})

// The person sees the accepted verdict on the run page, after an inspector adds an occurrence.
it('shows a check that reached reporting after its inspector recorded a problem occurrence', async () => {
  const { run, problem } = await fixture()
  await assemble(run)
  await patch(problem, { seen_in: ['first occurrence', 'browser fixture check'] })
  const reply = await verdict(run)
  expect(reply.statusCode, reply.body).toBe(201)
  const world = await liveApp({ name: 'inspector-problem-note', viewport: { width: 390, height: 844 }, database: db.file })
  try {
    await world.page.goto(`${world.site}/#/r/${run}`, { waitUntil: 'domcontentloaded' })
    await waitForThePage(world.page)
    expect(await world.page.locator('.chk-word').textContent()).toBe('Waiting for its report to be confirmed')
    expect(await world.page.locator('.chk').textContent()).toContain('window-inspector')
  } finally { await world.stop() }
}, 60_000)
