// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TRIAL REPLAY ANSWERS AS THE QUEUE WOULD (wave 13u round 77, item 19). The coordinator's release loop asked
 * `git merge-tree origin/main <tip>` before it replaced a waiting entry. On 24 October 2026 at 14:46 that said "conflict"
 * for 13s round 101: main held 136 of the branch's 142 commits under other ids, so merge-tree met their files as added on
 * both sides. The queue's replay leaves out each commit whose patch main holds, and would have put the 6 new ones on main
 * cleanly. tools/merge-tool/trial-replay.mjs runs that replay (tools/merge-tool/rebase-with-joins.mjs) on a scratch copy
 * and prints one JSON line.
 *
 * WHAT THIS FILE PROVES:
 * 1. A branch whose earlier commits landed as another entry's replay, under new ids, replays clean, and the line names
 *    those commits as skipped. merge-tree calls the same branch a conflict.
 * 2. A real conflict stops, and the line names the commit the replay stopped at and the file.
 * 3. A list file both sides added to is joined by the queue's joins, and the replay ends clean. merge-tree calls it a
 *    conflict.
 * 4. A landing on main whose retained tips the repository lacks has them fetched from the repository's origin first, and
 *    the replay answers. Only the two keep refs the repository lacked are added, and stderr names them (wave 13u, item 55).
 * 5. When origin does not hold them either, or there is no origin, the trial exits 2 with no answer, never 1 as for a
 *    conflict. Its line says in one sentence which tip it could not read and which refs to fetch.
 * In each case stdout is one JSON line, the repository's refs, worktrees and files are as they were, apart from the keep
 * refs of case 4, and nothing is left in the temporary directory the trial was given.
 *
 * MUTATION PROOF (control, mutation, restore; the commit message of the code records the runs). Each goes red where named:
 *   - the queue's rebase replays the commits main holds (`--reapply-cherry-picks`): case 1;
 *   - the commit the rebase stopped at is read after the abort, when git no longer holds it: case 2;
 *   - the queue's rebase is not given the joins: case 3;
 *   - the keep refs are not fetched from origin: case 4;
 *   - a failure that is not the merge tool's own is thrown again, so node exits 1: case 5.
 *
 * Every fixture is synthetic and says so: the git repositories are made under the temporary directory, outside every
 * checkout, and removed after. Nothing reaches an office.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, expect, it } from 'vitest'
import { LANDED_KEEP_PREFIX, REPLAY_KEEP_PREFIX, landingMessage } from '../src/shared/merge/landed-history.mjs'
import { THE_MERGE_TOOLS_TEST_ADDRESS, aTestIdentity } from './the-test-commit-address.mjs'

const TOOL = fileURLToPath(new URL('../tools/merge-tool/trial-replay.mjs', import.meta.url))
const IDENTITY = aTestIdentity('Synthetic trial replay', 'fixture')
const LIST = 'src/shared/ops-list.ts'
const made: string[] = []
afterAll(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }) })

function scratch(prefix: string) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `trial-replay-${prefix}-`)))
  made.push(dir)
  return dir
}
const run = (dir: string, ...args: string[]) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, ...IDENTITY, HOME: dir } })
function git(dir: string, ...args: string[]) {
  const ran = run(dir, ...args)
  if (ran.status !== 0) throw Error(`git ${args.join(' ')}: ${ran.stderr}`)
  return ran.stdout.trim()
}
function write(dir: string, path: string, text: string) {
  mkdirSync(dirname(join(dir, path)), { recursive: true })
  writeFileSync(join(dir, path), text)
}
function commit(dir: string, message: string) {
  git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', message)
  return git(dir, 'rev-parse', 'HEAD')
}
const list = (...names: string[]) => `export const SYNTHETIC_OPS = [\n${names.map((name) => `  '${name}',\n`).join('')}] as const\n`
/** What the trial must leave as it was: every ref, every worktree, and every file of the checked-out one. */
const theRepository = (root: string) => ({ refs: git(root, 'show-ref', '--head'), worktrees: git(root, 'worktree', 'list', '--porcelain'), files: git(root, 'status', '--porcelain', '--ignored') })

/** The trial, given a temporary directory of its own: its exit, its stdout lines, what it left there and the repository. */
function theTrial(root: string, tip: string, main: string) {
  const place = scratch('given')
  const before = theRepository(root)
  const ran = spawnSync(process.execPath, [TOOL, '--repository', root, '--tip', tip, '--main', main], {
    encoding: 'utf8', env: { ...process.env, TMPDIR: place, HOME: place, MOLE_OFFICE_COMMIT_EMAIL: THE_MERGE_TOOLS_TEST_ADDRESS }, timeout: 120_000,
  })
  const lines = ran.stdout.split('\n').filter((line) => line !== '')
  return { status: ran.status, stderr: ran.stderr, lines, answer: lines.length === 1 ? JSON.parse(lines[0]!) : null, leftBehind: readdirSync(place), before, after: theRepository(root) }
}

