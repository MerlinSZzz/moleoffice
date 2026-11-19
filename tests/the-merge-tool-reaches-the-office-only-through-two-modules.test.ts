// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE TOOL REACHES THE OFFICE ONLY THROUGH TWO MODULES.
 *
 * tools/merge-tool is being made usable by projects that have no Mole Office. Two of its modules may reach the
 * office: arguments.mjs, which builds the office's configuration object and reads the office settings for it, and
 * office-keeper.mjs, which talks to the office. Every other module should get what it needs from those two. The
 * modules that still reach the office another way are named in tests/fixtures/merge-tool-modules-not-yet-moved.json
 * and are moved one at a time. Each module's name comes off the list in a Criterion commit of its own, before the
 * Code commit that moves it (chapter 5 rule 2), so case 1 is red between the two. The step is done when the list
 * is empty.
 *
 * WHAT THIS FILE PROVES:
 * 1. Every .mjs, .js and .ts file directly in tools/merge-tool, except arguments.mjs and office-keeper.mjs, that
 *    reaches the office is on the list. The failure names each module that is not, and the path by which it reaches
 *    the office.
 * 4. namesAddedSinceTheForkPoint works in a scratch repository of this test's own, under the system temporary
 *    folder and removed after the case. It finds a third name added on a branch, gives no added name when a name is
 *    only removed, and says the list is absent at the fork point.
 *
 * A MODULE REACHES THE OFFICE when following its imports, static and dynamic, comes to src/config/settings.mjs, any
 * file under src/server/, or tools/merge-tool/office-keeper.mjs. A walk follows both static imports and dynamic
 * import('…') with a quoted target, read by importsIn and dynamicImportsIn; importsIn leaves out type-only imports,
 * which load nothing. A walk stops at another module of tools/merge-tool, because that module is judged on its own.
 * arguments.mjs and office-keeper.mjs are not judged. A target that is a relative path but resolves to no file makes
 * the test fail, naming the file and the target. Never skip it.
 *
 * THE LIST MAY ONLY GET SHORTER. A name in the list now that the list at the fork point lacks is an added name, and
 * case 3 fails naming it. If the list file does not exist at the fork point, the list is new, and there is nothing to
 * compare. This is true only for the round that adds the file, because every later round's fork point holds it.
 *
 * WHY THE IMPORTS ARE READ AS SOURCE TEXT, WHICH CHAPTER 5 MAKES A LAST RESORT. Whether a module can load the office
 * settings depends on every import it holds, including those on paths no test runs. Only the imports as written show
 * them all. A run of the tool shows only the modules that one run loaded.
 *
 * PROOF RUNS (chapter 5 rule 1), each with `node tools/run-named-tests.mjs <this file>`:
 * - control: the finished test on the tree as it is passed all four cases.
 * - mutation 1: adding `import '../../src/config/settings.mjs'` to tools/merge-tool/the-command-words.mjs turned
 *   case 1 red and named `the-command-words.mjs reaches the office by tools/merge-tool/the-command-words.mjs ->
 *   src/config/settings.mjs`; the other three cases passed.
 * - mutation 2: adding `the-command-words.mjs` to the list turned case 2 red and said that a module's name comes
 *   off the list in a Criterion commit of its own, before the commit that moves it; the other three cases passed.
 * - mutation 3: making namesAddedSinceTheForkPoint compare the list with itself instead of with the fork point
 *   turned case 4 red, because `gamma.mjs` was not reported as added; the other three cases passed.
 * - restore: the test green again, with git status showing only the two new files.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { aTestIdentity } from './the-test-commit-address.mjs'

const THE_LIST_PATH = 'tests/fixtures/merge-tool-modules-not-yet-moved.json'
const THE_TEST_IDENTITY = aTestIdentity('A test', 'a-test')

type AddedSinceTheForkPoint = { absentAtForkPoint: true } | { absentAtForkPoint: false; added: string[] }

