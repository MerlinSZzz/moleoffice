// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHOSE TEST FILE IS THIS. The one way to answer it, so two waves do not each work it out their own way.
 *
 * THE RULE. A file's owner is whoever made the most commits to it since 20 September 2026, following
 * renames. Merge commits are left out, whoever made them. In a tie, the owner is the one among the tied whose newest commit to the file is
 * the newest. A wave's supervisor and its workers count as the wave (wave-13j-supervisor and w13j-... are
 * 13j); the commit authors named by MOLE_OFFICE_OPERATIONS_LIST_KEEPERS count as the operations agent. Anyone
 * else counts under their own name: a worker whose handle does not start with its wave is not guessed into a wave.
 *
 * WHAT THE RULE DECIDES, AND WHAT IT DOES NOT (decision HPk0z-rMb0nA, 5 October 2026). It decides only
 * where a file that is on no list goes when it is first listed, at that moment. A file already on a list
 * stays on that list, whoever makes later commits to it; an owner printed here that differs from the
 * file's list is not a reason to move the file.
 *
 * WHAT IT PRINTS, one line for each file: the file, its owner, the list the owner keeps (13j keeps
 * tests/moved/13j.txt, the operations agent keeps tests/moved/operations.txt), the list the file is on now, and the
 * commits counted for each owner. It reads the lists through theListings in tests/the-moved-test-files.ts.
 *
 * RUN IT from the repository:
 *   node tests/moved/whose-file.ts                       every test file
 *   node tests/moved/whose-file.ts tests/nothing-from-a-sandbox-is-the-person.test.ts   only the files named
 *
 * Wave 13v wrote the rule as a script for its round 1 (report WlHM0a3-J-ue). This is that rule, kept beside
 * the lists, with renames followed and every merge left out as was settled on 4 October 2026
 * (message 9xugsFYBubIk). The test that proved it on a made-up history was deleted on 12 November 2026.
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'

import { operationsListKeepers } from '../../src/config/settings.mjs'
import { theListings } from '../the-moved-test-files.ts'

const REPO = fileURLToPath(new URL('../..', import.meta.url))

/** Commits before this day are not counted. */
export const COUNTED_SINCE = '2026-09-20'

/** The line that says the setting named nobody. */
export const NO_OPERATIONS_KEEPERS =
  "MOLE_OFFICE_OPERATIONS_LIST_KEEPERS names nobody, so the operations list's keepers were counted under their own names."

/** Who a commit's author counts as. The keepers are the commit author names the setting gives, and a test hands them in. */
export function whoAnAuthorCountsAs(author: string, keepers: readonly string[]): string {
  if (keepers.includes(author)) return 'operations'
  const wave = /^wave-(13[a-z])-supervisor$/.exec(author) ?? /^w(13[a-z])-/.exec(author)
  if (wave) return wave[1] ?? author
  return author
}

/** The list an owner keeps, or null for an owner that keeps none. */
export function theListAnOwnerKeeps(owner: string): string | null {
  if (owner === 'operations') return 'tests/moved/operations.txt'
  if (/^13[a-z]$/.test(owner)) return `tests/moved/${owner}.txt`
  return null
}

export type WhoseFile = {
  file: string
  /** null when nobody has committed to it since COUNTED_SINCE. */
  owner: string | null
  ownersList: string | null
  /** The list the file is on now, or null for none. */
  onList: string | null
  commits: Record<string, number>
}

/**
 * Every counted commit to each file under tests/: who it counts as, and when it was committed.
 *
 * The log is newest first and follows renames (-M), so a commit to a file's old name counts for the name
 * it has now. --diff-merges=first-parent makes git show what each merge brought in, and this function then
 * leaves the merge out by its parents. A merge is seen and visibly left out, not hidden by a git default.
 */
function theCountedCommits(repo: string, keepers: readonly string[]): Map<string, { who: string; at: number }[]> {
  const log = execFileSync(
    'git',
    ['-C', repo, 'log', `--since=${COUNTED_SINCE}`, '-M', '--diff-merges=first-parent', '--name-status', '--format=@@%an|%ct|%P', '--', 'tests'],
    { encoding: 'utf8', maxBuffer: 1 << 28 },
  )
  const perFile = new Map<string, { who: string; at: number }[]>()
  /** An older name, and the name the file has now. */
  const nowCalled = new Map<string, string>()
  const theNameNow = (name: string): string => nowCalled.get(name) ?? name
  let commit: { who: string; at: number; leftOut: boolean } | null = null
  for (const line of log.split('\n')) {
    if (line.startsWith('@@')) {
      const [author = '', at = '0', parents = ''] = line.slice(2).split('|')
      const aMerge = parents.trim().split(' ').length > 1
      commit = { who: whoAnAuthorCountsAs(author, keepers), at: Number(at), leftOut: aMerge }
      continue
    }
    if (line.trim() === '' || commit === null || commit.leftOut) continue
    const [status = '', first = '', second] = line.split('\t')
    let file = theNameNow(first)
    if (status.startsWith('R') && second !== undefined) {
      file = theNameNow(second)
      nowCalled.set(first, file)
    }
    const list = perFile.get(file) ?? []
    list.push({ who: commit.who, at: commit.at })
    perFile.set(file, list)
  }
  return perFile
}

/** The owner of each file, by the rule above. With no files named, every test file under tests/. */
export function whoseFiles(repo: string = REPO, files?: readonly string[], keepers: readonly string[] = []): WhoseFile[] {
  const named =
    files && files.length > 0
      ? files
      : execFileSync('git', ['-C', repo, 'ls-files', 'tests'], { encoding: 'utf8' })
          .split('\n')
          .filter((one) => /\.(ts|tsx|mjs|js)$/.test(one))
  const counted = theCountedCommits(repo, keepers)
  const listings = theListings(repo)
  return named.map((file) => {
    const tally = new Map<string, { n: number; newest: number }>()
    for (const { who, at } of counted.get(file) ?? []) {
      const one = tally.get(who) ?? { n: 0, newest: 0 }
      one.n += 1
      one.newest = Math.max(one.newest, at)
      tally.set(who, one)
    }
    let owner: string | null = null
    let best = { n: 0, newest: 0 }
    for (const [who, one] of tally) {
      if (one.n > best.n || (one.n === best.n && one.newest > best.newest)) {
        owner = who
        best = one
      }
    }
    return {
      file,
      owner,
      ownersList: owner === null ? null : theListAnOwnerKeeps(owner),
      onList: listings.find((one) => one.path === file)?.list ?? null,
      commits: Object.fromEntries([...tally].map(([who, one]) => [who, one.n])),
    }
  })
}

/** One line a person reads, for one file. */
export function sayWhoseFile(one: WhoseFile): string {
  const owner = one.owner ?? 'nobody since 20 September 2026'
  const keeps = one.ownersList ?? 'no list'
  const on = one.onList ?? 'no list'
  const commits = Object.entries(one.commits)
    .map(([who, n]) => `${who} ${String(n)}`)
    .join(', ')
  return `${one.file}\towner: ${owner}\towner's list: ${keeps}\ton: ${on}\tcommits: ${commits || 'none'}`
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const keepers = operationsListKeepers()
  for (const one of whoseFiles(REPO, process.argv.slice(2), keepers)) console.log(sayWhoseFile(one))
  if (keepers.length === 0) {
    console.log(NO_OPERATIONS_KEEPERS)
    process.exitCode = 1
  }
}
