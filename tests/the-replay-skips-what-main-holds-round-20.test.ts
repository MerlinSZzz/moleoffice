// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REPLAY SKIPS WHAT MAIN HOLDS (wave 13v round 20). A round B built on its predecessor A's queued commits carries
 * copies of them. Once A lands, main holds A's patches under other hashes. The early and pin-time replay (`canItJoin`)
 * and the integration's rebase (`integrateGit`) leave out each commit whose patch main already holds, as
 * `git rebase <main>` and `git cherry` decide it, and replay the rest. A real conflict still stops both.
 * Synthetic commit histories in real temporary repositories; the office and the sandbox are stubs, as in
 * tests/merge-integrate-round-9.test.ts.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { aTestAddress } from './the-test-commit-address.mjs'

const boundary = vi.hoisted(() => ({ folder: '', logs: [] as string[], state: {} as Record<string, any>, steps: [] as { name: string; facts: Record<string, any>; detail: any }[] }))
vi.mock('../tools/merge-tool/arguments.mjs', async () => ({
  theOwnerContentPatterns: async () => (await import('./the-owners-content-patterns.ts')).THE_PATTERNS,
  withThePairing: (env: Record<string, string | undefined>) => ({ ...env }),
  get WORKDIR() { return join(boundary.folder, 'logs') },
  THIS_CHECKOUT: fileURLToPath(new URL('..', import.meta.url)),
  ABSENT: 'absent', API: '', WORKSPACE: 'synthetic', PINNED_REF_PREFIX: 'refs/synthetic/',
  SCRIPT_TIMEOUT_MS: 30_000, SUITE_TIMEOUT_MS: 30_000,
  GIT_IDENTITY: (await import('./the-test-commit-address.mjs')).aTestIdentity('Synthetic queue', 'fixture'),
  chosen: { entry: 'synthetic-entry', pinOnly: false, get sandboxes() { return join(boundary.folder, 'sandbox') } },
}))
vi.mock('../tools/merge-tool/log-and-state.mjs', () => ({
  fail: (words: string) => { throw Error(words) }, log: (words: string) => boundary.logs.push(words),
  stamp: () => '2026-10-11 00:00:00', writeState: (patch: Record<string, any>) => { boundary.state = patch },
}))
vi.mock('../tools/merge-tool/documents.mjs', () => ({ theRecordOfMain: () => ({ record: null }), theDocumentsOf: () => ({ none: 'Synthetic code entry' }) }))
vi.mock('../tools/merge-tool/office-keeper.mjs', () => ({
  theSeal: async (entry: any) => ({ git: { files: Object.entries(entry.machine.judged).map(([path, hash]) => ({ path, hash })) } }),
  theSandbox: async () => ({ name: 'synthetic-sandbox', folder: join(boundary.folder, 'sandbox') }),
  step: async (name: string, facts: Record<string, any>, detail: any) => { boundary.steps.push({ name, facts, detail }); return { step: name, facts } },
  keepTheReport: () => { throw Error('No report copying in these fixtures') },
  runInSandbox: async () => { throw Error('The fixture has no build script, so nothing runs in a sandbox') },
}))
import { canItJoin } from '../tools/merge-tool/early-conflicts.mjs'
import { integrateGit as replayGitFixture } from '../tools/merge-tool/integrate.mjs'
// This fixture measures the replay before it becomes a landing commit.
import { THE_INTEGRATION_A_TEST_GIVES } from './the-integration-reads-a-test-gives.ts'
const integrateGit = (entry: any, options: any = {}) => replayGitFixture(entry, { ...THE_INTEGRATION_A_TEST_GIVES, ...options, landing: false })

const git = (root: string, ...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const write = (root: string, path: string, text: string) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text) }
const commit = (root: string, message: string) => { git(root, 'add', '-A'); git(root, 'commit', '-qm', message); return git(root, 'rev-parse', 'HEAD') }
const probe = (cwd: string, args: string[]) => { const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }); return { status: r.status, stdout: r.stdout, stderr: r.stderr } }
const read = (root: string, at: string, path: string) => git(root, 'show', `${at}:${path}`)

beforeEach(() => {
  boundary.folder = mkdtempSync(join(tmpdir(), 'replay-skips-round-20-'))
  mkdirSync(join(boundary.folder, 'logs')); boundary.logs = []; boundary.steps = []; boundary.state = {}
})
afterEach(() => rmSync(boundary.folder, { recursive: true, force: true }))

/**
 * Round A queued and landed; round B built on A's original commits and queued after. A's second commit changes the
 * line its first commit wrote, so A's first commit, replayed again onto a main that holds both, conflicts. Main also
 * moves before A lands, so A lands as copies under other hashes, the way the queue's rebase puts them there.
 */