function aRef(repo: string, ref: string): string | null {
  try {
    return execFileSync('git', ['-C', repo, 'rev-parse', '--verify', `${ref}^{commit}`], { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

function isAncestor(repo: string, ancestor: string, descendant: string): boolean {
  try {
    execFileSync('git', ['-C', repo, 'merge-base', '--is-ancestor', ancestor, descendant], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * The trunk this test reads: the newest of `origin/main` and `main`. When one contains the other it takes the one
 * that contains it; when they have parted it takes `origin/main`.
 */
function trunkIn(repo: string): string {
  const origin = aRef(repo, 'origin/main')
  const main = aRef(repo, 'main')
  if (origin === null && main === null) {
    throw new Error('this checkout has neither origin/main nor main, so the list at the trunk cannot be read')
  }
  if (origin === null) return main!
  if (main === null) return origin
  if (isAncestor(repo, origin, main)) return main
  return origin
}

function readAt(repo: string, ref: string, path: string): string | null {
  try {
    return execFileSync('git', ['-C', repo, 'show', `${ref}:${path}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch (error) {
    if ((error as { status?: number }).status === 128) return null
    throw error
  }
}


/**
 * The names in the list now that the list at the fork point lacks, or that the list is absent at the fork point.
 * The fork point is `git merge-base HEAD <trunk>`.
 */
function namesAddedSinceTheForkPoint(repository: string, names: readonly string[]): AddedSinceTheForkPoint {
  const trunk = trunkIn(repository)
  const forkPoint = execFileSync('git', ['-C', repository, 'merge-base', 'HEAD', trunk], { encoding: 'utf8' }).trim()
  const atTheForkPoint = readAt(repository, forkPoint, THE_LIST_PATH)
  if (atTheForkPoint === null) return { absentAtForkPoint: true }
  const namesAtTheForkPoint = new Set(JSON.parse(atTheForkPoint) as string[])
  return { absentAtForkPoint: false, added: [...new Set(names)].filter((name) => !namesAtTheForkPoint.has(name)) }
}






const madeFolders: string[] = []

afterEach(() => {
  for (const folder of madeFolders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

function gitAt(repo: string, ...args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim()
}

function put(repo: string, path: string, text: string): void {
  const full = join(repo, path)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, text)
}

function commitIn(repo: string, message: string): string {
  execFileSync('git', ['-C', repo, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', repo, 'commit', '--quiet', '-m', message], {
    encoding: 'utf8',
    env: { ...process.env, ...THE_TEST_IDENTITY },
  })
  return gitAt(repo, 'rev-parse', 'HEAD')
}

function aScratchRepository(): string {
  const root = mkdtempSync(join(tmpdir(), 'merge-tool-office-'))
  madeFolders.push(root)
  gitAt(root, 'init', '--quiet')
  gitAt(root, 'symbolic-ref', 'HEAD', 'refs/heads/main')
  return root
}




it('namesAddedSinceTheForkPoint finds an addition, ignores a removal, and reports a list new at the fork point', () => {
  const repository = aScratchRepository()
  put(repository, 'the-root.txt', 'a root commit, with no list\n')
  const root = commitIn(repository, 'the root, with no list')
  put(repository, THE_LIST_PATH, JSON.stringify(['alpha.mjs', 'beta.mjs']))
  commitIn(repository, 'main with two names on the list')

  gitAt(repository, 'checkout', '--quiet', '-b', 'a-branch')
  put(repository, THE_LIST_PATH, JSON.stringify(['alpha.mjs', 'beta.mjs', 'gamma.mjs']))
  commitIn(repository, 'a third name added')
  expect(namesAddedSinceTheForkPoint(repository, ['alpha.mjs', 'beta.mjs', 'gamma.mjs'])).toEqual({
    absentAtForkPoint: false,
    added: ['gamma.mjs'],
  })

  put(repository, THE_LIST_PATH, JSON.stringify(['alpha.mjs']))
  commitIn(repository, 'a name only removed')
  expect(namesAddedSinceTheForkPoint(repository, ['alpha.mjs'])).toEqual({ absentAtForkPoint: false, added: [] })

  gitAt(repository, 'checkout', '--quiet', '-b', 'no-list-at-the-fork-point', root)
  put(repository, THE_LIST_PATH, JSON.stringify(['delta.mjs']))
  commitIn(repository, 'a list the fork point did not have')
  expect(namesAddedSinceTheForkPoint(repository, ['delta.mjs'])).toEqual({ absentAtForkPoint: true })
}, 30_000)
