// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CARRIED TEST KEEPS ITS PROOF IN THE OFFICE'S READING (item 23, 30 October 2026). A round does not prove again a
 * commit it carries unchanged from an earlier round of its line. The honour reading's fifth signal, `proved every test
 * by mutation`, read only this run's report, so a run that carried an unchanged test file read missing for it.
 *
 * WHAT THIS FILE PROVES, on made-up runs of a made-up checkout, through the reading door:
 *   1. A test file this run's seal names with the same path and the same bytes as an earlier sealed run of the same
 *      agent is proved by that earlier run's report when it names a mutation proof with a hash for it. The signal is
 *      earned, and its evidence names this run's report and then the earlier one.
 *   2. A test file whose bytes changed since the earlier run is not proved by that run's report.
 *   3. An earlier run of another agent does not prove it.
 *   4. An earlier run whose report names the file with no hash beside it does not prove it.
 *   5. A run sealed after this one does not prove it.
 *
 * MUTATIONS, each after a green control run and each restored: listed by the Code commit that makes them possible.
 *
 * Every fixture is synthetic: the agents, the runs, their reports and the checkout are made up here, and nothing
 * reaches the live server.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})
const WORKER = 'carry-worker'
const OTHER = 'carry-other'
/**
 * The fifth signal, read from the list the reading names its signals by, as the reading itself reads it. That module
 * reaches the database, so it is imported once the made-up one is open.
 */
let SIGNAL: string
const KEPT = 'carry-code/tests/kept.test.ts'
const CHANGED = 'carry-code/tests/changed.test.ts'

let t: TestDb
let app: FastifyInstance
const made: string[] = []

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

/** One commit on the made-up checkout's work branch, writing each named file. */
function aCommit(dir: string, files: Record<string, string>, message: string): void {
  for (const [path, text] of Object.entries(files)) writeFileSync(join(dir, path), text)
  git(dir, 'add', '.')
  git(dir, 'commit', '-m', message)
}

/**
 * A made-up checkout: two test files on main, both changed by the first commit of the work branch. Each case's files hold
 * words of their own, so a run of an earlier case never sealed the same bytes.
 */
function aCheckout(label: string): string {
  mkdirSync('.logs', { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs', 'carried-proof-fixture-'))
  made.push(dir)
  git(dir, 'init', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic carried-proof fixture')
  mkdirSync(join(dir, 'carry-code', 'tests'), { recursive: true })
  aCommit(dir, { [KEPT]: `made-up kept test of ${label}, at main\n`, [CHANGED]: `made-up changed test of ${label}, at main\n` }, 'Synthetic baseline')
  git(dir, 'switch', '-c', 'work')
  aCommit(dir, { [KEPT]: `made-up kept test of ${label}, argued once\n`, [CHANGED]: `made-up changed test of ${label}, first\n` }, 'Synthetic first round')
  return dir
}

/** The second round's commit: only the changed test file changes again, and the kept one is carried as it was. */
function theSecondRound(dir: string): void {
  aCommit(dir, { [CHANGED]: `${readFileSync(join(dir, CHANGED), 'utf8')}made-up changed test, second\n` }, 'Synthetic second round')
}

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** One run of an agent in the checkout, open and unfinished. */
async function aRun(agent: string, title: string, dir: string): Promise<string> {
  const opened = await app.inject({
    method: 'POST', url: '/api/records', headers: asAgent(agent),
    payload: { kind: 'session', title, data: { state: 'running', runtime: 'claude-code', servingAgent: agent, workingDirectory: dir, cutFrom: 'main' } },
  })
  expect(opened.statusCode, opened.body).toBe(201)
  return (opened.json() as { record: { id: string } }).record.id
}

/** The run's report, linked `about` it, in the words given. */
async function aReport(agent: string, run: string, text: string): Promise<string> {
  const made = await app.inject({
    method: 'POST', url: '/api/records', headers: asAgent(agent),
    payload: { kind: 'report', title: 'What the made-up round left behind', data: { for: 'carry-starter', date: '2026-10-30', blocks: [{ id: 'b-1', type: 'text', heading: 'The proofs', text }] } },
  })
  expect(made.statusCode, made.body).toBe(201)
  const report = (made.json() as { record: { id: string } }).record.id
  const linked = await app.inject({ method: 'POST', url: '/api/links', headers: asAgent(agent), payload: { fromId: report, toId: run, type: 'about' } })
  expect(linked.statusCode, linked.body).toBe(201)
  return report
}

/** The finish, which seals the checkout's tip and so names the test files the run's branch changed. */
async function finish(agent: string, run: string): Promise<void> {
  const finished = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asAgent(agent), payload: { dataPatch: { state: 'finished' } } })
  expect(finished.statusCode, finished.body).toBe(200)
}

/** One sealed run with its report: filed, reported on, finished. */
async function aSealedRun(agent: string, title: string, dir: string, text: string): Promise<{ run: string; report: string }> {
  const run = await aRun(agent, title, dir)
  const report = await aReport(agent, run, text)
  await finish(agent, run)
  return { run, report }
}

async function theFifthSignal(run: string): Promise<{ earned?: { evidence: string[] }; missing?: { because: string } }> {
  const read = await app.inject({ method: 'GET', url: `/api/honour-board/runs/${run}`, headers: asAgent('carry-starter') })
  expect(read.statusCode, read.body).toBe(200)
  const reading = read.json() as { signals: { signal: string; evidence: string[] }[]; missing: { signal: string; because: string }[] }
  return { earned: reading.signals.find((one) => one.signal === SIGNAL), missing: reading.missing.find((one) => one.signal === SIGNAL) }
}

/**
 * THE FILE THE SIGNAL SAYS IS WITHOUT A PROOF, read from the names in its reason and not from the reason's own words,
 * which the reading may change: the reason names the file left without one, and not the file that is proved.
 */
function expectWithoutAProof(five: { missing?: { because: string } }, without: string, proved: string): void {
  expect(five.missing?.because, JSON.stringify(five)).toContain(without)
  expect(five.missing?.because).not.toContain(proved)
}

/** A made-up proof line for a file: its path and a sha256-long hash beside it. */
const aProof = (path: string, digit: string) => `Mutation proof for ${path}: ${digit.repeat(64)}, after a control run.`

beforeAll(async () => {
  t = await freshDb()
  SIGNAL = (await import('../src/server/lib/honour.ts')).HONOUR_SIGNALS[4]
  app = (await apiApp()).app
  await app.ready()
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: `${THE_TEST_OFFICES_SECRETARY.name}, the fixture secretary`, role: 'secretary' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'carry-starter', name: 'Carry fixture starter', role: 'supervisor' })
  for (const handle of [WORKER, OTHER]) {
    await register(asAgent('carry-starter'), { handle, name: `Fixture ${handle}`, role: 'worker', workArea: ['carry-code', 'records'] })
  }
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('a carried, unchanged test file keeps the proof an earlier run of the same agent gave it', () => {
  it('1. the earlier sealed run of the same agent proves the carried file, and the evidence names both reports', async () => {
    const dir = aCheckout('case 1')
    const first = await aSealedRun(WORKER, 'the first made-up round', dir, `${aProof(KEPT, 'a')}\n${aProof(CHANGED, 'b')}`)
    theSecondRound(dir)
    const second = await aSealedRun(WORKER, 'the second made-up round', dir, aProof(CHANGED, 'c'))
    const five = await theFifthSignal(second.run)
    expect(five.missing, JSON.stringify(five)).toBeUndefined()
    expect(five.earned?.evidence).toEqual([second.report, first.report])
  })

  it('2. a test file whose bytes changed since the earlier run is not proved by that run’s report', async () => {
    const dir = aCheckout('case 2')
    await aSealedRun(WORKER, 'the first made-up round', dir, `${aProof(KEPT, 'a')}\n${aProof(CHANGED, 'b')}`)
    theSecondRound(dir)
    const second = await aSealedRun(WORKER, 'the second made-up round', dir, 'The made-up second round proved nothing again.')
    const five = await theFifthSignal(second.run)
    expect(five.earned).toBeUndefined()
    expectWithoutAProof(five, CHANGED, KEPT)
  })

  it('3. an earlier run of another agent does not prove it', async () => {
    const dir = aCheckout('case 3')
    await aSealedRun(OTHER, 'the made-up round of another agent', dir, `${aProof(KEPT, 'a')}\n${aProof(CHANGED, 'b')}`)
    theSecondRound(dir)
    const second = await aSealedRun(WORKER, 'the second made-up round', dir, aProof(CHANGED, 'c'))
    const five = await theFifthSignal(second.run)
    expect(five.earned).toBeUndefined()
    expectWithoutAProof(five, KEPT, CHANGED)
  })

  it('4. an earlier run whose report names the file with no hash beside it does not prove it', async () => {
    const dir = aCheckout('case 4')
    await aSealedRun(WORKER, 'the first made-up round', dir, `The made-up first round changed ${KEPT}.\n${'Made-up words between. '.repeat(30)}\n${aProof(CHANGED, 'b')}`)
    theSecondRound(dir)
    const second = await aSealedRun(WORKER, 'the second made-up round', dir, aProof(CHANGED, 'c'))
    const five = await theFifthSignal(second.run)
    expect(five.earned).toBeUndefined()
    expectWithoutAProof(five, KEPT, CHANGED)
  })

  it('5. a run sealed after this one does not prove it', async () => {
    const dir = aCheckout('case 5')
    theSecondRound(dir)
    const earlier = await aSealedRun(WORKER, 'the made-up round read here', dir, aProof(CHANGED, 'c'))
    await aSealedRun(WORKER, 'a made-up round after it', dir, `${aProof(KEPT, 'a')}\n${aProof(CHANGED, 'c')}`)
    const five = await theFifthSignal(earlier.run)
    expect(five.earned).toBeUndefined()
    expectWithoutAProof(five, KEPT, CHANGED)
  })
})
