// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REAL CONFLICT FOUND WHILE AN ENTRY WAITS SENDS IT BACK AT ONCE, NOT AT ITS TURN, as decided in wave 13v
 * round 25. The early replay (early-conflicts.mjs) stops at the first conflicting commit and
 * tries no join, so a conflict only in migration or list files was left for the entry's turn. On 11 October 2026 six
 * entries waited between one and two hours after the replay had seen their conflict, and then the rebase stopped on it.
 * The tool now runs the queue's rebase with its joins on a scratch copy (rebase-with-joins.mjs) at the pin and after
 * each landing.
 *
 * The fixtures have the shapes of that day's real bounces, in real temporary git trees; the office and the sandbox are
 * stubs, as in tests/the-merge-tool-joins-list-files-round-22.test.ts, whose stubs this copies.
 *   - Inm9-OQK3_e7: the replay stopped at a commit whose conflict was only in the migration journal; the rebase joined the
 *     journal and stopped at a later commit, on a test file. Main is the one the replay used at 17:07:45.
 *   - 87xD5HkWWRRx at 21:12:49: the replay stopped where both sides added lines to the journal and to
 *     src/shared/refusal-codes.ts; the rebase joined both and stopped at a later commit, on a test file.
 *   - 87xD5HkWWRRx at 20:06:28: the conflict was only in the journal, and the join resolves it. That entry keeps its place.
 *
 * MUTATION PROOF (control, mutation, restore; the commit message records the runs):
 *   - pinGit no longer tries the rebase when the replay's conflict may be renumbered or joined: cases 1 and 2 go red.
 *   - probeWaitingEntries reports a conflict the joins resolved as before: case 3 goes red.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({ folder: '', logs: [] as string[], state: {} as Record<string, any> }))
vi.mock('../tools/merge-tool/arguments.mjs', () => ({
  get WORKDIR() { return join(boundary.folder, 'logs') },
  THIS_CHECKOUT: fileURLToPath(new URL('..', import.meta.url)),
  ABSENT: 'absent', API: '', WORKSPACE: 'synthetic', PINNED_REF_PREFIX: 'refs/synthetic/',
  SCRIPT_TIMEOUT_MS: 30_000, SUITE_TIMEOUT_MS: 30_000,
  GIT_IDENTITY: { GIT_AUTHOR_NAME: 'Synthetic queue', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Synthetic queue', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' },
  chosen: { entry: 'synthetic-entry', pinOnly: false, get sandboxes() { return join(boundary.folder, 'sandboxes') } },
}))
vi.mock('../tools/merge-tool/log-and-state.mjs', () => {
  class MergerFailure extends Error {}
  return {
    MergerFailure, fail: (words: string) => { throw new MergerFailure(words) }, log: (words: string) => boundary.logs.push(words),
    stamp: () => '2026-10-11 00:00:00', writeState: (patch: Record<string, any>) => { boundary.state = patch },
  }
})
vi.mock('../tools/merge-tool/documents.mjs', () => ({ theRecordOfMain: () => ({ record: null }), theDocumentsOf: () => ({ none: 'Synthetic code entry' }) }))
vi.mock('../tools/merge-tool/office-keeper.mjs', () => ({
  theSeal: async (entry: any) => ({ git: { commit: entry.changeset.commit, files: [] } }),
  theSandbox: async () => { standIn('up', 'merge', '--name', 'synthetic-sandbox', '--from', boundary.folder); return { name: 'synthetic-sandbox', folder: join(boundary.folder, 'sandboxes', 'synthetic-sandbox') } },
  step: async (name: string, facts: Record<string, any>) => ({ step: name, facts }),
  keepTheReport: () => { throw Error('No report copying in these fixtures') },
  runInSandbox: async () => { throw Error('These fixtures stop before anything runs in the sandbox') },
}))
function standIn(...args: string[]) {
  const cut = args.indexOf('--') < 0 ? args.length : args.indexOf('--')
  return spawnSync(process.execPath, [join(REPO, 'tests/stand-in-sandbox-tool.mjs'), ...args.slice(0, cut), '--sandboxes', join(boundary.folder, 'sandboxes'), ...args.slice(cut)], { encoding: 'utf8', timeout: 60_000 })
}
import { canItJoin, probeWaitingEntries } from '../tools/merge-tool/early-conflicts.mjs'
import { integrateGit as replayGitFixture, pinGit } from '../tools/merge-tool/integrate.mjs'
// This fixture measures the replay before it becomes a landing commit.
import { THE_INTEGRATION_A_TEST_GIVES } from './the-integration-reads-a-test-gives.ts'
const integrateGit = (entry: any, options: any = {}) => replayGitFixture(entry, { ...THE_INTEGRATION_A_TEST_GIVES, ...options, landing: false })
import { tryTheRebaseEarly } from '../tools/merge-tool/rebase-with-joins.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
afterEach(() => { if (boundary.folder !== '') rmSync(boundary.folder, { recursive: true, force: true }); boundary.folder = '' })

