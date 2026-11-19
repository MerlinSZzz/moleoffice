// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPLAY ONTO MAIN WITH NOTHING NEW WRITES NO NEW GIT OBJECT (wave 13u round 178).
 *
 * WHAT WENT WRONG. Before the merge tool replays an entry, it builds an upstream commit that holds main's tree and the
 * tips each landing on main retained (replayMain, src/shared/merge/landed-history.mjs). It built that commit with git
 * commit-tree, which reads its dates only from GIT_AUTHOR_DATE and GIT_COMMITTER_DATE and otherwise takes the current
 * time. So every replay in a later second wrote new commits that nothing refers to: about 2,000 an hour in the queue's
 * checkout once each entry landed as one commit (wave 13u round 118). The early probe (early-conflicts.mjs) did the same
 * for each commit of the entry it replayed.
 *
 * WHAT IS PROVED HERE, in a made-up repository whose main holds two landings made as the merge tool makes them
 * (land.mjs): each of these, run a second time with nothing new and in a later second, answers as it did the first
 * time and writes no object.
 *   1. replayMain, through a reader that runs git with the variables it is given.
 *   2. aScratchCopy (rebase-with-joins.mjs), which replays through the merge tool's own git.
 *   3. canItJoin (early-conflicts.mjs), through the merge tool's own probe, for an entry of one commit.
 * Each second run waits for the clock's next second first, so a commit made at the current time would be another
 * object. Every repository, commit and name here is made up.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({ folder: '', logs: [] as string[] }))
vi.mock('../tools/merge-tool/arguments.mjs', async () => ({
  get WORKDIR() { return join(boundary.folder, 'logs') },
  THIS_CHECKOUT: fileURLToPath(new URL('..', import.meta.url)),
  ABSENT: 'absent', API: '', WORKSPACE: 'synthetic', PINNED_REF_PREFIX: 'refs/synthetic/',
  SCRIPT_TIMEOUT_MS: 30_000, SUITE_TIMEOUT_MS: 30_000,
  GIT_IDENTITY: (await import('./the-test-commit-address.mjs')).aTestIdentity('Synthetic queue', 'fixture'),
  chosen: { entry: 'synthetic-entry', pinOnly: false, get sandboxes() { return join(boundary.folder, 'sandboxes') } },
}))
vi.mock('../tools/merge-tool/log-and-state.mjs', () => {
  class MergerFailure extends Error {}
  return {
    MergerFailure, fail: (words: string) => { throw new MergerFailure(words) }, log: (words: string) => boundary.logs.push(words),
    stamp: () => '2026-11-07 00:00:00', writeState: () => {},
  }
})
import { aTestIdentity } from './the-test-commit-address.mjs'
import { landingMessage, replayMain } from '../src/shared/merge/landed-history.mjs'
import { aScratchCopy } from '../tools/merge-tool/rebase-with-joins.mjs'
import { canItJoin } from '../tools/merge-tool/early-conflicts.mjs'
import { probeGit } from '../tools/merge-tool/git.mjs'

afterEach(() => {
  if (boundary.folder !== '') rmSync(boundary.folder, { recursive: true, force: true })
  boundary.folder = ''
  boundary.logs = []
})

/** The made-up commits' times: each one a second after the one before, and all of them long before the replays. */
let stamp = Math.floor(Date.now() / 1000) - 100_000
const FIXTURE = aTestIdentity('Synthetic fixture', 'fixture')

/** git in `root`, as the fixture's own made-up author, at the next made-up time. */
function git(root: string, ...args: string[]): string {
  stamp += 1
  const at = `${String(stamp)} +0000`
  return execFileSync('git', ['-C', root, '-c', 'commit.gpgSign=false', ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...FIXTURE, GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at },
  }).trim()
}

/** One commit on the branch `root` stands on, adding one file. */
function aCommit(root: string, file: string, subject: string): string {
  writeFileSync(join(root, file), `made-up line of ${subject}\n`)
  git(root, 'add', file)
  git(root, 'commit', '-q', '-m', subject)
  return git(root, 'rev-parse', 'HEAD')
}

