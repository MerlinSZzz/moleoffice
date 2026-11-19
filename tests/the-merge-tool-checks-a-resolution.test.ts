// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE TOOL CHECKS THE RESOLUTION A SUPERVISOR HANDED OVER (tier 2 of the owner's decision, round B, part 5;
 * XHY2fVFG3Qq8, answer 1). `node tools/the-merger.mjs --check-resolution` is the run the message
 * worker starts for a resolving entry whose resolution waits for its check. It replays the pinned commit onto the main
 * the conflict met in a clone of its own, takes from the resolution only the paths git left in conflict, and reports
 * the step `resolution-checked`, passed or refused. The office moves the entry; this run decides nothing.
 *
 * WHAT THIS FILE PROVES:
 * 1. A resolution made in the clean copy, keeping both sides, passes. The step carries the place with its four sides and
 *    main's commit that wrote main's line, `refs/mole-office/resolved/<entry>` points at the resolution in the lane's
 *    repository, the clone is under <workdir>/resolution, the hold comes before every git command, every git command
 *    carries `-c gc.auto=0`, and no sandbox is asked for. Its hand-over declared a test run at the resolution's commit
 *    that failed, and the check reads nothing of that run but its commit.
 * 2. Each thing the check holds a resolution to is refused, with its own sentence, and the ref is not written: a folder
 *    whose HEAD moved, a change outside a place, a change to a path git did not leave in conflict, a mode neither side
 *    had, a message that is not the replay's, a commit more than the replay makes, a file whose hash is not the one the
 *    hand-over door recorded, a test run declared with the hand-over at another commit, and a stop on a path the
 *    conflict step did not name.
 * 3. An entry whose resolution does not wait for its check is not checked: the run asks the office nothing but the entry
 *    and the end of the run, and runs no git.
 * 4. A first stop must use the queue's named files; a later stop of the same replay may add three further files.
 *    Their places all reach the office, and a change outside a further file's places is refused too.
 * 5. Each stop is paired with the resolution's commit that carries the message of the entry's commit it stopped on, not
 *    with the commit at the same count. Where main already holds what an entry's commit meant, its supervisor takes
 *    main's side, and git drops the commit, which is then empty. The clean copy drops it, the check's own replay drops
 *    it too, and the resolution passes; its place names no commit of the resolution. A later stop after it is paired
 *    with its own commit. A resolution that keeps the emptied commit is refused, and so are a stop whose commit the
 *    resolution does not hold and a stop whose message two commits carry. Each refusal names the commits.
 * 6. An entry whose branch holds two merges of main passes with a resolution made in the clean copy, linear on top of
 *    main. The replay leaves both merges out. Its first stop is at a commit whose line the branch's own merge took from
 *    main, so the clean copy drops that commit, and the resolution has one commit fewer than the entry has without its
 *    merges. Each stop is still paired with its own commit. Main wrote the line of that first stop before the branch's
 *    first merge of main, and the place names that commit of main: the check counts main's commits from the point where
 *    the entry left main, not from the merge base, which is the last commit of main the branch merged.
 * 7. A stop about a whole file is checked by its kind (wave 13u round 131, item 51 (b)). The same file renamed
 *    differently on each side passes when the resolution keeps main's name only: main's file is checked against the
 *    three-way merge of the ancestor's file, main's file and the entry's file, and its places reach the office as any
 *    other. Where the two sides' changes do not meet, that merge has no place, and main's file passes only as it stands.
 *    A resolution that keeps the entry's name too is refused. A file deleted on one side and changed on the other
 *    is refused with the cannot, whatever the resolution holds. A file renamed on main and changed by the entry, and a
 *    file added on both sides, pass with their places, as a conflict of lines does. The supervisor's folder in these
 *    cases is replayed by git itself, so they do not lean on the clean copy's handling of the kind.
 * 8. Where a stop renamed a migration's SQL file differently on each side, a file git merged with no conflict at that
 *    stop may differ from git's own result in one way only (wave 13u round 132, item 51): the lines the entry wrote give
 *    the migration main's number in place of the entry's, by the rule the merge tool's renumber at integration follows
 *    (withTheNewNumbers). Exactly that passes. A resolution that also renumbers a line main already holds, or that
 *    renumbers a file where that rule cannot read one of the entry's lines, is refused, and the refusal says what is
 *    allowed. The same change where the renamed file is not a migration's SQL is refused as any change outside the
 *    paths left in conflict is.
 *
 * tools/the-merger.mjs is run as a separate process, as the message worker runs it, against a stand-in office on a
 * loopback port that answers only what a check run asks and keeps each step's body. A stand-in git, first on the run's
 * PATH, writes down each git command and whether the hold was there, and then runs the real git; a stand-in sandbox
 * tool writes down any call made to it. Everything here is synthetic: the repositories, the entry, the supervisor and
 * the office's answers, and the git trees are made under the temporary directory and removed after.
 * MUTATION PROOFS: the commit message of the code records the runs.
 */

import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'the-merger.mjs')
const CLEAN_COPY = join(REPO, 'tools', 'merge-tool', 'resolve-a-conflict.mjs')
const STAND_IN_SANDBOX = join(REPO, 'tests', 'stand-in-sandbox-tool.mjs')
const ENDED = 'MOLE-OFFICE-MERGE-TOOL-ENDED '
const REAL_GIT = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim()

const CODE = 'src/synthetic.ts'
const LIST = 'src/shared/ops-list.ts'
const OTHER = 'work/other.txt'
const FURTHER = ['src/further-b.ts', 'src/further-c.ts', 'src/further-d.ts']
const IDENTITY = { GIT_AUTHOR_NAME: 'Synthetic supervisor', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Synthetic supervisor', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' }
const code = (said: string, first = '// A synthetic code file.') => `${first}\nexport const FIRST = 1\n${said}export const LAST = 2\n`
const list = (...names: string[]) => `export const SYNTHETIC_OPS = [\n${names.map((name) => `  '${name}',\n`).join('')}] as const\n`
/** The place resolved by keeping both sides, as the brief asks. */
const BOTH = "export const SAID = 'main'\nexport const SAID = 'the entry'\n"

let scratch: string
let office: Server
let api: string

function git(dir: string, ...args: string[]): string {
  const ran = spawnSync(REAL_GIT, ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, ...IDENTITY, HOME: dir } })
  if (ran.status !== 0) throw Error(`git ${args.join(' ')}: ${ran.stderr}`)
  return ran.stdout.trim()
}
function write(dir: string, path: string, text: string) {
  mkdirSync(dirname(join(dir, path)), { recursive: true })
  writeFileSync(join(dir, path), text)
}

/** A file the hand-over door recorded: its path, and the sha256 and mode it has in the resolution, or null when deleted. */
type RecordedFile = { path: string; hash: string | null; mode: string | null }

/** One request the stand-in office received, and whether the entry's hold was there when it came. */
interface Asked {
  method: string
  url: string
  held: boolean
  body: unknown
}

/** The supervisor's own test run as the hand-over door records it, declared with the resolution. */
interface DeclaredRun { commit: string; exit: number; counts: { passed: number; failed: number }; log: string; by: { kind: string; id: string }; at: string }

/** A synthetic resolving entry the stand-in office serves, with its repository and the supervisor's folder. */
interface Entry {
  id: string
  root: string
  ancestor: string
  commit: string
  mainAt: string
  into: string
  resolution: { commit: string; workingDirectory: string; mainAt: string; files: RecordedFile[]; by: { kind: string; id: string }; at: string; tests?: DeclaredRun; refused?: { at: string; says: string } } | null
  resolvingFiles: string[]
  state: string
  asked: Asked[]
}

const entries = new Map<string, Entry>()
const workdirOf = (id: string) => join(scratch, 'work', id)
const sandboxesOf = (id: string) => join(scratch, `sandboxes-${id}`)
const gitLogOf = (id: string) => join(scratch, `git-calls-${id}.log`)
const gitCallsOf = (id: string) => (existsSync(gitLogOf(id)) ? readFileSync(gitLogOf(id), 'utf8').split('\n').filter((one) => one !== '') : [])

/** {path, sha256, mode} of each path `commit` changes against `mainAt`, as the hand-over door records them. */
function theFilesTheDoorRecords(dir: string, mainAt: string, commit: string): RecordedFile[] {
  return git(dir, 'diff', '--no-renames', '--name-only', mainAt, commit)
    .split('\n')
    .filter((one) => one !== '')
    .map((path) => {
      const row = git(dir, 'ls-tree', commit, '--', path)
      if (row === '') return { path, hash: null, mode: null }
      const hash = createHash('sha256').update(execFileSync(REAL_GIT, ['-C', dir, 'cat-file', 'blob', `${commit}:${path}`])).digest('hex')
      return { path, hash, mode: row.split(' ')[0]! }
    })
}

