// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
/**
 * A RUN THAT SAID IT WAS FINISHED AND THEN CLOSES ITSELF KEEPS THE SEAL ITS CHECK READ.
 *
 * Problem `p-y9H17Q-baO`. A run says its work is finished in two ways, `state: finished` and a close
 * it writes itself (`closedHow: agent-said`), and each one sealed the run. So a run that finished and
 * then closed itself was sealed twice, and the close moved `sealedTip` to a second seal. Run
 * F27aTlC2pihZ on 12 September 2026: its check was assembled against seal z9bx1vDFasUw at 18:03:29,
 * the run closed itself at 18:03:32, and the verdict was refused because the current seal was then
 * EGTNDpUcJrs5. The check ended with no verdict.
 *
 * WHAT IS REAL HERE. The server, the git checkout, the seal, the close door
 * (POST /api/attachments/<id>/close) and the verdict gate (`releaseOrRefuse`) are real. The run,
 * its agent and its starter are synthetic fixtures. No model runs: the verdict is written by the
 * starter, which is the second of the two ways a run may be released.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let seals: typeof import('../src/server/lib/sealed-tip.ts')
let inspection: typeof import('../src/server/lib/inspection.ts')
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'close-worker' }
const actor = { type: 'agent' as const, id: 'close-worker' }
const directories: string[] = []

function git(dir: string, ...args: string[]) { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim() }

/** A checkout with one committed change inside the worker's area, on a branch cut from main. */
function tree(): string {
  mkdirSync('.logs', { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs', 'close-seal-fixture-'))
  directories.push(dir)
  git(dir, 'init', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic close fixture')
  mkdirSync(join(dir, 'work'), { recursive: true })
  writeFileSync(join(dir, 'work', 'a.txt'), 'before\n')
  git(dir, 'add', '.'); git(dir, 'commit', '-m', 'Synthetic baseline')
  git(dir, 'switch', '-c', 'work')
  writeFileSync(join(dir, 'work', 'a.txt'), 'submitted\n')
  git(dir, 'add', '.'); git(dir, 'commit', '-m', 'Synthetic submission')
  return dir
}

function aRun(dir: string): string {
  return t.api.createRecord({ kind: 'session', title: 'Synthetic run that closes itself', workspaceId: 'default', actor, origin: 'fixture',
    data: { state: 'running', servingAgent: 'close-worker', cutFrom: 'main', workingDirectory: dir } }).id
}

async function patch(id: string, dataPatch: Record<string, unknown>) {
  return app.inject({ method: 'PATCH', url: '/api/records/' + id, headers, payload: { dataPatch } })
}

async function closeItself(id: string) {
  return app.inject({ method: 'POST', url: '/api/attachments/' + id + '/close', headers, payload: { how: 'agent-said', because: 'The run said its work was done and ended.' } })
}

function sealsOf(id: string): number {
  return (t.client.sqlite
    .prepare("SELECT count(*) AS n FROM records WHERE kind = 'sealed_tip' AND deleted_at IS NULL AND json_extract(data, '$.seal.run') = ?")
    .get(id) as { n: number }).n
}

/** The starter releases the run, naming the seal it read. Throws where the verdict gate refuses. */
function releaseNaming(id: string, read: { id: string; seal: { hash: string; git: { commit: string; directory: string } | null } }) {
  return inspection.releaseOrRefuse({
    runId: id, workspaceId: 'default', by: { kind: 'agent', id: 'close-starter' }, how: 'its starter', inspector: null,
    actor: { type: 'agent', id: 'close-starter' },
    check: { verdict: 'released', traced: syntheticTrace(t, ['work/a.txt']), check: 'Synthetic check of the seal it read.', missing: [], says: null, chaptersRead: [],
      read: { worktree: read.seal.git!.directory, tip: read.seal.git!.commit, ofItsOwn: true, sealId: read.id, sealHash: read.seal.hash, says: 'Read the seal named here.' } },
  })
}

beforeAll(async () => {
  t = await freshDb(); app = (await apiApp()).app
  seals = await import('../src/server/lib/sealed-tip.ts')
  inspection = await import('../src/server/lib/inspection.ts')
  const starter = await app.inject({ method: 'POST', url: '/api/agents/started', headers: { ...headers, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }, payload: { handle: 'close-starter', name: 'Synthetic starter' } })
  expect(starter.statusCode, starter.body).toBe(201)
  const worker = await app.inject({ method: 'POST', url: '/api/agents/started', headers: { ...headers, 'x-mole-office-actor-id': 'close-starter' },
    payload: { handle: 'close-worker', name: 'Synthetic worker that closes itself', workArea: ['work'] } })
  expect(worker.statusCode, worker.body).toBe(201)
}, 60_000)

afterAll(async () => { await app?.close(); t?.close(); for (const dir of directories) rmSync(dir, { recursive: true, force: true }) })

describe('a run that said it was finished and then closes itself', () => {
  let id: string
  let first: NonNullable<ReturnType<typeof seals.readRunSeal>>

  it('is sealed once when it says it is finished', async () => {
    id = aRun(tree())
    const finished = await patch(id, { state: 'finished' })
    expect(finished.statusCode, finished.body).toBe(200)
    first = seals.readRunSeal(id)!
    expect(first).not.toBeNull()
    expect(sealsOf(id)).toBe(1)
  })

  it('is not sealed again when it closes itself, and its seal pointer does not move', async () => {
    const closed = await closeItself(id)
    expect(closed.statusCode, closed.body).toBe(200)
    expect(t.api.getRecord(id)!.data['closedHow']).toBe('agent-said')
    expect(sealsOf(id)).toBe(1)
    expect(seals.readRunSeal(id)!.id).toBe(first.id)
  })

  it('lets a verdict naming the seal the check read through the gate', () => {
    expect(() => releaseNaming(id, first as never)).not.toThrow()
    expect(t.api.getRecord(id)!.data['released']).toBeDefined()
  })
})

describe('a run whose only word that it is finished is closing itself', () => {
  it('is still sealed by that close, because the close is its finish', async () => {
    const id = aRun(tree())
    const closed = await closeItself(id)
    expect(closed.statusCode, closed.body).toBe(200)
    expect(sealsOf(id)).toBe(1)
    expect(seals.readRunSeal(id)).not.toBeNull()
  })
})

describe('a run that says finished, goes back to work and says finished again', () => {
  it('is sealed again, and the gate takes the new seal and refuses the old one', async () => {
    const dir = tree()
    const id = aRun(dir)
    expect((await patch(id, { state: 'finished' })).statusCode).toBe(200)
    const old = seals.readRunSeal(id)!
    expect((await patch(id, { state: 'running' })).statusCode).toBe(200)
    writeFileSync(join(dir, 'work', 'a.txt'), 'reworked\n')
    git(dir, 'add', '.'); git(dir, 'commit', '-m', 'Synthetic rework')
    expect((await patch(id, { state: 'finished' })).statusCode).toBe(200)
    const now = seals.readRunSeal(id)!
    expect(now.id).not.toBe(old.id)
    expect(sealsOf(id)).toBe(2)
    expect(() => releaseNaming(id, old as never)).toThrow(/current seal/)
    expect(() => releaseNaming(id, now as never)).not.toThrow()
  })
})
