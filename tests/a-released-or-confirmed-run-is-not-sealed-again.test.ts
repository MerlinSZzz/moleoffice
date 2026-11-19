// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
/**
 * A RUN A CHECK HAS RELEASED, OR A CONFIRM HAS CLOSED, IS NOT SEALED AGAIN.
 *
 * Wave 13s round 3, found by wave 13n's round 28 (problem p-y9H17Q-baO). A run is released once, and a release names
 * the seal it read (decision CVfWgqGgLf1w). A write that said the run was finished again used to mint a new seal and
 * move `sealedTip`, and nothing asked a check of it: the release then named a seal that was no longer the run's, and
 * the merge queue refused the run. The message worker writes `state: finished` when a run's process ends, so this
 * happened to a run whose check released it before its process stopped.
 *
 * WHAT THIS FILE HOLDS THE OFFICE TO:
 *   - on a released run, a write that says it is finished again (with no tip, or the sealed tip) is stored and seals
 *     nothing: the seal pointer and the release stay as they were;
 *   - a write that names a different tip is refused, says the branch goes in under a new run, and writes nothing;
 *   - the same for a run a confirm closed with no release (review level none).
 *
 * WHAT IS REAL HERE. The server, the git checkout, the seal, the verdict gate (`releaseOrRefuse`) and the confirm door
 * (`confirmTheReport`) are real. The runs, their agent and its starter are synthetic fixtures. No model runs.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { aReleasedRunGoesInUnderANewRun, theBranchGoesInAgainUnderANewRun } from '../src/shared/merge-queue.ts'

let t: TestDb
let app: FastifyInstance
let seals: typeof import('../src/server/lib/sealed-tip.ts')
let inspection: typeof import('../src/server/lib/inspection.ts')
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'reseal-worker' }
const actor = { type: 'agent' as const, id: 'reseal-worker' }
const directories: string[] = []

function git(dir: string, ...args: string[]) { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim() }

/** A checkout with one committed change inside the worker's area, on a branch cut from main. */
function tree(): string {
  mkdirSync('.logs', { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs', 'reseal-fixture-'))
  directories.push(dir)
  git(dir, 'init', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic reseal fixture')
  mkdirSync(join(dir, 'work'), { recursive: true })
  writeFileSync(join(dir, 'work', 'a.txt'), 'before\n')
  git(dir, 'add', '.'); git(dir, 'commit', '-m', 'Synthetic baseline')
  git(dir, 'switch', '-c', 'work')
  writeFileSync(join(dir, 'work', 'a.txt'), 'submitted\n')
  git(dir, 'add', '.'); git(dir, 'commit', '-m', 'Synthetic submission')
  return dir
}

/** New work committed after the run was released. Answers the new commit. */
function moreWork(dir: string): string {
  writeFileSync(join(dir, 'work', 'a.txt'), 'more work after the release\n')
  git(dir, 'add', '.'); git(dir, 'commit', '-m', 'Synthetic work after the release')
  return git(dir, 'rev-parse', 'HEAD')
}

function aRun(dir: string): string {
  return t.api.createRecord({ kind: 'session', title: 'Synthetic run checked once', workspaceId: 'default', actor, origin: 'fixture',
    data: { state: 'running', servingAgent: 'reseal-worker', cutFrom: 'main', workingDirectory: dir } }).id
}

async function patch(id: string, dataPatch: Record<string, unknown>) {
  return app.inject({ method: 'PATCH', url: '/api/records/' + id, headers, payload: { dataPatch } })
}

function sealsOf(id: string): number {
  return (t.client.sqlite
    .prepare("SELECT count(*) AS n FROM records WHERE kind = 'sealed_tip' AND deleted_at IS NULL AND json_extract(data, '$.seal.run') = ?")
    .get(id) as { n: number }).n
}

/** The starter releases the run, naming the seal it read. */
function release(id: string) {
  const read = seals.readRunSeal(id)!
  return inspection.releaseOrRefuse({
    runId: id, workspaceId: 'default', by: { kind: 'agent', id: 'reseal-starter' }, how: 'its starter', inspector: null,
    actor: { type: 'agent', id: 'reseal-starter' },
    check: { verdict: 'released', traced: syntheticTrace(t, ['work/a.txt']), check: 'Synthetic check of the seal it read.', missing: [], says: null, chaptersRead: [],
      read: { worktree: read.seal.git!.directory, tip: read.seal.git!.commit, ofItsOwn: true, sealId: read.id, sealHash: read.seal.hash, says: 'Read the seal named here.' } },
  })
}

beforeAll(async () => {
  t = await freshDb(); app = (await apiApp()).app
  seals = await import('../src/server/lib/sealed-tip.ts')
  inspection = await import('../src/server/lib/inspection.ts')
  const starter = await app.inject({ method: 'POST', url: '/api/agents/started', headers: { ...headers, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }, payload: { handle: 'reseal-starter', name: 'Synthetic starter' } })
  expect(starter.statusCode, starter.body).toBe(201)
  const worker = await app.inject({ method: 'POST', url: '/api/agents/started', headers: { ...headers, 'x-mole-office-actor-id': 'reseal-starter' },
    payload: { handle: 'reseal-worker', name: 'Synthetic worker checked once', workArea: ['work'] } })
  expect(worker.statusCode, worker.body).toBe(201)
}, 60_000)

afterAll(async () => { await app?.close(); t?.close(); for (const dir of directories) rmSync(dir, { recursive: true, force: true }) })

describe('a run its check has released', () => {
  let id: string
  let dir: string
  let first: NonNullable<ReturnType<typeof seals.readRunSeal>>

  it('is sealed once when it says it is finished, and released on that seal', async () => {
    dir = tree()
    id = aRun(dir)
    expect((await patch(id, { state: 'finished' })).statusCode).toBe(200)
    first = seals.readRunSeal(id)!
    expect(() => release(id)).not.toThrow()
    expect(t.api.getRecord(id)!.data['released']).toBeDefined()
    expect(sealsOf(id)).toBe(1)
  })

  it('stores the worker\'s word that it ended, and seals nothing again', async () => {
    // WHAT THE MESSAGE WORKER WRITES WHEN THE RUN'S PROCESS ENDS (sayHowItEnded in src/worker/index.ts).
    const ended = await patch(id, { state: 'finished', doing: 'The run answered and ended.' })
    expect(ended.statusCode, ended.body).toBe(200)
    expect(t.api.getRecord(id)!.data['doing']).toBe('The run answered and ended.')
    expect(sealsOf(id)).toBe(1)
    expect(seals.readRunSeal(id)!.id).toBe(first.id)
    expect(t.api.getRecord(id)!.data['released']).toBeDefined()
    // Naming the commit it was sealed on is the same work, so it is not refused either.
    const same = await patch(id, { state: 'finished', tip: first.seal.git!.commit })
    expect(same.statusCode, same.body).toBe(200)
    expect(sealsOf(id)).toBe(1)
  })

  it('refuses a write that says it is finished on a new tip, says the branch goes in under a new run, and writes nothing', async () => {
    const tipBefore = t.api.getRecord(id)!.data['tip']
    const newTip = moreWork(dir)
    const refused = await patch(id, { state: 'finished', tip: newTip, doing: 'Sealing the new work.' })
    expect(refused.statusCode, refused.body).toBe(409)
    const said = (refused.json() as { error: string }).error
    expect(said).toContain(`This write says run ${id} is finished on tip ${newTip}, which is not the commit it was sealed on (${first.seal.git!.commit}), so nothing was written.`)
    expect(said).toContain(aReleasedRunGoesInUnderANewRun(id))
    expect(sealsOf(id)).toBe(1)
    expect(seals.readRunSeal(id)!.id).toBe(first.id)
    expect(t.api.getRecord(id)!.data['tip']).toBe(tipBefore)
    expect(t.api.getRecord(id)!.data['doing']).toBe('The run answered and ended.')
  })
})

describe('a run a confirm closed with no release (review level none)', () => {
  it('refuses a write that says it is finished on a new tip, and says it was confirmed', async () => {
    const level = await app.inject({
      method: 'PATCH', url: '/api/workspaces/default',
      headers: { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, ...thePersonsKeyHeader() },
      payload: { reviewLevel: 'none' },
    })
    expect(level.statusCode, level.body).toBe(200)
    const dir = tree()
    const id = aRun(dir)
    expect((await patch(id, { state: 'finished' })).statusCode).toBe(200)
    const sealed = seals.readRunSeal(id)!
    inspection.confirmTheReport({ runId: id, workspaceId: 'default', by: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, because: 'Synthetic confirm.', actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
    expect(t.api.getRecord(id)!.data['confirmed']).toBeDefined()
    expect(t.api.getRecord(id)!.data['released'] ?? null).toBeNull()

    const newTip = moreWork(dir)
    const refused = await patch(id, { state: 'finished', tip: newTip })
    expect(refused.statusCode, refused.body).toBe(409)
    const said = (refused.json() as { error: string }).error
    expect(said).toContain(`Run ${id} was already confirmed, which closed it, so it takes no new seal. ${theBranchGoesInAgainUnderANewRun()}`)
    expect(sealsOf(id)).toBe(1)
    expect(seals.readRunSeal(id)!.id).toBe(sealed.id)
  })
})