interface Ways {
  /** A second conflicting commit, on three files the queue did not name at its first stop. */
  laterStop?: boolean
  atTheLaterStop?: (into: string) => void
  /** What the supervisor writes and adds at the stop; by default the place keeps both sides. */
  atTheStop?: (into: string) => void
  /** What the supervisor does in its folder after the replay ended, before the hand-over reads its HEAD. */
  afterTheEnd?: (into: string) => void
  /** What the supervisor does in its folder after the hand-over. */
  afterTheHandOver?: (into: string) => void
  /** The paths the conflict step named; by default the code file and the list file. */
  resolvingFiles?: string[]
  /** Changes to the files the door recorded. */
  files?: (files: RecordedFile[]) => RecordedFile[]
  /** The commit of the test run the supervisor declared with the hand-over, given the resolution's and main's; none by default. */
  testsAt?: (resolved: string, mainAt: string) => string
}

/** The clean-copy tool, run as its supervisor runs it. */
function cleanCopy(...args: string[]): void {
  const ran = spawnSync(process.execPath, [CLEAN_COPY, ...args], { encoding: 'utf8', env: { ...process.env, ...IDENTITY }, timeout: 120_000 })
  if (ran.status !== 0) throw Error(`resolve-a-conflict ${args.join(' ')}: ${ran.stderr}`)
}

/**
 * A SYNTHETIC ENTRY IN RESOLVING, with its resolution handed over. The repository is the clean copy's: an ancestor,
 * main's commit that changes the code file's line and adds a name to the list, and the entry's two commits, the first
 * of which changes the same line and adds another name at the same place. The entry is pinned at its ref. The supervisor
 * makes the clean copy with tools/merge-tool/resolve-a-conflict.mjs, resolves the one place and continues to the end.
 */
function aResolvingEntry(id: string, ways: Ways = {}): Entry {
  const root = realpathSync(mkdtempSync(join(scratch, `root-${id}-`)))
  git(root, 'init', '-q', '-b', 'main')
  write(root, CODE, code("export const SAID = 'the ancestor'\n")); write(root, LIST, list('a', 'b')); write(root, OTHER, 'one\n')
  if (ways.laterStop) for (const path of FURTHER) write(root, path, code("export const SAID = 'the ancestor'\n"))
  git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic ancestor')
  const ancestor = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '-q', '-c', 'entry')
  write(root, CODE, code("export const SAID = 'the entry'\n")); write(root, LIST, list('a', 'b', 'fromTheEntry'))
  git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic entry: its line and its name')
  write(root, OTHER, 'one\ntwo\n')
  if (ways.laterStop) for (const path of FURTHER) write(root, path, code("export const SAID = 'the entry'\n"))
  git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic entry: a second commit')
  const commit = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '-q', 'main')
  write(root, CODE, code("export const SAID = 'main'\n")); write(root, LIST, list('a', 'b', 'fromMain'))
  if (ways.laterStop) for (const path of FURTHER) write(root, path, code("export const SAID = 'main'\n"))
  git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic main')
  const mainAt = git(root, 'rev-parse', 'HEAD')
  git(root, 'update-ref', `refs/mole-office/queue/${id}`, commit)

  // THE SUPERVISOR'S CLEAN COPY, resolved and continued to the end of the replay.
  const into = join(realpathSync(mkdtempSync(join(scratch, `into-${id}-`))), 'copy')
  cleanCopy('--entry', id, '--repository', root, '--ref', `refs/mole-office/queue/${id}`, '--commit', commit, '--main-at', mainAt, '--files', [CODE, LIST].join(','), '--into', into)
  if (ways.atTheStop) ways.atTheStop(into)
  else {
    write(into, CODE, code(BOTH))
    git(into, 'add', '--', CODE)
  }
  if (ways.laterStop) {
    // CONTINUE WITH GIT DIRECTLY, so the checker's criterion does not depend on the clean-copy tool accepting stop two.
    const later = spawnSync(REAL_GIT, ['-C', into, 'rebase', '--continue'], { encoding: 'utf8', env: { ...process.env, ...IDENTITY, HOME: into } })
    expect(later.status, later.stdout + later.stderr).toBe(1)
    expect(git(into, 'rev-parse', 'REBASE_HEAD')).toBe(commit)
    expect(git(into, 'diff', '--name-only', '--diff-filter=U').split('\n')).toEqual(FURTHER)
    for (const path of FURTHER) write(into, path, code(BOTH))
    ways.atTheLaterStop?.(into)
    git(into, 'add', '--', ...FURTHER)
    git(into, 'rebase', '--continue')
  } else cleanCopy('--continue', '--into', into)
  ways.afterTheEnd?.(into)
  const resolved = git(into, 'rev-parse', 'HEAD')
  const files = theFilesTheDoorRecords(into, mainAt, resolved)
  ways.afterTheHandOver?.(into)

  const entry: Entry = {
    id,
    root,
    ancestor,
    commit,
    mainAt,
    into,
    resolution: {
      commit: resolved,
      workingDirectory: into,
      mainAt,
      files: ways.files ? ways.files(files) : files,
      by: { kind: 'agent', id: 'synthetic-supervisor' },
      at: new Date().toISOString(),
      ...(ways.testsAt === undefined
        ? {}
        : { tests: { commit: ways.testsAt(resolved, mainAt), exit: 1, counts: { passed: 3, failed: 1 }, log: `${into}.tests.log`, by: { kind: 'agent', id: 'synthetic-supervisor' }, at: new Date().toISOString() } }),
    },
    resolvingFiles: ways.resolvingFiles ?? (ways.laterStop ? [CODE] : [CODE, LIST]),
    state: 'resolving',
    asked: [],
  }
  return theStandInGitOf(entry)
}

/** The entry served by the stand-in office, and its stand-in git. */
function theStandInGitOf(entry: Entry): Entry {
  const id = entry.id
  entries.set(id, entry)
  // THE STAND-IN GIT: it writes whether the hold was there and the whole command, then runs the real git.
  const bin = join(scratch, `bin-${id}`)
  mkdirSync(bin, { recursive: true })
  writeFileSync(
    join(bin, 'git'),
    [
      '#!/bin/sh',
      `if [ -e '${join(workdirOf(id), 'holds', '1.json')}' ]; then held=held; else held=not-held; fi`,
      `printf '%s %s\\n' "$held" "$*" >> '${gitLogOf(id)}'`,
      `exec '${REAL_GIT}' "$@"`,
      '',
    ].join('\n'),
  )
  chmodSync(join(bin, 'git'), 0o755)
  return entry
}

/** Main's side of the code file's place. */
const MAIN = "export const SAID = 'main'\n"
/** A file the entry's first commit adds when `firstAdds` says so. */
const FIRST_ADDS = 'work/first.txt'

interface Emptying {
  /** The messages of the entry's two commits; by default two different ones. */
  messages?: [string, string]
  /** The entry's second commit also changes the further file B, which main changed too, so the replay stops there again. */
  laterStop?: boolean
  /** The entry's first commit also adds a file, so taking main's side in its place does not empty it. */
  firstAdds?: boolean
  /** What the supervisor does from the first stop to the end of the replay; by default it takes main's side and continues. */
  fromTheStop?: (into: string) => void
}

/**
 * A SYNTHETIC ENTRY WHOSE FIRST COMMIT MAIN ALREADY HOLDS, in resolving with its resolution handed over. The ancestor,
 * main's commit that changes the code file's line, and the entry's two commits: the first changes the same line, and the
 * second adds a line to another file. The queue's stop is at the first. By default its supervisor takes main's side there
 * in the clean copy and continues, and at a later stop keeps both sides.
 */
function anEntryMainAlreadyHolds(id: string, ways: Emptying = {}): Entry {
  const [first, second] = ways.messages ?? ['Synthetic entry: the line main already changed', 'Synthetic entry: a second commit']
  const root = realpathSync(mkdtempSync(join(scratch, `root-${id}-`)))
  git(root, 'init', '-q', '-b', 'main')
  write(root, CODE, code("export const SAID = 'the ancestor'\n")); write(root, OTHER, 'one\n')
  if (ways.laterStop) write(root, FURTHER[0]!, code("export const SAID = 'the ancestor'\n"))
  git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic ancestor')
  const ancestor = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '-q', '-c', 'entry')
  write(root, CODE, code("export const SAID = 'the entry'\n"))
  if (ways.firstAdds) write(root, FIRST_ADDS, 'one\n')
  git(root, 'add', '.'); git(root, 'commit', '-q', '-m', first)
  write(root, OTHER, 'one\ntwo\n')
  if (ways.laterStop) write(root, FURTHER[0]!, code("export const SAID = 'the entry'\n"))
  git(root, 'add', '.'); git(root, 'commit', '-q', '-m', second)
  const commit = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '-q', 'main')
  write(root, CODE, code(MAIN))
  if (ways.laterStop) write(root, FURTHER[0]!, code(MAIN))
  git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic main')
  const mainAt = git(root, 'rev-parse', 'HEAD')
  git(root, 'update-ref', `refs/mole-office/queue/${id}`, commit)

  const into = join(realpathSync(mkdtempSync(join(scratch, `into-${id}-`))), 'copy')
  cleanCopy('--entry', id, '--repository', root, '--ref', `refs/mole-office/queue/${id}`, '--commit', commit, '--main-at', mainAt, '--files', CODE, '--into', into)
  if (ways.fromTheStop) ways.fromTheStop(into)
  else {
    write(into, CODE, code(MAIN)); git(into, 'add', '--', CODE)
    cleanCopy('--continue', '--into', into)
    if (ways.laterStop) {
      write(into, FURTHER[0]!, code(BOTH)); git(into, 'add', '--', FURTHER[0]!)
      cleanCopy('--continue', '--into', into)
    }
  }
  const resolved = git(into, 'rev-parse', 'HEAD')
  return theStandInGitOf({
    id,
    root,
    ancestor,
    commit,
    mainAt,
    into,
    resolution: { commit: resolved, workingDirectory: into, mainAt, files: theFilesTheDoorRecords(into, mainAt, resolved), by: { kind: 'agent', id: 'synthetic-supervisor' }, at: new Date().toISOString() },
    resolvingFiles: [CODE],
    state: 'resolving',
    asked: [],
  })
}

