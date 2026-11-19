// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
/**
 * A CLOSE THAT SAYS A RUN DID NOT FINISH SEALS NOTHING, AND NO SEAL NAMES A COMMIT THE RUN DID NOT RECORD.
 *
 * Problem `zv-Z5SMF_bst`. A run that ended without finishing was closed by the line's secretary with one write:
 * `state: crashed`, `closedAt`, `closedBecause` and `closedHow: agent-said`. The office read the close word as the
 * run's finish and sealed it. The write named no tip, so the seal took the HEAD of the run's folder, which by then
 * held a later round's commit, and the run's recorded tip was rewritten to that commit.
 *
 * The rule chosen is "seal only a run that finished". A close is the run's finish only while the row it leaves says
 * the run is still going. A row that says the run crashed, paused or was left orphaned did not finish, whatever its
 * close word says. A write that says `state: finished` seals as before.
 *
 * WHAT IS REAL HERE. The server, the record door, the close door (POST /api/attachments/<id>/close), the git
 * checkout and the seal are real. The runs, their agent and its starter are synthetic fixtures, and the later
 * commit stands in for another round's work in the same folder.
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
const worker = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'unfinished-worker' }
const starter = { ...worker, 'x-mole-office-actor-id': 'unfinished-starter' }
const actor = { type: 'agent' as const, id: 'unfinished-worker' }
const directories: string[] = []

function git(dir: string, ...args: string[]) { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim() }

function commit(dir: string, words: string, message: string): string {
  writeFileSync(join(dir, 'work', 'a.txt'), words)
  git(dir, 'add', '.'); git(dir, 'commit', '-m', message)
  return git(dir, 'rev-parse', 'HEAD')
}

/** A checkout with one committed change inside the worker's area, on a branch cut from main. Answers its HEAD. */
function tree(): { dir: string; tip: string } {
  mkdirSync('.logs', { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs', 'unfinished-close-fixture-'))
  directories.push(dir)
  git(dir, 'init', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic unfinished close fixture')
  mkdirSync(join(dir, 'work'), { recursive: true })
  writeFileSync(join(dir, 'work', 'a.txt'), 'before\n')
  git(dir, 'add', '.'); git(dir, 'commit', '-m', 'Synthetic baseline')
  git(dir, 'switch', '-c', 'work')
  return { dir, tip: commit(dir, 'submitted\n', 'Synthetic submission') }
}

/** A run at work in `dir`, which recorded `tip` as its tip. */
function aRun(dir: string, tip: string): string {
  return t.api.createRecord({ kind: 'session', title: 'Synthetic run that ends without finishing', workspaceId: 'default', actor, origin: 'fixture',
    data: { state: 'running', servingAgent: 'unfinished-worker', cutFrom: 'main', workingDirectory: dir, tip } }).id
}

async function patch(id: string, dataPatch: Record<string, unknown>, headers = worker) {
  return app.inject({ method: 'PATCH', url: '/api/records/' + id, headers, payload: { dataPatch } })
}

/** The close as the line's secretary wrote it on 24 October 2026: crashed, with the close word `agent-said`. */
function closedAsCrashed(): Record<string, unknown> {
  return { state: 'crashed', closedAt: '2026-10-24 09:38', closedBecause: 'The run ended without finishing on purpose.', closedHow: 'agent-said' }
}

async function closeItself(id: string) {
  return app.inject({ method: 'POST', url: '/api/attachments/' + id + '/close', headers: worker, payload: { how: 'agent-said', because: 'The run said its work was done and ended.' } })
}

function sealsOf(id: string): number {
  return (t.client.sqlite
    .prepare("SELECT count(*) AS n FROM records WHERE kind = 'sealed_tip' AND deleted_at IS NULL AND json_extract(data, '$.seal.run') = ?")
    .get(id) as { n: number }).n
}

beforeAll(async () => {
  t = await freshDb(); app = (await apiApp()).app
  seals = await import('../src/server/lib/sealed-tip.ts')
  const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: { ...worker, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }, payload: { handle: 'unfinished-starter', name: 'Synthetic starter' } })
  expect(started.statusCode, started.body).toBe(201)
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: starter,
    payload: { handle: 'unfinished-worker', name: 'Synthetic worker that ends without finishing', workArea: ['work'] } })
  expect(registered.statusCode, registered.body).toBe(201)
}, 60_000)

afterAll(async () => { await app?.close(); t?.close(); for (const dir of directories) rmSync(dir, { recursive: true, force: true }) })

describe('a run that ended without finishing, closed as crashed by somebody else while its folder holds a later commit', () => {
  it('is not sealed, and its recorded tip stays the commit it recorded', async () => {
    const { dir, tip } = tree()
    const id = aRun(dir, tip)
    const later = commit(dir, 'a later round\n', 'Synthetic later round in the same folder')
    const closed = await patch(id, closedAsCrashed(), starter)
    expect(closed.statusCode, closed.body).toBe(200)
    expect(sealsOf(id)).toBe(0)
    const data = t.api.getRecord(id)!.data
    expect(data['state']).toBe('crashed')
    expect(data['sealedTip']).toBeUndefined()
    expect(data['tip']).toBe(tip)
    expect(data['tip']).not.toBe(later)
  })
})

describe('a run that really finishes', () => {
  it('is sealed at its tip', async () => {
    const { dir, tip } = tree()
    const id = aRun(dir, tip)
    const finished = await patch(id, { state: 'finished', tip })
    expect(finished.statusCode, finished.body).toBe(200)
    expect(sealsOf(id)).toBe(1)
    expect(seals.readRunSeal(id)!.seal.git!.commit).toBe(tip)
    expect(t.api.getRecord(id)!.data['tip']).toBe(tip)
  })
})

describe('a close the run wrote itself', () => {
  it('seals nothing when the same write says the run crashed', async () => {
    const { dir, tip } = tree()
    const id = aRun(dir, tip)
    const closed = await patch(id, closedAsCrashed())
    expect(closed.statusCode, closed.body).toBe(200)
    expect(sealsOf(id)).toBe(0)
    expect(t.api.getRecord(id)!.data['tip']).toBe(tip)
  })

  it('seals nothing when its row already says the run crashed', async () => {
    const { dir, tip } = tree()
    const id = aRun(dir, tip)
    expect((await patch(id, { state: 'crashed' })).statusCode).toBe(200)
    commit(dir, 'a later round\n', 'Synthetic later round in the same folder')
    const closed = await closeItself(id)
    expect(closed.statusCode, closed.body).toBe(200)
    expect(t.api.getRecord(id)!.data['closedHow']).toBe('agent-said')
    expect(sealsOf(id)).toBe(0)
    expect(t.api.getRecord(id)!.data['tip']).toBe(tip)
  })

  it('seals the run at its tip when its row says the run is still going, because that close is its finish', async () => {
    const { dir, tip } = tree()
    const id = aRun(dir, tip)
    const closed = await closeItself(id)
    expect(closed.statusCode, closed.body).toBe(200)
    expect(sealsOf(id)).toBe(1)
    expect(seals.readRunSeal(id)!.seal.git!.commit).toBe(tip)
  })
})
