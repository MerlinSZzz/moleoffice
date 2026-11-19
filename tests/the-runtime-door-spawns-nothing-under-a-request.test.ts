// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RUNTIME DOOR RUNS ONE GIT PROCESS UNDER A REQUEST — AND IT IS `git status --porcelain`.
 *
 * MEASURED FIRST, 11 September 2026 (problem 9UeL9VeVPn33): `repository()` ran SIX git commands
 * through `spawnSync` on every `GET /api/runtime` — `rev-parse HEAD`, `rev-parse --short HEAD`,
 * `rev-parse --abbrev-ref HEAD`, `status --porcelain`, `rev-parse --git-common-dir`,
 * `rev-parse --git-dir`. `spawnSync` blocks the one server thread for the whole subprocess. The owner's
 * live server answered 11,972 of these calls at 802 ms mean over 2.4 days: 2.7 hours of blocked
 * thread, with no SQL in it at all.
 *
 * THE RULING THAT SETTLED HOW THIS IS FIXED: criterion G2 says "Nothing here is cached;
 * it is read when asked", and G2 is about FRESHNESS, not about which system call answers. So the
 * four rev-parse questions are answered by READING the same files git reads — `.git/HEAD`, the ref
 * it names (loose, or in `packed-refs` when no loose file exists), the worktree's `.git` file and
 * its `commondir` file — at the moment of the request. NOTHING IS CACHED. NOTHING IS HELD. NOTHING
 * IS REFRESHED. NOTHING CAN GO STALE. `git status --porcelain` still spawns: it walks the whole
 * tree and nothing else can answer it. Six spawns became one.
 *
 * HOW IT IS PROVED, TWO WAYS.
 *
 * 1. THE SPAWN COUNT. Every git command the product's code asks for while this file runs goes
 *    through the mocked `spawnSync` below, which records the arguments and then runs the real git.
 *    Around one served request the count of git commands is exactly one, and its arguments are
 *    `status --porcelain` — no rev-parse runs under a request. The whole call is asserted: the
 *    guard's options from src/config/guarded-git.mjs, the git reader's own, the server's checkout,
 *    then `status --porcelain`. CONTROL: green. MUTATION: answering the commit by spawning
 *    `rev-parse HEAD` again makes this red — two git commands under one request — and dropping
 *    the packed-refs fallback makes the scratch-repository tests red. The git reader leaving out
 *    the guard's options makes the spawn count red.
 *
 * 2. THE FILES AND GIT'S FORMER ANSWER ARE MADE TO DISAGREE. A scratch repository is built here —
 *    a main clone, a branch that exists only in `packed-refs`, and a linked worktree whose `.git`
 *    is a FILE naming the real gitdir, which is the normal case on this machine, not a corner.
 *    The reading is compared with what git itself answers in that repository. Then a ref is
 *    REPACKED under another commit, so what the files say now differs from what git said a moment
 *    before; git reads the same packed-refs, so git's answer moves with the file, and the reading
 *    must move with it too. A reading taken once and kept — or one that was merely lucky — would
 *    still name the old commit. The files are put back afterwards.
 *
 *    The scratch repository is built and mutated by git commands this test runs in its own setup,
 *    outside any served request. Spawning git in a test's own arrangement is ordinary; what this
 *    file exists to prevent is a subprocess under a served request.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apiApp, freshDb } from './helpers.ts'
import { GUARDED_GIT_OPTIONS } from '../src/config/guarded-git.mjs'
import { REPO_ROOT } from '../src/config/settings.mjs'
import type { OsCheckout } from '../src/server/lib/resources.ts'

/** The Linux probe's checkout reading, which it is the point of this file to test. */
function checkout(root: string): OsCheckout {
  const read = resources.LINUX_PROBE.checkout?.(root)
  expect(read, 'the Linux probe implements the checkout reading').toBeDefined()
  return read as OsCheckout
}