/** A file main adds between the branch's two merges of main. */
const MAINS_OWN = 'work/main.txt'
/** The message of main's commit that writes main's line in the code file, which the branch's first merge of main takes. */
const MAINS_LINE_LANDED = 'Synthetic main: the line, landed'

/**
 * A SYNTHETIC ENTRY WHOSE BRANCH HOLDS TWO MERGES OF MAIN, in resolving with its resolution handed over. The entry's
 * first commit changes the code file's line, and main then lands the same line as its own. The branch merges main and
 * takes main's side there, so main holds what that commit meant. The branch makes a second commit, merges main again,
 * and makes a third, which changes the further file B; main's last commit changes B too. The replay is linear, so it
 * leaves out both merges and stops at the first commit and at the third. Its supervisor makes the resolution in the
 * clean copy: at the first stop it takes main's side, as the branch's own merge did, and git drops the commit, which is
 * then empty; at the third it keeps both sides.
 */
function anEntryThatMergedMain(id: string): Entry {
  const root = realpathSync(mkdtempSync(join(scratch, `root-${id}-`)))
  git(root, 'init', '-q', '-b', 'main')
  write(root, CODE, code("export const SAID = 'the ancestor'\n")); write(root, OTHER, 'one\n'); write(root, FURTHER[0]!, code("export const SAID = 'the ancestor'\n"))
  git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic ancestor')
  const ancestor = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '-q', '-c', 'entry')
  write(root, CODE, code("export const SAID = 'the entry'\n"))
  git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic entry: the line main landed as its own')
  git(root, 'switch', '-q', 'main')
  write(root, CODE, code(MAIN))
  git(root, 'add', '.'); git(root, 'commit', '-q', '-m', MAINS_LINE_LANDED)
  git(root, 'switch', '-q', 'entry')
  git(root, 'merge', '-q', '--no-ff', '-X', 'theirs', '-m', 'Synthetic entry: merge main, taking its line', 'main')
  write(root, OTHER, 'one\ntwo\n')
  git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic entry: a second commit')
  git(root, 'switch', '-q', 'main')
  write(root, MAINS_OWN, 'one\n')
  git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic main: a file of its own')
  git(root, 'switch', '-q', 'entry')
  git(root, 'merge', '-q', '--no-ff', '-m', 'Synthetic entry: merge main again', 'main')
  write(root, FURTHER[0]!, code("export const SAID = 'the entry'\n"))
  git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic entry: a third commit')
  const commit = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '-q', 'main')
  write(root, FURTHER[0]!, code(MAIN))
  git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic main')
  const mainAt = git(root, 'rev-parse', 'HEAD')
  git(root, 'update-ref', `refs/mole-office/queue/${id}`, commit)

  const into = join(realpathSync(mkdtempSync(join(scratch, `into-${id}-`))), 'copy')
  cleanCopy('--entry', id, '--repository', root, '--ref', `refs/mole-office/queue/${id}`, '--commit', commit, '--main-at', mainAt, '--files', CODE, '--into', into)
  write(into, CODE, code(MAIN)); git(into, 'add', '--', CODE)
  cleanCopy('--continue', '--into', into)
  write(into, FURTHER[0]!, code(BOTH)); git(into, 'add', '--', FURTHER[0]!)
  cleanCopy('--continue', '--into', into)
  const resolved = git(into, 'rev-parse', 'HEAD')
  return theStandInGitOf({
    id,
    root,
    ancestor,
    commit,
    mainAt,
    into,
    resolution: { commit: resolved, workingDirectory: into, mainAt, files: theFilesTheDoorRecords(into, mainAt, resolved), by: { kind: 'agent', id: 'synthetic-supervisor' }, at: new Date().toISOString() },
    resolvingFiles: [CODE],
    state: 'resolving',
    asked: [],
  })
}

/** The message of main's commit that removes the code file's line, which the branch's merge of main takes. */
const MAINS_REMOVAL = 'Synthetic main: the line removed'

/**
 * A SYNTHETIC ENTRY THAT MERGED MAIN'S REMOVAL OF A LINE (wave 13u round 130), in resolving with its resolution handed
 * over. The entry's first commit changes the code file's line, and main then removes that line. The branch merges main,
 * taking main's side, makes a second commit, and main lands a file of its own. The replay is linear, so it stops at the
 * first commit, and main's side of that place is no line at all, so no line of main can be blamed and the check falls
 * back to main's commits to the file. Its supervisor takes main's side, and git drops the commit, which is then empty.
 */
function anEntryThatMergedMainsRemoval(id: string): Entry {
  const root = realpathSync(mkdtempSync(join(scratch, `root-${id}-`)))
  git(root, 'init', '-q', '-b', 'main')
  write(root, CODE, code("export const SAID = 'the ancestor'\n")); write(root, OTHER, 'one\n')
  git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic ancestor')
  const ancestor = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '-q', '-c', 'entry')
  write(root, CODE, code("export const SAID = 'the entry'\n"))
  git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic entry: the line main removed')
  git(root, 'switch', '-q', 'main')
  write(root, CODE, code(''))
  git(root, 'add', '.'); git(root, 'commit', '-q', '-m', MAINS_REMOVAL)
  git(root, 'switch', '-q', 'entry')
  git(root, 'merge', '-q', '--no-ff', '-X', 'theirs', '-m', 'Synthetic entry: merge main, taking its removal', 'main')
  write(root, OTHER, 'one\ntwo\n')
  git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic entry: a second commit')
  const commit = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '-q', 'main')
  write(root, MAINS_OWN, 'one\n')
  git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic main: a file of its own')
  const mainAt = git(root, 'rev-parse', 'HEAD')
  git(root, 'update-ref', `refs/mole-office/queue/${id}`, commit)

  const into = join(realpathSync(mkdtempSync(join(scratch, `into-${id}-`))), 'copy')
  cleanCopy('--entry', id, '--repository', root, '--ref', `refs/mole-office/queue/${id}`, '--commit', commit, '--main-at', mainAt, '--files', CODE, '--into', into)
  write(into, CODE, code('')); git(into, 'add', '--', CODE)
  cleanCopy('--continue', '--into', into)
  const resolved = git(into, 'rev-parse', 'HEAD')
  return theStandInGitOf({
    id,
    root,
    ancestor,
    commit,
    mainAt,
    into,
    resolution: { commit: resolved, workingDirectory: into, mainAt, files: theFilesTheDoorRecords(into, mainAt, resolved), by: { kind: 'agent', id: 'synthetic-supervisor' }, at: new Date().toISOString() },
    resolvingFiles: [CODE],
    state: 'resolving',
    asked: [],
  })
}

/** The file the two sides disagree about as a whole: its name in the ancestor, the names main and the entry give it, and a file both add. */
const ANCESTORS_NAME = 'work/numbered-04.txt'
const MAINS_NAME = 'work/numbered-09.txt'
const ENTRYS_NAME = 'work/numbered-06.txt'
const ADDED = 'work/added.txt'
/** Ten lines, long enough that git finds the file renamed with one or two of them changed to be the same file. */
const NUMBERED = Array.from({ length: 10 }, (_, n) => `Synthetic line ${String(n + 1)} of the numbered file, as the ancestor has it.`)
/** The ten lines, with each line numbered in `said` (from 1) said otherwise. */
const numbered = (said: Record<number, string> = {}) => NUMBERED.map((line, at) => `${said[at + 1] ?? line}\n`).join('')
const MAINS_LINE = 'Synthetic line, as main has it.'
const ENTRYS_LINE = 'Synthetic line, as the entry has it.'
const ENTRYS_LAST = 'Synthetic last line, as the entry has it.'

