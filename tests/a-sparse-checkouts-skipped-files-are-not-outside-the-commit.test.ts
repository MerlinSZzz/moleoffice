// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Problem oC--Kw3IQhdU: a sparse checkout leaves a tracked folder out of the work tree, and the seal refused the run's
 * finish, listing every file of that folder as outside the commit, though git status was empty.
 *
 * A path the index marks skip-worktree (`ls-files -t` tags it S) and that is absent on disk is not compared and not
 * listed (src/config/outside-the-commit.mjs). A tracked file changed on disk and an untracked file still refuse. A file
 * that is there at a skip-worktree path is compared like any tracked file: a run can set the bit itself with
 * `git update-index --skip-worktree`, and git status does not show a change to such a file.
 *
 * Each case makes its own repository and finishes a run filed in it, in an office made here.
 *
 * RED ON MAIN, 8 November 2026, at 77e9f7c67: cases 1 and 2 red, case 3 green. The seal listed left-out/b.txt,
 * left-out/deep/c.txt and work/left-out.txt.
 * MUTATION PROOF, 8 November 2026, after a control run of 3 green. Each mutation of src/config/outside-the-commit.mjs
 * alone, then restored, 3 green:
 * - a skip-worktree path no longer passed over: cases 1 and 2 red.
 * - every skip-worktree path passed over, whether a file is there or not: case 3 red.
 * - a folder that is not there said 'not there as committed' again: cases 1 and 2 red, by left-out/b.txt.
 * - a file that is not there said 'not there as committed' again: cases 1 and 2 red, by work/left-out.txt.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance
let seals: typeof import('../src/server/lib/sealed-tip.ts')
const directories: string[] = []
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'sparse-worker' }
const git = (dir: string, ...args: string[]): string => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
const LEFT_OUT = ['left-out/b.txt', 'left-out/deep/c.txt', 'work/left-out.txt']

/**
 * A repository whose first commit holds work/a.txt and the files of LEFT_OUT, a run filed at that commit on the branch
 * worker, and a second commit that changes work/a.txt. With `sparse`, a sparse checkout leaves the folder left-out out of
 * the work tree, as `!/deploy/thor/catkin_ws` did in the worktree of the problem, and one file of the folder work.
 */
async function aRunCommitted(sparse: boolean) {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-sparse-seal-'))
  directories.push(dir)
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.name', 'Synthetic sparse test')
  git(dir, 'config', 'user.email', 'sparse@example.invalid')
  git(dir, 'config', 'commit.gpgsign', 'false')
  mkdirSync(join(dir, 'work'))
  mkdirSync(join(dir, 'left-out', 'deep'), { recursive: true })
  writeFileSync(join(dir, 'work/a.txt'), 'before\n')
  for (const path of LEFT_OUT) writeFileSync(join(dir, path), `${path}, committed\n`)
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'Synthetic commit A')
  const a = git(dir, 'rev-parse', 'HEAD')
  if (sparse) {
    git(dir, 'sparse-checkout', 'set', '--no-cone', '/*', '!/left-out/', '!/work/left-out.txt')
    expect(git(dir, 'config', 'core.sparseCheckout')).toBe('true')
    expect(git(dir, 'ls-files', '-t', ...LEFT_OUT).split('\n')).toEqual(LEFT_OUT.map((path) => `S ${path}`))
  }
  git(dir, 'switch', '-qc', 'worker')
  const filed = await app.inject({ method: 'POST', url: '/api/records', headers, payload: {
    kind: 'session', title: 'Synthetic sparse run',
    data: { state: 'running', servingAgent: 'sparse-worker', workingDirectory: dir, cutFrom: 'main', tip: a },
  } })
  expect(filed.statusCode, filed.body).toBe(201)
  writeFileSync(join(dir, 'work/a.txt'), 'after\n')
  git(dir, 'commit', '-qam', 'Synthetic commit B')
  if (sparse) expect(git(dir, 'status', '--porcelain')).toBe('')
  return { dir, b: git(dir, 'rev-parse', 'HEAD'), run: filed.json<{ record: { id: string } }>().record.id }
}

const finish = (run: string) => app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers, payload: { dataPatch: { state: 'finished' } } })

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  seals = await import('../src/server/lib/sealed-tip.ts')
  const starter = await app.inject({ method: 'POST', url: '/api/agents/started',
    headers: { ...headers, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
    payload: { handle: 'sparse-starter', name: 'Synthetic starter' } })
  expect(starter.statusCode, starter.body).toBe(201)
  const worker = await app.inject({ method: 'POST', url: '/api/agents/started',
    headers: { ...headers, 'x-mole-office-actor-id': 'sparse-starter' },
    payload: { handle: 'sparse-worker', name: 'Synthetic worker', workArea: ['work'] } })
  expect(worker.statusCode, worker.body).toBe(201)
})

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
})

it('a run in a sparse checkout that leaves a tracked folder out seals its tip', async () => {
  const { b, run } = await aRunCommitted(true)
  const reply = await finish(run)
  expect(reply.statusCode, reply.body).toBe(200)
  expect(seals.readRunSeal(run)?.seal.git?.commit).toBe(b)
})

it('the same sparse checkout with a tracked file changed on disk, or an untracked file, still refuses and lists no skipped file', async () => {
  for (const outside of ['work/a.txt', 'work/new.txt']) {
    const { dir, run } = await aRunCommitted(true)
    writeFileSync(join(dir, outside), 'not committed\n')
    const reply = await finish(run)
    expect(reply.statusCode, reply.body).toBe(409)
    expect(reply.body).toContain(outside)
    for (const path of LEFT_OUT) expect(reply.body).not.toContain(path)
    expect(seals.readRunSeal(run)).toBeNull()
  }
})

it('a file that is there at a skip-worktree path is compared: other bytes refuse, the committed bytes seal', async () => {
  const changed = await aRunCommitted(false)
  git(changed.dir, 'update-index', '--skip-worktree', 'left-out/b.txt')
  writeFileSync(join(changed.dir, 'left-out/b.txt'), 'work git status does not show\n')
  expect(git(changed.dir, 'status', '--porcelain')).toBe('')
  const refused = await finish(changed.run)
  expect(refused.statusCode, refused.body).toBe(409)
  expect(refused.body).toContain('left-out/b.txt')
  expect(seals.readRunSeal(changed.run)).toBeNull()

  const same = await aRunCommitted(false)
  git(same.dir, 'update-index', '--skip-worktree', 'left-out/b.txt')
  const sealed = await finish(same.run)
  expect(sealed.statusCode, sealed.body).toBe(200)
  expect(seals.readRunSeal(same.run)?.seal.git?.commit).toBe(same.b)
})