function roundsAAndB({ mainMovesAfterwards }: { mainMovesAfterwards?: Record<string, string> } = {}) {
  const root = join(boundary.folder, 'repo'); mkdirSync(root)
  git(root, 'init', '-qb', 'main'); git(root, 'config', 'user.name', 'Synthetic fixture'); git(root, 'config', 'user.email', aTestAddress('fixture'))
  write(root, '.mole-office/protected.json', JSON.stringify({ protected: [], generated: [] }))
  write(root, 'src/shared.txt', 'one\ntwo\nthree\n'); write(root, 'src/other.txt', 'other\n')
  const base = commit(root, 'Synthetic base')
  git(root, 'switch', '-qc', 'round-a')
  write(root, 'src/shared.txt', 'one\ntwo by A first\nthree\n'); commit(root, 'Synthetic round A first commit')
  write(root, 'src/shared.txt', 'one\ntwo by A second\nthree\n'); write(root, 'src/a.txt', 'A\n'); const aTip = commit(root, 'Synthetic round A second commit')
  git(root, 'switch', '-qc', 'round-b')
  write(root, 'src/b.txt', 'B\n'); write(root, 'src/shared.txt', 'one\ntwo by A second\nthree by B\n'); const bTip = commit(root, 'Synthetic round B own commit')
  git(root, 'switch', '-q', 'main'); write(root, 'src/other.txt', 'other by main\n'); commit(root, 'Synthetic main moves before A lands')
  // A LANDS as the queue lands it: rebased onto main, and main fast-forwarded to the result.
  git(root, 'switch', '-q', 'round-a'); git(root, 'rebase', '-q', 'main'); const aLanded = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '-q', 'main'); git(root, 'merge', '-q', '--ff-only', aLanded)
  let main = aLanded
  if (mainMovesAfterwards) { for (const [path, text] of Object.entries(mainMovesAfterwards)) write(root, path, text); main = commit(root, 'Synthetic main moves after A lands') }
  expect(aLanded).not.toBe(aTip)
  return { root, base, aTip, bTip, main }
}
const entry = (root: string, base: string, tip: string) => ({ changeset: { root, base, commit: tip }, seal: { id: 'synthetic-seal' }, machine: { judged: {} } })

it('round B joins main by the early replay once A has landed, and git cherry agrees that A is upstream', () => {
  const { root, bTip, main } = roundsAAndB()
  expect(git(root, 'cherry', main, bTip).split('\n').map((line) => line[0])).toEqual(['-', '-', '+'])
  const before = git(root, 'show-ref')
  expect(canItJoin(root, main, bTip, probe)).toEqual({ joins: true })
  expect(git(root, 'show-ref')).toBe(before)
})

it('round B integrates without stopping, and its tree is A plus B\'s own changes', async () => {
  const { root, base, bTip, main } = roundsAAndB()
  const result = await integrateGit(entry(root, base, bTip))
  expect(result.step).toBe('integrated')
  const clone = boundary.state.integrated.clone
  expect(git(clone, 'log', '--format=%s', `${main}..HEAD`)).toBe('Synthetic round B own commit')
  expect(git(clone, 'diff', '--name-only', main, 'HEAD').split('\n')).toEqual(['src/b.txt', 'src/shared.txt'])
  expect(readFileSync(join(clone, 'src/shared.txt'), 'utf8')).toBe('one\ntwo by A second\nthree by B\n')
  expect(readFileSync(join(clone, 'src/a.txt'), 'utf8')).toBe('A\n')
  expect(readFileSync(join(clone, 'src/other.txt'), 'utf8')).toBe('other by main\n')
  // R2: the content reported is what differs from main in the result, at its hash, so the verdict still follows it.
  expect(Object.keys(result.facts.files).sort()).toEqual(['src/b.txt', 'src/shared.txt'])
})

it('a real conflict in B\'s own commit still stops the early replay and the integration', async () => {
  const { root, base, bTip, main } = roundsAAndB({ mainMovesAfterwards: { 'src/shared.txt': 'one\ntwo by A second\nthree by main\n' } })
  expect(canItJoin(root, main, bTip, probe)).toMatchObject({ joins: false, commit: bTip, files: ['src/shared.txt'], mayRenumber: false })
  const result = await integrateGit(entry(root, base, bTip))
  expect(result.step).toBe('conflict')
  expect(result.facts).toMatchObject({ files: ['src/shared.txt'], mainAt: main })
  expect(boundary.state.integrated).toBeUndefined()
})

it('a copy of A whose patch differs from what landed is replayed, and still stops', async () => {
  const { root, base, main } = roundsAAndB()
  // B built on an earlier draft of A: its first commit wrote the line differently from either commit that landed.
  git(root, 'switch', '-qc', 'round-b-draft', base)
  write(root, 'src/shared.txt', 'one\ntwo by an A draft\nthree\n'); const draft = commit(root, 'Synthetic draft of round A')
  write(root, 'src/b.txt', 'B\n'); const tip = commit(root, 'Synthetic round B on the draft')
  git(root, 'switch', '-q', 'main')
  expect(read(root, main, 'src/shared.txt')).toBe('one\ntwo by A second\nthree')
  expect(canItJoin(root, main, tip, probe)).toMatchObject({ joins: false, commit: draft, files: ['src/shared.txt'] })
  expect((await integrateGit(entry(root, base, tip))).step).toBe('conflict')
})