const JOURNAL = 'drizzle/meta/_journal.json'
const CODES = 'src/shared/refusal-codes.ts'
const TEST = 'tests/every-region-says-what-it-is.test.ts'
const row = (idx: number, when: number, name: string) => ({ idx, version: '6', when, tag: `${String(idx).padStart(4, '0')}_${name}`, breakpoints: true })
const journal = (rows: any[]) => JSON.stringify({ version: '7', dialect: 'sqlite', entries: rows }, null, 2) + '\n'
const codes = (...keys: string[]) => `export const SOME_REFUSAL_CODES = {\n${keys.map((key) => `  ${key}: {},\n`).join('')}} as const\n`

/**
 * Main and an entry fork at migration 0000. Main then adds migration 0001 and a code, and changes the test file. The
 * entry's first commit adds migration 0002 (and a code, when `listsToo`); its second, when `laterConflict`, changes the
 * same line of the test file as main did.
 */
function fixture({ listsToo, laterConflict }: { listsToo: boolean; laterConflict: boolean }) {
  boundary.folder = mkdtempSync(join(tmpdir(), 'real-conflicts-bounce-early-'))
  mkdirSync(join(boundary.folder, 'logs')); boundary.logs = []; boundary.state = {}
  const root = join(boundary.folder, 'repo'); mkdirSync(root)
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const write = (path: string, text: string) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text) }
  const commit = (message: string) => { git('add', '-A'); git('commit', '-qm', message); return git('rev-parse', 'HEAD') }
  git('init', '-qb', 'main'); git('config', 'user.name', 'Synthetic fixture'); git('config', 'user.email', 'fixture@example.invalid')
  write('.mole-office/protected.json', JSON.stringify({ protected: [], generated: [] }))
  write(JOURNAL, journal([row(0, 100, 'base')])); write('drizzle/0000_base.sql', 'CREATE TABLE base_table (value TEXT);\n')
  write(CODES, codes('a', 'b')); write(TEST, "it('says what it is', () => {})\n")
  const base = commit('Synthetic base')
  git('switch', '-qc', 'entry')
  write(JOURNAL, journal([row(0, 100, 'base'), row(2, 300, 'the_entry_adds')])); write('drizzle/0002_the_entry_adds.sql', 'CREATE TABLE entry_table (value TEXT);\n')
  if (listsToo) write(CODES, codes('a', 'b', 'entryAdded'))
  const stops = commit('Synthetic entry adds its migration')
  if (laterConflict) { write(TEST, "it('says what it is, as the entry has it', () => {})\n"); commit('Synthetic entry renames the case') }
  const tip = git('rev-parse', 'HEAD')
  git('switch', '-q', 'main')
  write(JOURNAL, journal([row(0, 100, 'base'), row(1, 200, 'main_adds')])); write('drizzle/0001_main_adds.sql', 'CREATE TABLE main_table (value TEXT);\n')
  write(CODES, codes('a', 'b', 'mainAdded')); write(TEST, "it('says what it is, as main has it', () => {})\n")
  const main = commit('Synthetic main adds a migration, a code and a case name')
  return { root, base, tip, main, stops, git, entry: { id: 'synthetic-entry', state: 'judged', changeset: { adapter: 'git', root, base, commit: tip }, seal: { id: 'synthetic-seal' }, machine: { judged: {} } } }
}