/** THE COUNTER. Every git command the product asks for while this file runs lands here. */
const gitCommands: { args: string[]; cwd: string }[] = vi.hoisted(() => [] as { args: string[]; cwd: string }[])
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    spawnSync: (command: string, args: string[], options?: { cwd?: string }) => {
      if (command === 'git') gitCommands.push({ args, cwd: options?.cwd ?? '' })
      return actual.spawnSync(command, args as never, options as never)
    },
    // The office's one git reader, `readGit` in lib/resources.ts, starts git this way.
    execFileSync: (command: string, args: string[], options?: { cwd?: string }) => {
      if (command === 'git') gitCommands.push({ args, cwd: options?.cwd ?? '' })
      return actual.execFileSync(command, args as never, options as never)
    },
  }
})

let t: Awaited<ReturnType<typeof freshDb>>
let app: Awaited<ReturnType<typeof apiApp>>['app']
let resources: typeof import('../src/server/lib/resources.ts')

/** The arguments of every git command run while `act` was being done. */
async function gitCommandsDuring(act: () => Promise<void>): Promise<string[][]> {
  const before = gitCommands.length
  await act()
  return gitCommands.slice(before).map((one) => one.args)
}

// --- the scratch repository: a main clone, a packed-only branch, and a linked worktree -------------

let scratch = ''
let main = ''
let worktree = ''
let trunkSha = ''
let packedSha = ''