/**
 * ROUND A LANDED AS THE QUEUE LANDS AN ENTRY, AND ROUND B WAS BUILT ON A'S OWN COMMITS. A adds two files. Main moves
 * before A lands, so A lands as copies under other ids, and another entry then changes A's first file on main. B carries
 * A's two commits under their old ids and one commit of its own.
 */
function landedUnderNewIds() {
  const root = scratch('root')
  git(root, 'init', '-q', '-b', 'main')
  write(root, 'src/other.txt', 'other\n'); commit(root, 'Synthetic base')
  git(root, 'switch', '-q', '-c', 'round-a')
  write(root, 'src/a-first.txt', 'A first\n'); const aFirst = commit(root, 'Synthetic round A: its first file')
  write(root, 'src/a-second.txt', 'A second\n'); const aSecond = commit(root, 'Synthetic round A: its second file')
  git(root, 'switch', '-q', '-c', 'round-b')
  write(root, 'src/b.txt', 'B\n'); const bOwn = commit(root, 'Synthetic round B: its own file')
  git(root, 'switch', '-q', 'main')
  write(root, 'src/other.txt', 'other, changed on main\n'); commit(root, 'Synthetic main moves before A lands')
  // A LANDS as the queue lands it: rebased onto main, and main fast-forwarded to the result.
  git(root, 'rebase', '-q', 'main', 'round-a'); git(root, 'switch', '-q', 'main'); git(root, 'merge', '-q', '--ff-only', 'round-a')
  write(root, 'src/a-first.txt', 'A first, changed on main by another entry\n'); commit(root, 'Synthetic main: another entry changes A\'s first file')
  const main = git(root, 'rev-parse', 'main')
  expect(git(root, 'rev-list', main).split('\n')).not.toContain(aFirst)
  return { root, main, aFirst, aSecond, bOwn }
}

it('a branch whose earlier commits landed under new ids replays clean, and names them as skipped', () => {
  const { root, main, aFirst, aSecond, bOwn } = landedUnderNewIds()
  expect(run(root, 'merge-tree', '--write-tree', main, bOwn).status).toBe(1)
  const trial = theTrial(root, 'round-b', 'main')
  expect(trial.lines, trial.stderr).toHaveLength(1)
  expect(trial.answer).toEqual({ clean: true, main, tip: bOwn, skipped: [aFirst, aSecond], stoppedAt: null, files: [], renumbered: null })
  expect(trial.status).toBe(0)
  expect(trial.after).toEqual(trial.before)
  expect(trial.leftBehind).toEqual([])
})

it('a real conflict stops, with the commit it stopped at and the file', () => {
  const { root, main } = landedUnderNewIds()
  git(root, 'switch', '-q', 'round-b')
  write(root, 'src/other.txt', 'other, changed by B\n'); const bStops = commit(root, 'Synthetic round B: the line main changed too')
  write(root, 'src/b.txt', 'B, after the stop\n'); const tip = commit(root, 'Synthetic round B: a commit after the stop')
  git(root, 'switch', '-q', 'main')
  const trial = theTrial(root, tip, main)
  expect(trial.lines, trial.stderr).toHaveLength(1)
  expect(trial.answer).toEqual({ clean: false, main, tip, skipped: null, stoppedAt: bStops, files: ['src/other.txt'], renumbered: null })
  expect(trial.status).toBe(1)
  expect(trial.after).toEqual(trial.before)
  expect(trial.leftBehind).toEqual([])
})

it('a list file both sides added to is joined, and the replay ends clean', () => {
  const root = scratch('root')
  git(root, 'init', '-q', '-b', 'main')
  write(root, LIST, list('a', 'b')); commit(root, 'Synthetic base')
  git(root, 'switch', '-q', '-c', 'entry')
  write(root, LIST, list('a', 'b', 'fromTheEntry')); const tip = commit(root, 'Synthetic entry: a name added to the list')
  git(root, 'switch', '-q', 'main')
  write(root, LIST, list('a', 'b', 'fromMain')); const main = commit(root, 'Synthetic main: another name added at the same place')
  expect(run(root, 'merge-tree', '--write-tree', main, tip).status).toBe(1)
  const trial = theTrial(root, tip, main)
  expect(trial.lines, trial.stderr).toHaveLength(1)
  expect(trial.answer).toEqual({ clean: true, main, tip, skipped: [], stoppedAt: null, files: [], renumbered: null })
  expect(trial.status).toBe(0)
  expect(trial.after).toEqual(trial.before)
  expect(trial.leftBehind).toEqual([])
})

/**
 * ROUND A LANDED AS ONE COMMIT, AND THE REPOSITORY THE TRIAL READS HAS NOT FETCHED THE KEEP REFS. The queue keeps A's
 * branch tip and its replayed tip under refs/keep/ in the checkout it lands in (land.mjs). A clone fetches neither, so it
 * holds the landing on main and no copy of the replayed tip. Round B carries A's two commits under their old ids and one
 * commit of its own. The origin is made under the temporary directory, as the repository is.
 */