/**
 * A MADE-UP REPOSITORY WHOSE MAIN HOLDS TWO LANDINGS, each made as land.mjs makes one: a branch cut from main with one
 * commit, a commit on main with that tip's tree, main as its one parent and the landing footer, and the tip kept under
 * refs/keep/landed/. The replay builds one upstream commit for each tip. Then an entry's branch with one commit of its
 * own, cut from main after both landings.
 */
function aRepositoryWithTwoLandings(): { root: string; main: string; entry: string } {
  boundary.folder = mkdtempSync(join(tmpdir(), 'a-replay-writes-nothing-new-'))
  const root = join(boundary.folder, 'repo')
  mkdirSync(root)
  mkdirSync(join(boundary.folder, 'sandboxes'))
  git(root, 'init', '-q', '-b', 'main')
  aCommit(root, 'base.txt', 'Synthetic base')
  for (const name of ['first', 'second']) {
    const main = git(root, 'rev-parse', 'main')
    git(root, 'switch', '-q', '-c', name)
    const tip = aCommit(root, `${name}.txt`, `Synthetic ${name} work`)
    const provenance = { entry: `entry-${name}`, run: `run-${name}`, seal: `seal-${name}`, hash: createHash('sha256').update(name).digest('hex'), tip, replayed: tip }
    const landed = git(root, 'commit-tree', `${tip}^{tree}`, '-p', main, '-m', landingMessage(`Synthetic landing ${name}`, provenance))
    git(root, 'update-ref', `refs/keep/landed/${name}`, tip)
    git(root, 'update-ref', 'refs/heads/main', landed)
    git(root, 'switch', '-q', 'main')
  }
  const main = git(root, 'rev-parse', 'main')
  git(root, 'switch', '-q', '-c', 'entry')
  const entry = aCommit(root, 'entry.txt', 'Synthetic entry work')
  git(root, 'switch', '-q', 'main')
  return { root, main, entry }
}

/** Every object in the repository, by its id. */
function theObjects(root: string): string[] {
  return git(root, 'cat-file', '--batch-all-objects', '--batch-check=%(objectname)').split('\n').filter(Boolean).sort()
}

/** Until the clock's second has changed, so a commit made at the current time now gets another date. */
async function theNextSecond(): Promise<void> {
  const second = Math.floor(Date.now() / 1000)
  while (Math.floor(Date.now() / 1000) === second) await new Promise((done) => setTimeout(done, 1_010 - (Date.now() % 1_000)))
}

/** Runs `replay` once, then again in a later second, and gives both answers and the objects before and after the second run. */
async function twice<T>(root: string, replay: () => T): Promise<{ first: T; second: T; before: string[]; after: string[] }> {
  const first = replay()
  const before = theObjects(root)
  await theNextSecond()
  const second = replay()
  return { first, second, before, after: theObjects(root) }
}

it('replayMain, given a reader that passes git the variables it names, writes no object the second time', async () => {
  const { root, main } = aRepositoryWithTwoLandings()
  const read = (args: string[], variables?: Record<string, string>) =>
    execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...variables } })
  const { first, second, before, after } = await twice(root, () => replayMain(read, main))
  expect(first, 'the replay built no upstream commit, so this case proves nothing').not.toBe(main)
  expect(second).toBe(first)
  expect(after.filter((one) => !before.includes(one)), 'the objects the second replay wrote').toEqual([])
})

it("aScratchCopy, through the merge tool's own git, writes no object in the repository the second time", async () => {
  const { root, main, entry } = aRepositoryWithTwoLandings()
  const clone = join(boundary.folder, 'scratch', 'clone')
  const { first, second, before, after } = await twice(root, () => aScratchCopy(root, main, entry, clone))
  expect(first).toBe(main)
  expect(second).toBe(first)
  expect(after.filter((one) => !before.includes(one)), 'the objects the second replay wrote').toEqual([])
})

it("canItJoin, through the merge tool's own probe, writes no object the second time", async () => {
  const { root, main, entry } = aRepositoryWithTwoLandings()
  const { first, second, before, after } = await twice(root, () => canItJoin(root, main, entry, probeGit))
  expect(first).toEqual({ joins: true })
  expect(second).toEqual({ joins: true })
  expect(after.filter((one) => !before.includes(one)), 'the objects the second probe wrote').toEqual([])
})