/** What one side does to the numbered file, in the repository's work tree. */
type Side = (root: string) => void
const renamedTo = (to: string, said: Record<number, string>): Side => (root) => { git(root, 'mv', ANCESTORS_NAME, to); write(root, to, numbered(said)) }
const deletedThere: Side = (root) => { git(root, 'rm', '-q', ANCESTORS_NAME) }
const changedThere = (said: Record<number, string>): Side => (root) => write(root, ANCESTORS_NAME, numbered(said))
const addedThere = (words: string): Side => (root) => write(root, ADDED, words)

/**
 * A SYNTHETIC ENTRY WHOSE STOP IS ABOUT A WHOLE FILE, in resolving with its resolution handed over. The ancestor holds the
 * numbered file, and main's commit and the entry's one commit each do their side to it. The supervisor's folder is a
 * clone that git itself replays onto main, and `atTheStop` resolves the stop there before git continues.
 */
function aWholeFileEntry(id: string, mains: Side, entrys: Side, resolvingFiles: string[], atTheStop: (into: string) => void): Entry {
  const root = realpathSync(mkdtempSync(join(scratch, `root-${id}-`)))
  git(root, 'init', '-q', '-b', 'main')
  write(root, ANCESTORS_NAME, numbered()); write(root, OTHER, 'one\n')
  git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic ancestor')
  const ancestor = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '-q', '-c', 'entry')
  entrys(root); git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'Synthetic entry: its side of the numbered file')
  const commit = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '-q', 'main')
  mains(root); git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'Synthetic main: its side of the numbered file')
  const mainAt = git(root, 'rev-parse', 'HEAD')
  git(root, 'update-ref', `refs/mole-office/queue/${id}`, commit)

  const into = join(realpathSync(mkdtempSync(join(scratch, `into-${id}-`))), 'copy')
  git(scratch, 'clone', '-q', '--no-checkout', root, into)
  git(into, 'checkout', '-q', '--detach', commit)
  const stopped = spawnSync(REAL_GIT, ['-C', into, 'rebase', mainAt], { encoding: 'utf8', env: { ...process.env, ...IDENTITY, HOME: into } })
  expect(stopped.status, stopped.stdout + stopped.stderr).toBe(1)
  atTheStop(into)
  git(into, '-c', 'core.editor=true', 'rebase', '--continue')
  const resolved = git(into, 'rev-parse', 'HEAD')
  return theStandInGitOf({
    id,
    root,
    ancestor,
    commit,
    mainAt,
    into,
    resolution: { commit: resolved, workingDirectory: into, mainAt, files: theFilesTheDoorRecords(into, mainAt, resolved), by: { kind: 'agent', id: 'synthetic-supervisor' }, at: new Date().toISOString() },
    resolvingFiles,
    state: 'resolving',
    asked: [],
  })
}

/**
 * A MIGRATION THE QUEUE RENUMBERED (wave 13u round 132, item 51). The ancestor holds its SQL file as 0304, main as 0309
 * and the entry as 0306, each by a rename with its lines unchanged, so the stop is about the whole file and the merge of
 * the three files has no place. The entry's commit also writes lines naming the migration in a file git merges with no
 * conflict, where main changed another line and already holds a line that says 0306 about something else.
 */
const MIGRATION = 'synthetic_categories'
const MIGRATIONS = { ancestor: `drizzle/0304_${MIGRATION}.sql`, main: `drizzle/0309_${MIGRATION}.sql`, entry: `drizzle/0306_${MIGRATION}.sql` }
/** The same three names for a file that is not a migration's SQL. */
const NOT_A_MIGRATION = { ancestor: `docs/0304_${MIGRATION}.md`, main: `docs/0309_${MIGRATION}.md`, entry: `docs/0306_${MIGRATION}.md` }
const NAMING = 'src/synthetic-schema.ts'
const SQL = Array.from({ length: 10 }, (_, n) => `-- Synthetic line ${String(n + 1)} of a made-up migration.\n`).join('')
/** The file that names the migration: its first line, the lines the entry adds, and the number main's own line says. */
const naming = (first: string, added: readonly string[] = [], mains = '0306') =>
  `// A synthetic schema file${first}.\n// Synthetic: main already says ${mains} here, about another made-up thing.\nexport const FIRST = 1\n${added.map((line) => `${line}\n`).join('')}export const LAST = 2\n`
const THE_ENTRYS_LINES = ['// Migration 0306_synthetic_categories adds the made-up categories.', "export const MIGRATION = '0306'"] as const
const IN_MAINS_NUMBERS = ['// Migration 0309_synthetic_categories adds the made-up categories.', "export const MIGRATION = '0309'"] as const

/**
 * A SYNTHETIC ENTRY WHOSE STOP RENAMED A MIGRATION DIFFERENTLY ON EACH SIDE, in resolving with its resolution handed
 * over. The supervisor's folder is a clone that git itself replays onto main. At the stop the supervisor keeps main's
 * name only, adds main's file as it stands, and writes `named` as the file that names the migration.
 */
function aRenumberedEntry(id: string, named: string, entrysLines: readonly string[] = THE_ENTRYS_LINES, names = MIGRATIONS): Entry {
  const root = realpathSync(mkdtempSync(join(scratch, `root-${id}-`)))
  git(root, 'init', '-q', '-b', 'main')
  write(root, names.ancestor, SQL); write(root, NAMING, naming('')); write(root, OTHER, 'one\n')
  git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic ancestor')
  const ancestor = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '-q', '-c', 'entry')
  git(root, 'mv', names.ancestor, names.entry); write(root, NAMING, naming('', entrysLines))
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'Synthetic entry: its migration and the lines naming it')
  const commit = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '-q', 'main')
  git(root, 'mv', names.ancestor, names.main); write(root, NAMING, naming(', as main has it'))
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'Synthetic main: the migration renumbered')
  const mainAt = git(root, 'rev-parse', 'HEAD')
  git(root, 'update-ref', `refs/mole-office/queue/${id}`, commit)

  const into = join(realpathSync(mkdtempSync(join(scratch, `into-${id}-`))), 'copy')
  git(scratch, 'clone', '-q', '--no-checkout', root, into)
  git(into, 'checkout', '-q', '--detach', commit)
  const stopped = spawnSync(REAL_GIT, ['-C', into, 'rebase', mainAt], { encoding: 'utf8', env: { ...process.env, ...IDENTITY, HOME: into } })
  expect(stopped.status, stopped.stdout + stopped.stderr).toBe(1)
  // GIT MERGED THE NAMING FILE WITH NO CONFLICT, so it is not among the paths left in conflict.
  expect(git(into, 'diff', '--name-only', '--diff-filter=U').split('\n')).toEqual([names.ancestor, names.main, names.entry].sort())
  git(into, 'rm', '-q', '--', names.ancestor, names.entry)
  write(into, names.main, SQL); git(into, 'add', '--', names.main)
  write(into, NAMING, named); git(into, 'add', '--', NAMING)
  git(into, '-c', 'core.editor=true', 'rebase', '--continue')
  const resolved = git(into, 'rev-parse', 'HEAD')
  return theStandInGitOf({
    id,
    root,
    ancestor,
    commit,
    mainAt,
    into,
    resolution: { commit: resolved, workingDirectory: into, mainAt, files: theFilesTheDoorRecords(into, mainAt, resolved), by: { kind: 'agent', id: 'synthetic-supervisor' }, at: new Date().toISOString() },
    resolvingFiles: [names.ancestor, names.entry, names.main],
    state: 'resolving',
    asked: [],
  })
}

