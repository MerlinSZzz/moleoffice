// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MIGRATION RENUMBERED ON A COLLISION TAKES A NUMBER NO OTHER QUEUED ENTRY CARRIES (wave 13v round 27). Round 26 made the
 * renumbering of a migration behind main step over the numbers the other queued entries carry (theNewestQueued), and log
 * which entries it read. renumberMigrationCollision, the path a rebase that stops on two migrations of one number takes,
 * still numbered from main alone. Real temporary git trees; the office and the sandbox are stubs, as in the round 12 and
 * round 26 tests, whose fixtures this copies. What the other queued entries carry is given to integrateGit as
 * theMigrationsQueued would read it.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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
  chosen: { entry: 'synthetic-entry', pinOnly: false, get sandboxes() { return join(boundary.folder, 'sandboxes') } },
}))
vi.mock('../tools/merge-tool/log-and-state.mjs', () => ({
  MergerFailure: class MergerFailure extends Error {},
  fail: (words: string) => { throw Error(words) }, log: (words: string) => boundary.logs.push(words),
  stamp: () => '2026-10-12 00:00:00', writeState: (patch: Record<string, any>) => { boundary.state = patch },
}))
vi.mock('../tools/merge-tool/documents.mjs', () => ({ theRecordOfMain: () => ({ record: null }), theDocumentsOf: () => ({ none: 'Synthetic code entry' }) }))
vi.mock('../tools/merge-tool/office-keeper.mjs', () => ({
  theSeal: async (entry: any) => ({ git: { commit: entry.changeset.commit, files: Object.entries(entry.machine.judged).map(([path, hash]) => ({ path, hash })) } }),
  theSandbox: async () => { standIn('up', 'merge', '--name', 'synthetic-sandbox', '--from', boundary.folder); return { name: 'synthetic-sandbox', folder: join(boundary.folder, 'sandboxes', 'synthetic-sandbox') } },
  step: async (name: string, facts: Record<string, any>, detail: any) => { boundary.steps.push({ name, facts, detail }); return { step: name, facts } },
  keepTheReport: () => { throw Error('No report copying in these fixtures') },
  runInSandbox: async (_sandbox: any, label: string, command: string, args: string[], options: any) => {
    const result = standIn('exec', 'synthetic-sandbox', '--cwd', options.cwd, '--wait', '--plain-env', '--timeout', '30', '--', command, ...args)
    const outFile = join(boundary.folder, 'logs', label + '.log')
    writeFileSync(outFile, result.stdout + result.stderr)
    return { code: result.status, signal: result.signal, timedOut: false, outFile, tail: (result.stdout + result.stderr).split('\n').slice(-12).join('\n'), ...(result.error ? { error: result.error.message } : {}) }
  },
}))
import { integrateGit as replayGitFixture } from '../tools/merge-tool/integrate.mjs'
// This fixture measures the replay before it becomes a landing commit.
import { THE_INTEGRATION_A_TEST_GIVES } from './the-integration-reads-a-test-gives.ts'
const integrateGit = (entry: any, options: any = {}) => replayGitFixture(entry, { ...THE_INTEGRATION_A_TEST_GIVES, ...options, landing: false })
import { tryTheRebaseEarly } from '../tools/merge-tool/rebase-with-joins.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
function standIn(...args: string[]) {
  const cut = args.indexOf('--') < 0 ? args.length : args.indexOf('--')
  return spawnSync(process.execPath, [join(REPO, 'tests/stand-in-sandbox-tool.mjs'), ...args.slice(0, cut), '--sandboxes', join(boundary.folder, 'sandboxes'), ...args.slice(cut)], { encoding: 'utf8', timeout: 60_000 })
}
function git(root: string, ...args: string[]) { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
function write(root: string, path: string, text: string) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text) }
function commit(root: string, message: string) { git(root, 'add', '-A'); git(root, 'commit', '-qm', message); return git(root, 'rev-parse', 'HEAD') }
const read = (root: string, path: string) => readFileSync(join(root, path), 'utf8')
const row = (idx: number, when: number, name: string) => ({ idx, version: '6', when, tag: `${String(idx).padStart(4, '0')}_${name}`, breakpoints: true })
const journal = (rows: any[]) => JSON.stringify({ version: '7', dialect: 'sqlite', entries: rows }, null, 2) + '\n'
const tagsOf = (root: string, at: string) => JSON.parse(git(root, 'show', `${at}:drizzle/meta/_journal.json`)).entries.map((one: any) => `${one.tag}@${one.when}`)
function entry(root: string, base: string, tip: string) { return { changeset: { root, base, commit: tip }, seal: { id: 'synthetic-seal' }, machine: { judged: {} } } }

/**
 * Main and the entry each add migration 0001 and a case for it at the end of tests/migration.test.ts, so the rebase stops
 * on that file and the collision path renumbers the entry's 0001.
 */