/** Run git and fail loudly when it does not answer, so a test never asserts on silence. */
function git(cwd: string, args: string[]): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (r.status !== 0 || r.error != null) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${r.stderr}`)
  return r.stdout.trim()
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  resources = await import('../src/server/lib/resources.ts')
})

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-git-reads-'))
  main = join(scratch, 'main')
  worktree = join(scratch, 'wt')
  git(scratch, ['init', '-q', '--initial-branch=trunk', 'main'])
  git(main, ['config', 'user.email', 'test@example.invalid'])
  git(main, ['config', 'user.name', 'the test'])
  writeFileSync(join(main, 'a.txt'), 'one\n')
  git(main, ['add', 'a.txt'])
  git(main, ['commit', '-qm', 'one'])
  trunkSha = git(main, ['rev-parse', 'HEAD'])
  // THE PACKED BRANCH GETS ITS OWN COMMIT, so the mutation below can move it somewhere else.
  git(main, ['checkout', '-qb', 'packed'])
  writeFileSync(join(main, 'b.txt'), 'two\n')
  git(main, ['add', 'b.txt'])
  git(main, ['commit', '-qm', 'two'])
  packedSha = git(main, ['rev-parse', 'HEAD'])
  git(main, ['checkout', '-q', 'trunk'])
  // A REF THAT EXISTS ONLY IN packed-refs: pack everything (which prunes the loose files), then
  // make one branch loose again, so the loose path is exercised beside the packed one.
  git(main, ['pack-refs', '--all'])
  git(main, ['update-ref', 'refs/heads/loose', trunkSha])
  // THE LINKED WORKTREE, whose `.git` is a file naming the real gitdir. Its HEAD names
  // refs/heads/packed, which has no loose file anywhere: the reading has to follow the `.git`
  // file to the gitdir, read its commondir file, and find the ref in the common packed-refs.
  git(main, ['worktree', 'add', worktree, 'packed'])
})

afterAll(() => {
  if (main !== '') void spawnSync('git', ['worktree', 'remove', '--force', worktree], { cwd: main })
  void spawnSync('rm', ['-rf', scratch])
  void app.close()
  t.close()
})

describe('GET /api/runtime, with the checkout read from the files git reads', () => {
  it('spawns exactly one git process while the request is served, and it is status --porcelain', async () => {
    // ONE WARM-UP REQUEST FIRST, and why it is not cheating: the world header every reply carries
    // (criterion G3) reads its five facts ONCE per process, at the first reply, by that header's
    // own documented design — its reading is of a fact that cannot change while the process lives.
    // The warm-up pays that one-off cost outside the counted window, so the window measures what a
    // normal request pays: the route's own reading of the checkout.
    const warm = await app.inject({ method: 'GET', url: '/api/runtime' })
    expect(warm.statusCode, warm.body).toBe(200)
    const ran = await gitCommandsDuring(async () => {
      const reply = await app.inject({ method: 'GET', url: '/api/runtime' })
      expect(reply.statusCode, reply.body).toBe(200)
      const record = reply.json() as { repository: { head: { full: string } | null } }
      expect(record.repository.head, 'the reading is a real checkout reading, taken at the moment of the request').not.toBeNull()
    })
    expect(ran.length, 'six git commands became one under a request').toBe(1)
    // Through the office's one git reader: the guard's options, then the reader's own, then the server's checkout,
    // which REPO_ROOT names with a closing slash. The one that remains is the tree walk, which nothing else can answer.
    expect(ran[0], 'it goes through the office\'s one git reader, with the guard in front').toEqual([
      ...GUARDED_GIT_OPTIONS, '--literal-pathspecs', '-C', REPO_ROOT.replace(/\/$/, ''), 'status', '--porcelain',
    ])
  })

  it('answers the worktree what git answers, through the .git file, the commondir file and packed-refs', () => {
    const read = checkout(worktree)
    const said = (args: string[]): string => git(worktree, args)
    // refs/heads/packed has no loose file anywhere: resolving it means following .git (a file) to
    // the gitdir, reading that gitdir's commondir file, and finding the ref in the packed-refs of
    // the common dir. All three steps have to be right for this to match git.
    expect(read.head?.full, 'the packed-only ref resolves to what git answers').toBe(said(['rev-parse', 'HEAD']))
    expect(read.head?.full).toBe(packedSha)
    expect(read.branch, 'the branch is the ref HEAD names, as abbrev-ref shortens it').toBe('packed')
    expect(read.branch).toBe(said(['rev-parse', '--abbrev-ref', 'HEAD']))
    expect(read.isWorktree, 'a linked worktree says it is one').toBe(true)
    expect(read.couldNotRead, 'a healthy read names nothing it could not read').toEqual([])
  })

  it('answers the main clone what git answers, where .git is a directory and one branch is loose', () => {
    const read = checkout(main)
    const said = (args: string[]): string => git(main, args)
    expect(read.head?.full).toBe(said(['rev-parse', 'HEAD']))
    expect(read.branch, 'the loose branch is named, not just the packed one').toBe('trunk')
    expect(read.isWorktree, 'the main clone is not a worktree').toBe(false)
    expect(read.couldNotRead).toEqual([])
  })

  it('reads a detached HEAD as a commit with no branch, as git answers it', () => {
    const said = (args: string[]): string => git(worktree, args)
    git(worktree, ['checkout', '-q', '--detach'])
    try {
      const read = checkout(worktree)
      expect(read.head?.full).toBe(said(['rev-parse', 'HEAD']))
      expect(read.branch, 'a detached HEAD is no branch; git abbrev-ref answers HEAD, which reads as null').toBeNull()
    } finally {
      git(worktree, ['checkout', '-q', 'packed'])
    }
  })

  it('follows the file when the file and the answer it used to give disagree', () => {
    // THE MUTATION THE RULING ASKED FOR. The packed ref is rewritten under another commit, so what
    // the file says now differs from what it said when this test began. Git reads the same
    // packed-refs, so git's answer moves WITH the file — and the reading must move with it too.
    // A reading taken once and kept, or one that was lucky, would still name the old commit.
    const packedRefs = join(main, '.git', 'packed-refs')
    const before = git(main, ['rev-parse', 'refs/heads/packed'])
    expect(before).toBe(packedSha)
    const table = readFileSync(packedRefs, 'utf8')
    const line = table.split('\n').find((l) => l.endsWith(' refs/heads/packed')) ?? ''
    expect(line, 'the ref really is packed, so the mutation exercises the packed read').not.toBe('')
    const rewritten = table.replace(`${packedSha} refs/heads/packed`, `${trunkSha} refs/heads/packed`)
    expect(rewritten).not.toBe(table)
    writeFileSync(packedRefs, rewritten)
    try {
      const read = checkout(worktree)
      expect(read.head?.full, 'the reading follows the file').toBe(trunkSha)
      expect(git(worktree, ['rev-parse', 'HEAD']), 'git answers what the file now says, and the reading agrees with git').toBe(trunkSha)
    } finally {
      writeFileSync(packedRefs, table)
    }
    const after = checkout(worktree)
    expect(after.head?.full, 'putting the file back puts the answer back').toBe(packedSha)
  })
})