function answer(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function theEntryAsTheOfficeReadsIt(entry: Entry) {
  return {
    id: entry.id,
    state: entry.state,
    lane: entry.root,
    waitsOn: entry.state === 'pinned' ? 'Synthetic: the inspector' : 'Synthetic: its supervisor',
    changeset: { adapter: 'git', root: entry.root, base: entry.ancestor, commit: entry.commit, branch: 'entry' },
    machine: {
      resolving: { files: entry.resolvingFiles, mainAt: entry.mainAt, since: new Date().toISOString(), timeZone: 'UTC' },
      resolution: entry.resolution,
    },
  }
}

/** THE STAND-IN OFFICE: the four requests a check run makes, and nothing else. A step moves the entry as the office would. */
async function startTheOffice(): Promise<void> {
  office = createServer(async (req, res) => {
    let text = ''
    for await (const chunk of req) text += String(chunk)
    const url = req.url ?? '/'
    const match = /^\/api\/merge-queue\/([^/?]+)(?:\/([a-z-]+))?$/.exec(url)
    const entry = match === null ? undefined : entries.get(decodeURIComponent(match[1]!))
    if (match === null || entry === undefined) return answer(res, 404, { error: `Synthetic: the stand-in office does not serve ${req.method ?? ''} ${url}.` })
    entry.asked.push({ method: req.method ?? '', url, held: existsSync(join(workdirOf(entry.id), 'holds', '1.json')), body: text === '' ? null : JSON.parse(text) })
    if (req.method === 'GET' && match[2] === undefined) return answer(res, 200, { entry: theEntryAsTheOfficeReadsIt(entry) })
    if (req.method === 'POST' && match[2] === 'step') {
      const facts = (JSON.parse(text) as { facts: { ok: boolean; says?: string } }).facts
      if (facts.ok) entry.state = 'pinned'
      else entry.resolution = { ...entry.resolution!, refused: { at: new Date().toISOString(), says: facts.says ?? '' } }
      return answer(res, 200, { decided: 'Synthetic: the stand-in office took the step.' })
    }
    if (req.method === 'POST' && (match[2] === 'tool-started' || match[2] === 'tool-ended')) return answer(res, 200, {})
    return answer(res, 404, { error: `Synthetic: the stand-in office does not serve ${req.method ?? ''} ${url}.` })
  })
  await new Promise<void>((resolve) => office.listen(0, '127.0.0.1', resolve))
  api = `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`
}

interface Run {
  code: number | null
  out: string
  err: string
}

const groups = new Set<number>()

function aCheckRun(entry: Entry): Promise<Run> {
  const child = spawn(
    process.execPath,
    [
      TOOL, '--check-resolution', '--entry', entry.id, '--session', `synthetic-session-${entry.id}`, '--api', api, '--workspace', 'default',
      '--workdir', workdirOf(entry.id), '--office-for', '30', '--sandbox-tool', STAND_IN_SANDBOX, '--sandboxes', sandboxesOf(entry.id),
    ],
    {
      cwd: REPO,
      env: { ...process.env, PATH: `${join(scratch, `bin-${entry.id}`)}:${process.env['PATH'] ?? ''}`, MOLE_OFFICE_API: api, MOLE_OFFICE_DB: join(scratch, 'no-office.db') },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  groups.add(child.pid!)
  let out = ''
  let err = ''
  child.stdout!.on('data', (chunk: Buffer) => (out += chunk.toString()))
  child.stderr!.on('data', (chunk: Buffer) => (err += chunk.toString()))
  return new Promise<Run>((resolve) => {
    child.on('close', (code) => {
      groups.delete(child.pid!)
      resolve({ code, out, err })
    })
  })
}

function endingOf(run: Run): { ok: boolean; says: string } {
  const last = run.out.trim().split('\n').at(-1) ?? ''
  expect(last.startsWith(ENDED), `exit ${String(run.code)}:\n${run.out}${run.err}`).toBe(true)
  return JSON.parse(last.slice(ENDED.length)) as { ok: boolean; says: string }
}

const stepsOf = (entry: Entry) => entry.asked.filter((one) => one.method === 'POST' && one.url.endsWith('/step')).map((one) => one.body)
const theRefOf = (entry: Entry) => spawnSync(REAL_GIT, ['-C', entry.root, 'rev-parse', '--verify', '-q', `refs/mole-office/resolved/${entry.id}`], { encoding: 'utf8' })

/** A check run on the entry that ends with the step refused in `says`, and the ref not written. */
async function itIsRefused(entry: Entry, says: string): Promise<void> {
  const run = await aCheckRun(entry)
  expect(run.code, run.out + run.err).toBe(0)
  expect(endingOf(run)).toEqual({ ok: true, says: `The merge tool finished: this run only checks a resolution, and merge entry ${entry.id} is now resolving and waits on Synthetic: its supervisor.` })
  expect(stepsOf(entry)).toEqual([{ step: 'resolution-checked', facts: { commit: entry.resolution!.commit, ok: false, says } }])
  expect(theRefOf(entry).status, 'a refused resolution has no ref').not.toBe(0)
  expect(existsSync(join(sandboxesOf(entry.id), 'calls.jsonl')), 'a check run asked for a sandbox').toBe(false)
}

beforeAll(async () => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'the-merge-tool-checks-a-resolution-')))
  mkdirSync(join(scratch, 'work'), { recursive: true })
  await startTheOffice()
})

afterAll(async () => {
  for (const group of groups) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Gone already.
    }
  }
  await new Promise<void>((resolve) => office?.close(() => resolve()))
  if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true })
})

describe('a check run of the merge tool, on a resolution that keeps both sides', () => {
  it('passes a later stop on three further files and hands on the places of both stops', async () => {
    const entry = aResolvingEntry('synthCheckLater', { laterStop: true })
    const run = await aCheckRun(entry)
    expect(run.code, run.out + run.err).toBe(0)
    expect(entry.resolvingFiles).toEqual([CODE])
    const resolved = entry.resolution!.commit
    const first = git(entry.into, 'rev-parse', `${resolved}~1`)
    const firstEntry = git(entry.root, 'rev-parse', `${entry.commit}~1`)
    expect(stepsOf(entry)).toEqual([{
      step: 'resolution-checked',
      facts: {
        commit: resolved,
        ok: true,
        ref: `refs/mole-office/resolved/${entry.id}`,
        places: [CODE, ...FURTHER].map((path) => ({
          path,
          at: 3,
          entryCommit: path === CODE ? firstEntry : entry.commit,
          resolvedIn: path === CODE ? first : resolved,
          ancestor: { lines: ["export const SAID = 'the ancestor'"], more: 0 },
          main: { lines: ["export const SAID = 'main'"], more: 0 },
          entry: { lines: ["export const SAID = 'the entry'"], more: 0 },
          resolution: { lines: ["export const SAID = 'main'", "export const SAID = 'the entry'"], more: 0 },
          mainCommits: [entry.mainAt],
          mainBy: 'lines',
        })),
      },
    }])
    expect(git(entry.root, 'rev-parse', `refs/mole-office/resolved/${entry.id}`)).toBe(resolved)
    expect(entry.state).toBe('pinned')
  }, 180_000)

  it('passes it, hands on the place with main\'s commit, points the resolved ref at it, and works in its own clone with no sandbox', async () => {
    // A DECLARED RUN AT THE RESOLUTION'S COMMIT, which failed: the check reads only its commit.
    const entry = aResolvingEntry('synthCheckPass', { testsAt: (resolved) => resolved })
    const resolved = entry.resolution!.commit
    const run = await aCheckRun(entry)
    expect(run.code, run.out + run.err).toBe(0)
    expect(endingOf(run)).toEqual({ ok: true, says: `The merge tool finished: this run only checks a resolution, and merge entry ${entry.id} is now pinned and waits on Synthetic: the inspector.` })
    expect(entry.asked.map((one) => `${one.method} ${one.url.replace(entry.id, 'E')}`)).toEqual([
      'GET /api/merge-queue/E',
      'POST /api/merge-queue/E/tool-started',
      'POST /api/merge-queue/E/step',
      'GET /api/merge-queue/E',
      'POST /api/merge-queue/E/tool-ended',
    ])
    expect(entry.asked.every((one) => one.held), 'a request reached the office before the hold').toBe(true)
    // THE PLACE, with its four sides, the entry's commit the replay stopped on, and main's commit that wrote main's line.
    expect(stepsOf(entry)).toEqual([
      {
        step: 'resolution-checked',
        facts: {
          commit: resolved,
          ok: true,
          ref: `refs/mole-office/resolved/${entry.id}`,
          places: [
            {
              path: CODE,
              at: 3,
              entryCommit: git(entry.root, 'rev-parse', `${entry.commit}~1`),
              resolvedIn: git(entry.into, 'rev-parse', `${resolved}~1`),
              ancestor: { lines: ["export const SAID = 'the ancestor'"], more: 0 },
              main: { lines: ["export const SAID = 'main'"], more: 0 },
              entry: { lines: ["export const SAID = 'the entry'"], more: 0 },
              resolution: { lines: ["export const SAID = 'main'", "export const SAID = 'the entry'"], more: 0 },
              mainCommits: [entry.mainAt],
              mainBy: 'lines',
            },
          ],
        },
      },
    ])
    expect(git(entry.root, 'rev-parse', `refs/mole-office/resolved/${entry.id}`)).toBe(resolved)
    // ITS OWN CLONE, under <workdir>/resolution, and every git command after the hold with -c gc.auto=0.
    const clone = join(workdirOf(entry.id), 'resolution', 'clone')
    // THE LIST-JOIN DRIVER, which git itself runs at the stop (tools/merge-tool/list-join.mjs), merges three temporary
    // files with `git merge-file`, which writes into no repository and so cannot start git's housekeeping. It is the one
    // git command of the run without the prefix.
    const theDriver = /^held merge-file -p --diff3 --marker-size=\d+ -L main -L ancestor -L entry \S*mole-office-list-join-/
    const calls = gitCallsOf(entry.id).filter((one) => !theDriver.test(one))
    expect(calls.some((one) => one.startsWith(`held -c gc.auto=0 -C ${clone} rebase`))).toBe(true)
    expect(calls.filter((one) => !one.startsWith(`held -c gc.auto=0 -C ${entry.root} `) && !one.startsWith(`held -c gc.auto=0 -C ${clone} `)), 'a git command before the hold, without -c gc.auto=0, or outside the lane and the clone').toEqual([])
    expect(existsSync(join(sandboxesOf(entry.id), 'calls.jsonl')), 'a check run asked for a sandbox').toBe(false)
  }, 180_000)
})