function landedAsOneCommit() {
  const entry = 'synthetic-landed-entry'
  const origin = scratch('origin')
  git(origin, 'init', '-q', '-b', 'main')
  write(origin, 'src/other.txt', 'other\n'); commit(origin, 'Synthetic base')
  git(origin, 'switch', '-q', '-c', 'round-a')
  write(origin, 'src/a-first.txt', 'A first\n'); const aFirst = commit(origin, 'Synthetic round A: its first file')
  write(origin, 'src/a-second.txt', 'A second\n'); const aSecond = commit(origin, 'Synthetic round A: its second file')
  git(origin, 'switch', '-q', '-c', 'round-b')
  write(origin, 'src/b.txt', 'B\n'); const bOwn = commit(origin, 'Synthetic round B: its own file')
  git(origin, 'switch', '-q', 'main')
  write(origin, 'src/other.txt', 'other, changed on main\n'); const before = commit(origin, 'Synthetic main moves before A lands')
  // A LANDS as the queue lands it: replayed onto main, and main given one commit with the replayed tree and A's footers.
  git(origin, 'switch', '-q', '--detach', 'round-a'); git(origin, 'rebase', '-q', 'main')
  const replayed = git(origin, 'rev-parse', 'HEAD')
  const message = landingMessage('Synthetic round A lands', { entry, run: 'synthetic-run', seal: 'synthetic-seal', hash: 'a'.repeat(64), tip: aSecond, replayed })
  const landing = git(origin, 'commit-tree', `${replayed}^{tree}`, '-p', before, '-m', message)
  git(origin, 'switch', '-q', 'main'); git(origin, 'merge', '-q', '--ff-only', landing); git(origin, 'branch', '-q', '-D', 'round-a')
  const keep = { [`${LANDED_KEEP_PREFIX}${entry}`]: aSecond, [`${REPLAY_KEEP_PREFIX}${entry}/${replayed}`]: replayed }
  for (const [ref, at] of Object.entries(keep)) git(origin, 'update-ref', ref, at)
  // THE REPOSITORY gets main and round B by a real transfer, so it holds no object that only a keep ref reaches.
  const root = scratch('root')
  git(root, 'clone', '-q', '--no-local', origin, '.')
  expect(run(root, 'cat-file', '-e', `${replayed}^{commit}`).status).not.toBe(0)
  return { origin, root, main: landing, keep, replayed, aFirst, aSecond, bOwn }
}

it('a landing whose retained tips the repository lacks has them fetched from its origin, and the replay answers', () => {
  const { root, main, keep, aFirst, aSecond, bOwn } = landedAsOneCommit()
  const trial = theTrial(root, 'origin/round-b', 'main')
  expect(trial.lines, trial.stderr).toHaveLength(1)
  expect(trial.answer).toEqual({ clean: true, main, tip: bOwn, skipped: [aFirst, aSecond], stoppedAt: null, files: [], renumbered: null })
  expect(trial.status).toBe(0)
  expect(git(root, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/keep/')).toBe(Object.entries(keep).map(([ref, at]) => `${ref} ${at}`).sort().join('\n'))
  expect(trial.after.refs.split('\n').filter((line) => !line.includes(' refs/keep/'))).toEqual(trial.before.refs.split('\n'))
  expect({ ...trial.after, refs: null }).toEqual({ ...trial.before, refs: null })
  for (const ref of Object.keys(keep)) expect(trial.stderr).toContain(ref)
  expect(trial.leftBehind).toEqual([])
})

it('a retained tip that origin does not hold either gives no answer, and never a conflict', () => {
  const { origin, root, main, keep, replayed, bOwn } = landedAsOneCommit()
  for (const ref of Object.keys(keep)) git(origin, 'update-ref', '-d', ref)
  const noAnswer = { clean: null, main, tip: bOwn, skipped: null, stoppedAt: null, files: null, renumbered: null, why: expect.any(String) }
  const oneSentence = (why: string) => {
    expect(why).toContain(replayed)
    expect(why).toContain(`${LANDED_KEEP_PREFIX}*`)
    expect(why).toContain(`${REPLAY_KEEP_PREFIX}*`)
    expect(why).toMatch(/^[^\n]+\.$/)
  }
  const fetchedNothing = theTrial(root, bOwn, 'main')
  expect(fetchedNothing.lines, fetchedNothing.stderr).toHaveLength(1)
  expect(fetchedNothing.answer).toEqual(noAnswer)
  oneSentence(fetchedNothing.answer.why)
  expect(fetchedNothing.status).toBe(2)
  expect(fetchedNothing.after).toEqual(fetchedNothing.before)
  expect(fetchedNothing.leftBehind).toEqual([])
  git(root, 'remote', 'remove', 'origin')
  const noOrigin = theTrial(root, bOwn, 'main')
  expect(noOrigin.lines, noOrigin.stderr).toHaveLength(1)
  expect(noOrigin.answer).toEqual(noAnswer)
  oneSentence(noOrigin.answer.why)
  expect(noOrigin.answer.why).toContain('no origin')
  expect(noOrigin.status).toBe(2)
  expect(noOrigin.after).toEqual(noOrigin.before)
  expect(noOrigin.leftBehind).toEqual([])
})
