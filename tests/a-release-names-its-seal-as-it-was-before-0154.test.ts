// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RELEASE WRITTEN BEFORE MIGRATION 0154 STILL NAMES ITS SEAL. Wave 13k round 7, piece 0.
 *
 * On 26 September 2026 at 12:22 the owner pressed confirm on runs yFOPdYIV0LTD and _WEgUy59mP1W, and each
 * answered "The release does not match current seal …". Both releases were written on 9 September and name their
 * seals' hashes as they were then. Migration 0154 (src/server/db/seal-copies-to-pointers.ts, 12 September) dropped the
 * copies those seals carried and hashed them again, keeping the former hash under `seal.reduced.was`, "so a hash
 * written down elsewhere still resolves here". The readers compared a release with `seal.hash` alone.
 * `howAReleaseNamesThisSeal` (src/shared/sealed-tip.ts) now reads both.
 *
 * WHAT IS MEASURED, on a real git repository and a throwaway database; every record is synthetic. A run is sealed and
 * released by an inspector who names the seal's hash; then its seal is re-written the way migration 0154 re-wrote the
 * old ones (a `reduced` block keeping the former hash, and a new hash), straight into the table, as the migration did.
 *   · the confirm answers 201, and says the release named the seal as it was before migration 0154;
 *   · a release naming any other hash is still refused.
 *
 * MUTATION (wave 13k round 7): drop the `reduced.was` branch of `howAReleaseNamesThisSeal`. The confirm goes red again.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, reduceASealAsMigration0154Did, writeAVerdictAsItsDoorWould, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

const WORKSPACE = 'default'
const AS_THE_PERSON = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string): Record<string, string> => ({ 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

// A FOLDER THIS FILE MAKES, AND A HOME INSIDE IT, so git reads no configuration of the machine's.
const made = mkdtempSync(join(tmpdir(), 'release-before-0154-'))
const home = join(made, 'home')
const homeBefore = process.env['HOME']
const lane = join(made, 'lane')

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, HOME: home } }).trim()
}

let worktrees = 0
/** A worktree of the lane on a new branch with one commit, where a run is sealed. */
function aWorktree(): string {
  worktrees += 1
  const at = join(made, `run-${String(worktrees)}`)
  git(lane, 'worktree', 'add', '-q', '-b', `run-${String(worktrees)}`, at, 'main')
  writeFileSync(join(at, 'work', 'a.txt'), `a from run ${String(worktrees)}\n`)
  git(at, 'add', '.')
  git(at, 'commit', '-q', '-m', 'The run changes a')
  return at
}

/** A run sealed through the real finish door and released by an inspector who names `named` as the seal's hash. */
async function aReleasedRun(named: (hash: string) => string): Promise<{ run: string; seal: string; hashAtRelease: string; branch: string }> {
  const at = aWorktree()
  const branch = `run-${String(worktrees)}`
  const created = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent('old-worker'),
    payload: { kind: 'session', title: 'Synthetic run released before 0154', data: { state: 'running', servingAgent: 'old-worker', workingDirectory: at, cutFrom: 'main' } },
  })
  expect(created.statusCode, created.body).toBe(201)
  const run = (created.json() as { record: { id: string } }).record.id
  const finished = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asAgent('old-worker'), payload: { dataPatch: { state: 'finished' } } })
  expect(finished.statusCode, finished.body).toBe(200)
  const seal = String(t.api.getRecord(run)!.data['sealedTip'])
  const sealData = t.api.getRecord(seal)!.data['seal'] as { hash: string; git: { commit: string } }
  const released = {
    by: { kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle },
    at: '2026-09-09 10:00:00',
    how: 'an inspector',
    read: { sealId: seal, sealHash: named(sealData.hash), worktree: at, tip: sealData.git.commit, ofItsOwn: true, says: 'Synthetic: read the sealed tree.' },
  }
  writeAVerdictAsItsDoorWould(t, run, { released })
  return { run, seal, hashAtRelease: sealData.hash, branch }
}

async function confirm(run: string): Promise<{ code: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}/confirm`, headers: AS_THE_PERSON, payload: { because: 'The report is sound.' } })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

beforeAll(async () => {
  mkdirSync(home, { recursive: true })
  process.env['HOME'] = home
  mkdirSync(join(lane, 'work'), { recursive: true })
  git(lane, 'init', '-q', '-b', 'main')
  git(lane, 'config', 'user.email', 'fixture@example.invalid')
  git(lane, 'config', 'user.name', 'Synthetic 0154 fixture')
  writeFileSync(join(lane, 'work', 'a.txt'), 'a before\n')
  git(lane, 'add', '.')
  git(lane, 'commit', '-q', '-m', 'Synthetic baseline')
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const repositories = await import('../src/server/lib/repositories.ts')
  repositories.registerRepository({ workspaceId: WORKSPACE, name: 'lane-0154', root: lane, actor: { type: 'human', id: THE_PERSON } })
  for (const [headers, payload] of [
    [AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' }],
    [asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'old-worker', name: 'Old worker', role: 'worker', workArea: ['work'] }],
  ] as const) {
    const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
    expect(reply.statusCode, reply.body).toBe(201)
  }
})

afterAll(async () => {
  await app?.close()
  t?.close()
  if (homeBefore === undefined) delete process.env['HOME']
  else process.env['HOME'] = homeBefore
  rmSync(made, { recursive: true, force: true })
})

describe('a release that names its seal as it was before migration 0154', () => {
  it('is confirmed, and the answer says the release named the seal as it was before migration 0154', async () => {
    const { run, seal, hashAtRelease } = await aReleasedRun((hash) => hash)
    reduceASealAsMigration0154Did(t, seal)
    expect((t.api.getRecord(seal)!.data['seal'] as { hash: string }).hash).not.toBe(hashAtRelease)
    const { code, said } = await confirm(run)
    expect(code, JSON.stringify(said)).toBe(201)
    expect(String(said['says'])).toContain(`The release named seal ${seal} as it was before migration 0154`)
    expect((said['stands'] as Record<string, unknown>)['standing']).toBe('closed')
  })

  it('still refuses a release that names any other hash', async () => {
    const { run, seal } = await aReleasedRun(() => 'f'.repeat(64))
    reduceASealAsMigration0154Did(t, seal)
    const before = JSON.stringify(t.api.getRecord(run)!.data)
    const { code, said } = await confirm(run)
    expect(code, JSON.stringify(said)).toBe(409)
    expect(String(said['error'])).toContain(`The release does not match current seal ${seal}`)
    expect(JSON.stringify(t.api.getRecord(run)!.data)).toBe(before)
  })
})