describe('a check run refuses', () => {
  it('a change outside a place in the further file C at a later stop', async () => {
    const path = FURTHER[1]!
    const entry = aResolvingEntry('synthCheckFurtherOutside', {
      laterStop: true,
      atTheLaterStop: (into) => write(into, path, code(BOTH, '// A synthetic code file, said otherwise.')),
    })
    await itIsRefused(entry, `${path} as resolved does not keep the conflicted text's first 2 lines before its first place. That is a change outside the places git left in conflict.`)
  }, 180_000)

  it('a folder whose HEAD is no longer the resolution', async () => {
    const entry = aResolvingEntry('synthCheckHead', { afterTheHandOver: (into) => git(into, 'checkout', '-q', '--detach', 'HEAD~1') })
    const moved = git(entry.into, 'rev-parse', 'HEAD')
    await itIsRefused(entry, `The HEAD of ${entry.into} is ${moved}, not the resolution's commit ${entry.resolution!.commit}, which the hand-over door read there. The folder must keep its HEAD at the resolution until the entry ends.`)
  }, 180_000)

  it('a change outside the place git left in conflict', async () => {
    const entry = aResolvingEntry('synthCheckOutside', {
      atTheStop: (into) => {
        write(into, CODE, code(BOTH, '// A synthetic code file, said otherwise.'))
        git(into, 'add', '--', CODE)
      },
    })
    await itIsRefused(entry, `${CODE} as resolved does not keep the conflicted text's first 2 lines before its first place. That is a change outside the places git left in conflict.`)
  }, 180_000)

  it('a change to a path git did not leave in conflict', async () => {
    const entry = aResolvingEntry('synthCheckJoined', {
      atTheStop: (into) => {
        write(into, CODE, code(BOTH))
        write(into, LIST, list('a', 'b', 'fromMain', 'fromTheEntry', 'fromTheSupervisor'))
        git(into, 'add', '--', CODE, LIST)
      },
    })
    const resolved = entry.resolution!.commit
    await itIsRefused(
      entry,
      `At the entry's commit ${git(entry.root, 'rev-parse', `${entry.commit}~1`).slice(0, 12)}, the resolution's commit ${git(entry.into, 'rev-parse', `${resolved}~1`).slice(0, 12)} differs from git's own result outside the paths left in conflict, in ${LIST}.`,
    )
  }, 180_000)

  it('a resolved file with a mode neither side had', async () => {
    const entry = aResolvingEntry('synthCheckMode', {
      atTheStop: (into) => {
        write(into, CODE, code(BOTH))
        chmodSync(join(into, CODE), 0o755)
        git(into, 'add', '--', CODE)
      },
    })
    const resolved = entry.resolution!.commit
    await itIsRefused(entry, `In the resolution's commit ${git(entry.into, 'rev-parse', `${resolved}~1`).slice(0, 12)}, ${CODE} has mode 100755, which neither side had (100644).`)
  }, 180_000)

  it("a commit whose message is not the replay's", async () => {
    const entry = aResolvingEntry('synthCheckMessage', { afterTheEnd: (into) => git(into, 'commit', '-q', '--amend', '-m', 'Synthetic entry: a second commit, said otherwise') })
    await itIsRefused(entry, `The resolution's commit 2, ${entry.resolution!.commit.slice(0, 12)}, does not carry the message of the replay's commit 2: Synthetic entry: a second commit.`)
  }, 180_000)

  it('a commit more than the replay makes', async () => {
    const entry = aResolvingEntry('synthCheckCount', { afterTheEnd: (into) => git(into, 'commit', '-q', '--allow-empty', '-m', 'Synthetic: one commit more') })
    await itIsRefused(entry, 'The replay made 2 commits on top of main, and the resolution has 3.')
  }, 180_000)

  it('a file whose hash is not the one the hand-over door recorded', async () => {
    const wrong = '0'.repeat(64)
    const entry = aResolvingEntry('synthCheckHash', { files: (files) => files.map((one) => (one.path === CODE ? { ...one, hash: wrong } : one)) })
    const real = createHash('sha256').update(code(BOTH)).digest('hex')
    await itIsRefused(entry, `${CODE} in the resolution's commit has hash ${real} and mode 100644, and the hand-over door recorded ${wrong} and 100644.`)
  }, 180_000)

  it("a declared test run at a commit that is not the resolution's", async () => {
    const entry = aResolvingEntry('synthCheckTests', { testsAt: (_resolved, mainAt) => mainAt })
    await itIsRefused(
      entry,
      `The test run declared with this hand-over ran at commit ${entry.mainAt}, and the resolution's commit is ${entry.resolution!.commit}, so it is not a run of this resolution. ` +
        'Hand the resolution over again with a run at its commit, or with none.',
    )
  }, 180_000)

  it('a stop on a path the conflict step did not name', async () => {
    const entry = aResolvingEntry('synthCheckUnnamed', { resolvingFiles: [LIST] })
    await itIsRefused(entry, `The replay stopped on ${CODE}, which the conflict step did not name: it named ${LIST}.`)
  }, 180_000)
})

