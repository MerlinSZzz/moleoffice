// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHEN EACH FILE UNDER A PATH WAS FIRST COMMITTED — EVERY ONE OF THEM, IN ONE PASS.
 *
 * MEASURED, 22 September 2026. tools/test-audit-table.mjs asked this question with
 * `git log --diff-filter=A --follow -- <file>`, once per file: 1,243 git processes at about 110 ms
 * each, 2 minutes 15 seconds for one `--check` of the test audit table. That one tool was then called
 * eleven times by a test of the table, since deleted, which made that test the slowest file in the
 * whole suite by far — 18 minutes of a 36-minute run, and the floor under it — and the merge queue
 * paid the same two minutes on every merge, because it regenerated that document.
 *
 * One `git log --reverse --diff-filter=AR --name-status -M -- <prefix>` walks the same history once
 * and answers in 0.2 seconds. The two readers were compared on this checkout before this module was
 * written: the whole table, 1,897 lines, byte for byte the same.
 *
 * WHY THE ANSWER IS THE SAME. Oldest commit first, so the first `A` for a path is the day that path
 * was first committed. A rename (`R`) carries the day the old name already held and forgets the old
 * name, which is what `--follow` was being asked to work out. A path that no commit adds is not in
 * the answer at all, and the caller decides what that means — for the audit table, a file on disk
 * and in no commit is dated today and said to be uncommitted.
 *
 * IT IS A READ. It runs one git command and writes nothing.
 */
import { execFileSync } from 'node:child_process'

/** One answer per repository and prefix, because the history does not change under a running tool. */
const KEPT = new Map()

/**
 * @param {string} repo The checkout to ask.
 * @param {string} prefix The path to ask about, as git spells it, e.g. `tests/`.
 * @returns {Map<string, string>} path, as git spells it, to the day it was first committed (YYYY-MM-DD).
 */
export function firstCommitDaysIn(repo, prefix) {
  const already = KEPT.get(`${repo}\u0000${prefix}`)
  if (already !== undefined) return already
  const out = execFileSync(
    'git',
    ['log', '--reverse', '--diff-filter=AR', '--name-status', '-M', '--format=%x01%ad', '--date=format:%Y-%m-%d', '--', prefix],
    { cwd: repo, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  )
  const days = new Map()
  let day = null
  for (const line of out.split('\n')) {
    if (line.startsWith('\u0001')) {
      day = line.slice(1).trim()
      continue
    }
    if (line === '' || day === null) continue
    const parts = line.split('\t')
    const what = parts[0] ?? ''
    if (what.startsWith('R') && parts.length >= 3) {
      const [, from, to] = parts
      days.set(to, days.get(from) ?? day)
      days.delete(from)
    } else if (what.startsWith('A') && parts.length >= 2) {
      const path = parts[1]
      // THE FIRST ADD WINS. A file added, deleted and added again was first committed the first time.
      if (!days.has(path)) days.set(path, day)
    }
  }
  KEPT.set(`${repo}\u0000${prefix}`, days)
  return days
}

/** Forget what was read, for a test that makes a repository, asks, and then changes it. */
export function forgetTheFirstCommitDays() {
  KEPT.clear()
}