function theCollision() {
  const root = join(boundary.folder, 'repo'); mkdirSync(root)
  git(root, 'init', '-qb', 'main'); git(root, 'config', 'user.name', 'Synthetic fixture'); git(root, 'config', 'user.email', aTestAddress('fixture'))
  write(root, '.gitignore', 'node_modules\n')
  symlinkSync(join(REPO, 'node_modules'), join(root, 'node_modules'))
  write(root, '.mole-office/protected.json', JSON.stringify({ protected: [], generated: [] }))
  write(root, 'package.json', JSON.stringify({ private: true, scripts: { build: 'node build.cjs' } }))
  write(root, 'build.cjs', 'process.exit(0)\n')
  write(root, 'drizzle/meta/_journal.json', journal([row(0, 100, 'base')]))
  write(root, 'drizzle/0000_base.sql', 'CREATE TABLE base_table (value TEXT);\n')
  write(root, 'tests/migration.test.ts', "import {expect,it} from 'vitest'\n")
  const base = commit(root, 'Synthetic main at 0000')
  git(root, 'switch', '-qc', 'entry')
  write(root, 'drizzle/meta/_journal.json', journal([row(0, 100, 'base'), row(1, 200, 'entry')]))
  write(root, 'drizzle/0001_entry.sql', '-- Migration 0001: synthetic fixture\nCREATE TABLE entry_table (value TEXT);\n')
  write(root, 'tests/migration.test.ts', read(root, 'tests/migration.test.ts') + "it('0001_entry adds entry_table', () => expect(true).toBe(true))\n")
  const tip = commit(root, 'Synthetic entry adds 0001_entry')
  git(root, 'switch', '-q', 'main')
  write(root, 'drizzle/meta/_journal.json', journal([row(0, 100, 'base'), row(1, 300, 'main')]))
  write(root, 'drizzle/0001_main.sql', 'CREATE TABLE main_table (value TEXT);\n')
  write(root, 'tests/migration.test.ts', read(root, 'tests/migration.test.ts') + "it('0001_main adds main_table', () => expect(true).toBe(true))\n")
  const main = commit(root, 'Synthetic main adds 0001_main')
  return { root, base, tip, main }
}
const nothingQueued = { rows: [], read: [], unread: [], lane: null }
const unseen = 'numbers handed out for branches not yet in the queue cannot be seen'

beforeEach(() => {
  boundary.folder = mkdtempSync(join(tmpdir(), 'merge-collision-queued-round-27-'))
  mkdirSync(join(boundary.folder, 'logs')); boundary.logs = []; boundary.steps = []; boundary.state = {}
})
afterEach(() => rmSync(boundary.folder, { recursive: true, force: true }))

// MUTATION PROOF (after a green control): in renumberMigrationCollision, do not raise the start to theNewestQueued's
// number and `when`. This case goes red: 0001_entry becomes 0002_entry, the number OxvNQdAtwq6y carries, at when 301.
it('takes a number above the one another queued entry carries, and logs why and which entries it read, as the renumbering behind main does', async () => {
  const { root, base, tip } = theCollision()
  const queued = {
    rows: [
      { ...row(1, 300, 'main'), entry: 'OxvNQdAtwq6y' },
      { ...row(2, 400, 'another_branch'), entry: 'OxvNQdAtwq6y' },
      { ...row(1, 200, 'entry'), entry: 'an-older-copy-of-this-entry' },
    ],
    read: ['OxvNQdAtwq6y', 'an-older-copy-of-this-entry'], unread: [{ entry: 'gone-entry', why: 'run gone-run has no worktree from which to read its commit' }], lane: null,
  }
  const result = await integrateGit(entry(root, base, tip), { queued })
  expect(result.step, JSON.stringify(result.facts)).toBe('integrated')
  // 0002 IS TAKEN, SO 0003; main's own 0001 and this entry's own 0001 do not raise it.
  expect(result.facts.renumberedMigrations).toEqual([{ from: '0001_entry', to: '0003_entry' }])
  const clone = boundary.state.integrated.clone
  expect(tagsOf(clone, 'HEAD')).toEqual(['0000_base@100', '0001_main@300', '0003_entry@401'])
  expect(read(clone, 'tests/migration.test.ts')).toContain("it('0003_entry adds entry_table'")
  const said = boundary.logs.find((line) => line.startsWith('Migrations renumbered in queue commit')) ?? ''
  expect(said).toMatch(/^Migrations renumbered in queue commit [0-9a-f]{40}, because main's newest migration was 0001 and the other queued entries carry up to 0002 \(when 400\): 0001_entry -> 0003_entry\. Of the other queued entries: /)
  expect(said).toContain(`read the journals of OxvNQdAtwq6y, an-older-copy-of-this-entry; could not read gone-entry (run gone-run has no worktree from which to read its commit), whose numbers are not known; ${unseen}`)
  expect(git(clone, 'log', '-1', '--format=%B', 'HEAD')).toContain('The new numbers are above these: main\'s newest migration was 0001 and the other queued entries carry up to 0002 (when 400).')
}, 120_000)

it('numbers above main\'s newest when no other queued entry carries a migration, and says the lane held none', async () => {
  const { root, base, tip } = theCollision()
  const result = await integrateGit(entry(root, base, tip), { queued: nothingQueued })
  expect(result.facts.renumberedMigrations).toEqual([{ from: '0001_entry', to: '0002_entry' }])
  expect(tagsOf(boundary.state.integrated.clone, 'HEAD')).toEqual(['0000_base@100', '0001_main@300', '0002_entry@301'])
  expect(boundary.logs.join('\n')).toContain(`, because main's newest migration was 0001: 0001_entry -> 0002_entry. Of the other queued entries: no other queued git entry is in the lane; ${unseen}`)
}, 120_000)

it('says the other queued entries were not read when the early trial renumbers, since it is given none', () => {
  const { root, tip, main } = theCollision()
  expect(tryTheRebaseEarly(root, main, tip, join(boundary.folder, 'early'))).toEqual({ resolved: true })
  expect(boundary.logs.join('\n')).toContain(`, because main's newest migration was 0001: 0001_entry -> 0002_entry. Of the other queued entries: the other queued entries' migrations were not read, so the new numbers are above main's only; ${unseen}`)
}, 60_000)