describe('a check run of a resolution that empties a commit main already holds', () => {
  const twelve = (commit: string) => commit.slice(0, 12)
  const firstOf = (entry: Entry) => git(entry.root, 'rev-parse', `${entry.commit}~1`)
  /** The resolution's commits on top of main, oldest first. */
  const commitsOf = (entry: Entry) => git(entry.into, 'rev-list', '--reverse', `${entry.mainAt}..${entry.resolution!.commit}`).split('\n').filter((one) => one !== '')
  const keepBoth = (into: string) => {
    write(into, CODE, code(BOTH)); git(into, 'add', '--', CODE)
    cleanCopy('--continue', '--into', into)
  }
  /** A place of the replay, with its four sides. */
  const aPlace = (entry: Entry, path: string, entryCommit: string, resolvedIn: string | null, resolution: string[]) => ({
    path,
    at: 3,
    entryCommit,
    resolvedIn,
    ancestor: { lines: ["export const SAID = 'the ancestor'"], more: 0 },
    main: { lines: ["export const SAID = 'main'"], more: 0 },
    entry: { lines: ["export const SAID = 'the entry'"], more: 0 },
    resolution: { lines: resolution, more: 0 },
    mainCommits: [entry.mainAt],
    mainBy: 'lines',
  })
  /** The first stop's place, resolved to main's side: the resolution holds no commit for it, so it names none. */
  const takenFromMain = (entry: Entry) => aPlace(entry, CODE, firstOf(entry), null, ["export const SAID = 'main'"])

  it("passes a conflict resolved to main's text, whose commit the clean copy and the check's replay both drop", async () => {
    const entry = anEntryMainAlreadyHolds('synthEmptied')
    const resolved = entry.resolution!.commit
    // THE CLEAN COPY DROPPED THE EMPTIED COMMIT: the resolution is the entry's second commit alone, on main.
    expect(commitsOf(entry).map((one) => git(entry.into, 'log', '-1', '--format=%s', one))).toEqual(['Synthetic entry: a second commit'])
    const run = await aCheckRun(entry)
    expect(run.code, run.out + run.err).toBe(0)
    expect(stepsOf(entry)).toEqual([{ step: 'resolution-checked', facts: { commit: resolved, ok: true, ref: `refs/mole-office/resolved/${entry.id}`, places: [takenFromMain(entry)] } }])
    expect(git(entry.root, 'rev-parse', `refs/mole-office/resolved/${entry.id}`)).toBe(resolved)
    expect(entry.state).toBe('pinned')
  }, 180_000)

  it('pairs a later stop with its own commit of the resolution, after the commit git dropped', async () => {
    const entry = anEntryMainAlreadyHolds('synthEmptiedLater', { laterStop: true })
    const resolved = entry.resolution!.commit
    expect(commitsOf(entry)).toEqual([resolved])
    const run = await aCheckRun(entry)
    expect(run.code, run.out + run.err).toBe(0)
    expect(stepsOf(entry)).toEqual([{
      step: 'resolution-checked',
      facts: {
        commit: resolved,
        ok: true,
        ref: `refs/mole-office/resolved/${entry.id}`,
        places: [takenFromMain(entry), aPlace(entry, FURTHER[0]!, entry.commit, resolved, ["export const SAID = 'main'", "export const SAID = 'the entry'"])],
      },
    }])
    expect(entry.state).toBe('pinned')
  }, 180_000)

  it('passes an entry whose branch holds two merges of main, and pairs each stop with its commit of the linear resolution', async () => {
    const entry = anEntryThatMergedMain('synthMergedMain')
    const resolved = entry.resolution!.commit
    const subjectsOf = (range: string, ...more: string[]) => git(entry.root, 'log', '--reverse', '--format=%s', ...more, range).split('\n')
    // THE BRANCH HOLDS TWO MERGES OF MAIN, and the replay leaves both out: it replays the entry's three commits.
    expect(subjectsOf(`${entry.mainAt}..${entry.commit}`, '--merges')).toEqual(['Synthetic entry: merge main, taking its line', 'Synthetic entry: merge main again'])
    const [first, , third] = git(entry.root, 'rev-list', '--reverse', '--no-merges', `${entry.mainAt}..${entry.commit}`).split('\n')
    expect(third).toBe(entry.commit)
    // MAIN WROTE THE FIRST PLACE'S LINE BEFORE THE BRANCH'S FIRST MERGE OF MAIN, and that merge took it. So the merge base
    // of the entry and main, which is the last commit of main the branch merged, is past main's commit that wrote it.
    const landed = git(entry.root, 'log', '--format=%H', '--fixed-strings', `--grep=${MAINS_LINE_LANDED}`, entry.mainAt).split('\n')
    expect(landed).toHaveLength(1)
    const lastMerged = git(entry.root, 'merge-base', entry.commit, entry.mainAt)
    expect(git(entry.root, 'rev-list', `${lastMerged}..${entry.mainAt}`).split('\n')).not.toContain(landed[0])
    // THE CLEAN COPY DROPPED THE FIRST COMMIT, so the resolution's commits and the entry's do not pair by count.
    expect(commitsOf(entry).map((one) => git(entry.into, 'log', '-1', '--format=%s', one))).toEqual(['Synthetic entry: a second commit', 'Synthetic entry: a third commit'])
    const run = await aCheckRun(entry)
    expect(run.code, run.out + run.err).toBe(0)
    expect(stepsOf(entry)).toEqual([{
      step: 'resolution-checked',
      facts: {
        commit: resolved,
        ok: true,
        ref: `refs/mole-office/resolved/${entry.id}`,
        places: [
          // The blame of main's line at the first place finds main's commit that wrote it, before the branch's first merge
          // of main. The check counts main's commits from the point where the entry left main, so it names that commit.
          { ...aPlace(entry, CODE, first!, null, ["export const SAID = 'main'"]), mainCommits: landed, mainBy: 'lines' },
          aPlace(entry, FURTHER[0]!, entry.commit, resolved, ["export const SAID = 'main'", "export const SAID = 'the entry'"]),
        ],
      },
    }])
    expect(git(entry.root, 'rev-parse', `refs/mole-office/resolved/${entry.id}`)).toBe(resolved)
    expect(entry.state).toBe('pinned')
  }, 180_000)

  // MUTATION PROOF (after a green control): count the file's commits from the merge base again, as before round 130.
  // This case goes red: the place names no commit of main.
  it("names main's commit to the file where main's side has no line, on a branch that merged main after that commit", async () => {
    const entry = anEntryThatMergedMainsRemoval('synthMergedMainsRemoval')
    const [first] = git(entry.root, 'rev-list', '--reverse', '--no-merges', `${entry.mainAt}..${entry.commit}`).split('\n')
    const removed = git(entry.root, 'log', '--format=%H', '--fixed-strings', `--grep=${MAINS_REMOVAL}`, entry.mainAt).split('\n')
    expect(removed).toHaveLength(1)
    // FROM THE MERGE BASE, main made no commit to the code file: the merge base is past the commit that removed the line.
    const lastMerged = git(entry.root, 'merge-base', entry.commit, entry.mainAt)
    expect(git(entry.root, 'log', '--format=%H', `${lastMerged}..${entry.mainAt}`, '--', CODE)).toBe('')
    const run = await aCheckRun(entry)
    expect(run.code, run.out + run.err).toBe(0)
    const steps = stepsOf(entry) as { step: string; facts: { ok: boolean; places: Record<string, unknown>[] } }[]
    expect(steps.map((one) => [one.step, one.facts.ok]), JSON.stringify(steps)).toEqual([['resolution-checked', true]])
    const [place] = steps[0]!.facts.places
    expect(place).toMatchObject({
      path: CODE,
      entryCommit: first,
      resolvedIn: null,
      main: { lines: [], more: 0 },
      entry: { lines: ["export const SAID = 'the entry'"], more: 0 },
      mainCommits: removed,
      mainBy: 'file',
    })
    expect(entry.state).toBe('pinned')
  }, 180_000)

  it("refuses a resolution that keeps the emptied commit, which git's own replay drops", async () => {
    const entry = anEntryMainAlreadyHolds('synthEmptiedKept', {
      fromTheStop: (into) => {
        write(into, CODE, code(MAIN)); git(into, 'add', '--', CODE)
        git(into, 'commit', '-q', '--allow-empty', '-C', 'REBASE_HEAD')
        git(into, 'rebase', '--continue')
      },
    })
    const [kept] = commitsOf(entry)
    expect(commitsOf(entry)).toHaveLength(2)
    await itIsRefused(entry, `The resolution keeps the entry's commit ${twelve(firstOf(entry))} as its commit ${twelve(kept!)}, which has the tree the replay had before that commit. Git's own replay drops such a commit, as the clean copy does. Hand the resolution over without it.`)
  }, 180_000)

  it('refuses a stop whose commit the resolution does not hold, and names both', async () => {
    // THE SUPERVISOR SKIPPED THE COMMIT, and so dropped the file it adds as well.
    const entry = anEntryMainAlreadyHolds('synthNotHeld', { firstAdds: true, fromTheStop: (into) => git(into, 'rebase', '--skip') })
    await itIsRefused(
      entry,
      `The resolution ${twelve(entry.resolution!.commit)} holds no commit with the message of the entry's commit ${twelve(firstOf(entry))}, where the replay stopped. ` +
        `With main's side taken in each place, that commit still changes ${FIRST_ADDS}, so git's own replay keeps it.`,
    )
  }, 180_000)

  it('refuses a stop at one of two commits of the entry with the same message', async () => {
    const twice = 'Synthetic entry: one message, twice'
    const entry = anEntryMainAlreadyHolds('synthSameInTheEntry', { messages: [twice, twice], fromTheStop: keepBoth })
    await itIsRefused(entry, `The entry's commits ${twelve(firstOf(entry))} and ${twelve(entry.commit)} carry the same message, so the check cannot tell which commit of the resolution resolves the stop at ${twelve(firstOf(entry))}.`)
  }, 180_000)

  it("refuses a stop whose message two commits of the resolution carry", async () => {
    const entry = anEntryMainAlreadyHolds('synthSameInTheResolution', {
      fromTheStop: (into) => {
        keepBoth(into)
        git(into, 'commit', '-q', '--allow-empty', '-m', 'Synthetic entry: the line main already changed')
      },
    })
    const [kept, , more] = commitsOf(entry)
    await itIsRefused(entry, `The resolution's commits ${twelve(kept!)} and ${twelve(more!)} carry the message of the entry's commit ${twelve(firstOf(entry))}, where the replay stopped, so the check cannot tell which of them resolves it.`)
  }, 180_000)
})