/** probeWaitingEntries after a landing on `main`, with the trial office-keeper.mjs gives it. What it warned, and its log. */
async function afterALanding(made: ReturnType<typeof fixture>) {
  const warned: any[] = []
  await probeWaitingEntries({
    root: made.root, main: made.main, entries: [made.entry], remembered: [], remember: () => {}, log: (line: string) => boundary.logs.push(line),
    probe: (cwd: string, args: string[]) => { const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }); return { status: r.status, stdout: r.stdout, stderr: r.stderr } },
    notify: async (warning: any) => { warned.push(warning) },
    tryTheRebase: async (entry: any) => tryTheRebaseEarly(made.root, made.main, entry.changeset.commit, join(boundary.folder, 'logs', 'early-trial', entry.id)),
  })
  return warned
}

it('case 1, the shape of Inm9-OQK3_e7: a journal-only replay stop hides a later conflict, and the entry is sent back at the pin and after a landing, in the words of its turn', async () => {
  const made = fixture({ listsToo: false, laterConflict: true })
  const replay = canItJoin(made.root, made.main, made.tip, (cwd: string, args: string[]) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }))
  expect(replay, 'the early replay alone stops at the first commit, only in the journal').toMatchObject({ joins: false, commit: made.stops, files: [JOURNAL], mayRenumber: true })

  const pinned = await pinGit(made.entry, THE_INTEGRATION_A_TEST_GIVES)
  const refsBefore = made.git('show-ref')
  expect(pinned.facts.cannotJoin).toBeUndefined()
  // The merge driver joins only one-line imports in a code file that is not a list file, and its refusal says so (tier 1).
  const says = `git rebase ${made.main.slice(0, 12)} stopped on a conflict it does not resolve in ${TEST}. ${TEST} at line 1 was not joined by import widening: the hunk holds \`it('says what it is, as main has it', () => {})\`, which is not a one-line import, and the file is not a list file, so it was left to git.`
  expect(pinned.facts.rebaseStopped, boundary.logs.join('\n')).toEqual({ mainAt: made.main, files: [TEST], log: join(boundary.folder, 'logs', 'early-trial', 'conflict.log'), says })
  expect(readFileSync(pinned.facts.rebaseStopped.log, 'utf8')).toContain('tried early on a scratch copy')
  expect(existsSync(join(boundary.folder, 'logs', 'early-trial', 'clone')), 'the scratch copy is removed').toBe(false)

  const warned = await afterALanding(made)
  expect(warned).toEqual([{ entry: made.entry.id, tip: made.tip, files: [TEST], commit: made.stops, rebaseStopped: { files: [TEST], log: join(boundary.folder, 'logs', 'early-trial', made.entry.id, 'conflict.log'), says } }])

  // AT ITS TURN the same rebase stops with the same words: one function says them (rebase-with-joins.mjs).
  const turn = await integrateGit(made.entry)
  expect(turn.step).toBe('conflict')
  expect(turn.facts).toMatchObject({ files: [TEST], mainAt: made.main, says })
  expect(made.git('show-ref'), 'nothing after the pin moved a ref of the root').toBe(refsBefore)
}, 120_000)

it('case 2, the shape of 87xD5HkWWRRx at 21:12: a stop where both sides added list lines hides a later conflict, and the entry is sent back early', async () => {
  const made = fixture({ listsToo: true, laterConflict: true })
  const pinned = await pinGit(made.entry, THE_INTEGRATION_A_TEST_GIVES)
  expect(pinned.facts.cannotJoin).toBeUndefined()
  expect(boundary.logs.join('\n')).toContain(`only where the rebase may join it: ${JOURNAL} (a migration file), ${CODES} (two additions at one place)`)
  expect(pinned.facts.rebaseStopped?.files, boundary.logs.join('\n')).toEqual([TEST])
  const warned = await afterALanding(made)
  expect(warned.map((one) => one.rebaseStopped?.files)).toEqual([[TEST]])
}, 120_000)

it('case 3, the shape of 87xD5HkWWRRx at 20:06: a conflict only in the journal, which the join resolves, is not sent back and keeps its place', async () => {
  const made = fixture({ listsToo: false, laterConflict: false })
  const pinned = await pinGit(made.entry, THE_INTEGRATION_A_TEST_GIVES)
  expect(pinned.facts.cannotJoin).toBeUndefined()
  expect(pinned.facts.rebaseStopped).toBeUndefined()
  const warned = await afterALanding(made)
  expect(warned, boundary.logs.join('\n')).toEqual([])
  expect(boundary.logs).toContain(`the queue's rebase, tried early on a scratch copy, puts ${made.tip} on main ${made.main}: its joins resolve the conflict, so the entry keeps its place`)
}, 120_000)