describe('a check run, at a stop about a whole file', () => {
  const twelve = (commit: string) => commit.slice(0, 12)
  const RENAMED = `${ANCESTORS_NAME} was renamed to ${MAINS_NAME} on main and to ${ENTRYS_NAME} by the entry. Main's name stands, so the entry's changes go into ${MAINS_NAME}, and ${ENTRYS_NAME} is not kept.`
  const THE_THREE_NAMES = [ANCESTORS_NAME, ENTRYS_NAME, MAINS_NAME]
  const renamedOnBothSides = () => [renamedTo(MAINS_NAME, { 1: MAINS_LINE }), renamedTo(ENTRYS_NAME, { 1: ENTRYS_LINE, 10: ENTRYS_LAST })] as const
  /** The resolution of the rename in main's file: both sides of the place at line 1, and the entry's last line. */
  const inMainsFile = numbered({ 1: `${MAINS_LINE}\n${ENTRYS_LINE}`, 10: ENTRYS_LAST })
  /** The one place the check hands on, with its four sides, where main's commit wrote main's line. */
  const thePlace = (entry: Entry, path: string, at: number, sides: { ancestor: string[]; main: string[]; entry: string[] }) => ({
    path,
    at,
    entryCommit: entry.commit,
    resolvedIn: entry.resolution!.commit,
    ancestor: { lines: sides.ancestor, more: 0 },
    main: { lines: sides.main, more: 0 },
    entry: { lines: sides.entry, more: 0 },
    resolution: { lines: [...sides.main, ...sides.entry], more: 0 },
    mainCommits: [entry.mainAt],
    mainBy: 'lines',
  })
  async function itPasses(entry: Entry, places: unknown[]): Promise<void> {
    const run = await aCheckRun(entry)
    expect(run.code, run.out + run.err).toBe(0)
    expect(stepsOf(entry)).toEqual([{ step: 'resolution-checked', facts: { commit: entry.resolution!.commit, ok: true, ref: `refs/mole-office/resolved/${entry.id}`, places } }])
    expect(entry.state).toBe('pinned')
  }

  it("passes the same file renamed differently on each side, resolved under main's name, and hands on the place in main's file", async () => {
    const entry = aWholeFileEntry('synthWholeRenamed', ...renamedOnBothSides(), THE_THREE_NAMES, (into) => {
      git(into, 'rm', '-q', '--', ANCESTORS_NAME, ENTRYS_NAME)
      write(into, MAINS_NAME, inMainsFile); git(into, 'add', '--', MAINS_NAME)
    })
    await itPasses(entry, [thePlace(entry, MAINS_NAME, 1, { ancestor: [NUMBERED[0]!], main: [MAINS_LINE], entry: [ENTRYS_LINE] })])
  }, 180_000)

  it("refuses a resolution of that rename that keeps the entry's name as well", async () => {
    const entry = aWholeFileEntry('synthWholeBothNames', ...renamedOnBothSides(), THE_THREE_NAMES, (into) => {
      git(into, 'rm', '-q', '--', ANCESTORS_NAME)
      for (const path of [MAINS_NAME, ENTRYS_NAME]) write(into, path, inMainsFile)
      git(into, 'add', '--', MAINS_NAME, ENTRYS_NAME)
    })
    await itIsRefused(entry, `${RENAMED} The resolution's commit ${twelve(entry.resolution!.commit)} still holds ${ENTRYS_NAME}.`)
  }, 180_000)

  // MAIN ONLY RENAMED THE FILE, as the queue renumbers one, and the entry renamed it and changed its last line, so the
  // three-way merge of the three files has no place.
  const renamedApart = () => [renamedTo(MAINS_NAME, {}), renamedTo(ENTRYS_NAME, { 10: ENTRYS_LAST })] as const
  const resolvedApart = (inMains: string) => (into: string) => {
    git(into, 'rm', '-q', '--', ANCESTORS_NAME, ENTRYS_NAME)
    write(into, MAINS_NAME, inMains); git(into, 'add', '--', MAINS_NAME)
  }

  it("passes that rename where the two sides' changes do not meet, resolved as their merge stands, with no place to hand on", async () => {
    const entry = aWholeFileEntry('synthWholeRenamedApart', ...renamedApart(), THE_THREE_NAMES, resolvedApart(numbered({ 10: ENTRYS_LAST })))
    await itPasses(entry, [])
  }, 180_000)

  it('refuses a resolution of that rename that changes a line the merge did not leave in a place', async () => {
    const entry = aWholeFileEntry('synthWholeApartChanged', ...renamedApart(), THE_THREE_NAMES, resolvedApart(numbered({ 5: 'Synthetic line, changed outside every place.', 10: ENTRYS_LAST })))
    await itIsRefused(entry, `${MAINS_NAME} as resolved is not the three-way merge of its three sides, which has no place to resolve. That is a change outside the places git left in conflict.`)
  }, 180_000)

  it("refuses a resolution of a file deleted on main and changed by the entry, with the cannot, even one that keeps the entry's file", async () => {
    const entry = aWholeFileEntry('synthWholeDeleted', deletedThere, changedThere({ 2: ENTRYS_LINE }), [ANCESTORS_NAME], (into) => git(into, 'add', '--', ANCESTORS_NAME))
    await itIsRefused(entry, `${ANCESTORS_NAME} was deleted on main and changed by the entry, and keeping both would change what one side meant, so the entry has to be cut again from current main.`)
  }, 180_000)

  it('passes a file renamed on main and changed by the entry, resolved in the renamed file, with its place', async () => {
    const entry = aWholeFileEntry('synthWholeRenamedChanged', renamedTo(MAINS_NAME, { 2: MAINS_LINE }), changedThere({ 2: ENTRYS_LINE }), [MAINS_NAME], (into) => {
      write(into, MAINS_NAME, numbered({ 2: `${MAINS_LINE}\n${ENTRYS_LINE}` })); git(into, 'add', '--', MAINS_NAME)
    })
    await itPasses(entry, [thePlace(entry, MAINS_NAME, 2, { ancestor: [NUMBERED[1]!], main: [MAINS_LINE], entry: [ENTRYS_LINE] })])
  }, 180_000)

  it('passes a file added on both sides, resolved by keeping both, with its place', async () => {
    const entry = aWholeFileEntry('synthWholeAdded', addedThere('Synthetic: added on main.\n'), addedThere('Synthetic: added by the entry.\n'), [ADDED], (into) => {
      write(into, ADDED, 'Synthetic: added on main.\nSynthetic: added by the entry.\n'); git(into, 'add', '--', ADDED)
    })
    await itPasses(entry, [thePlace(entry, ADDED, 1, { ancestor: [], main: ['Synthetic: added on main.'], entry: ['Synthetic: added by the entry.'] })])
  }, 180_000)
})

describe('a check run, at a stop that renamed a migration differently on each side', () => {
  const twelve = (commit: string) => commit.slice(0, 12)
  /** The refusal of a change outside the paths left in conflict, as it stood before this round. */
  const outside = (entry: Entry) => `At the entry's commit ${twelve(entry.commit)}, the resolution's commit ${twelve(entry.resolution!.commit)} differs from git's own result outside the paths left in conflict, in ${NAMING}.`
  const ALLOWED = `Outside those paths the only change allowed is the queue's renumbering of the lines the entry wrote: 0306_${MIGRATION} -> 0309_${MIGRATION}.`

  it("passes a file git merged with no conflict whose lines the entry wrote take main's number, and nothing else", async () => {
    const entry = aRenumberedEntry('synthRenumbered', naming(', as main has it', IN_MAINS_NUMBERS))
    const run = await aCheckRun(entry)
    expect(run.code, run.out + run.err).toBe(0)
    expect(stepsOf(entry)).toEqual([{ step: 'resolution-checked', facts: { commit: entry.resolution!.commit, ok: true, ref: `refs/mole-office/resolved/${entry.id}`, places: [] } }])
    expect(entry.state).toBe('pinned')
  }, 180_000)

  it('refuses a resolution that renumbers a line main already holds as well', async () => {
    const entry = aRenumberedEntry('synthRenumberedMains', naming(', as main has it', IN_MAINS_NUMBERS, '0309'))
    await itIsRefused(entry, `${outside(entry)} ${ALLOWED}`)
  }, 180_000)

  it("refuses a resolution that renumbers a file where the rule cannot read one of the entry's lines", async () => {
    const cut = '// Synthetic: 0306_synthetic_cat stops inside a word.'
    // THE ENTRY'S FIRST LINE TAKES MAIN'S NUMBER, as the rule would give it, and the line the rule cannot read is kept.
    const entry = aRenumberedEntry('synthRenumberedCut', naming(', as main has it', [IN_MAINS_NUMBERS[0], cut]), [THE_ENTRYS_LINES[0], cut])
    await itIsRefused(entry, `${outside(entry)} ${ALLOWED} In ${NAMING} that renumbering refuses: Line 5 of ${NAMING} writes \`0306_synthetic_cat\`, which stops inside a word of migration 0306_${MIGRATION}, so whether it names that migration cannot be told, and it was not renumbered.`)
  }, 180_000)

  it('refuses the same change where the file renamed on each side is not a migration', async () => {
    const entry = aRenumberedEntry('synthRenumberedNotAMigration', naming(', as main has it', IN_MAINS_NUMBERS), THE_ENTRYS_LINES, NOT_A_MIGRATION)
    await itIsRefused(entry, outside(entry))
  }, 180_000)
})

describe('a check run of an entry whose resolution does not wait for its check', () => {
  it('asks the office for the entry and the end of the run only, and runs no git', async () => {
    const refused = aResolvingEntry('synthCheckRefusedAlready')
    refused.resolution = { ...refused.resolution!, refused: { at: new Date().toISOString(), says: 'Synthetic: an earlier check refused it.' } }
    const none = aResolvingEntry('synthCheckNoResolution')
    none.resolution = null
    for (const [entry, found] of [[refused, 'resolving with a resolution the check already refused'], [none, 'resolving with no resolution handed over']] as const) {
      const run = await aCheckRun(entry)
      expect(run.code, run.out + run.err).toBe(0)
      expect(endingOf(run)).toEqual({ ok: true, says: `The merge tool finished: this run only checks a resolution that waits for its check, and merge entry ${entry.id} is ${found}, so it did nothing.` })
      expect(entry.asked.map((one) => `${one.method} ${one.url.replace(entry.id, 'E')}`)).toEqual(['GET /api/merge-queue/E', 'POST /api/merge-queue/E/tool-ended'])
      expect(gitCallsOf(entry.id)).toEqual([])
    }
  }, 360_000)
})
