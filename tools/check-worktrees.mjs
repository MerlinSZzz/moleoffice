// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Cleanup for check worktrees, including checks left behind by an earlier office run. _VDR6BJbiaoF. */
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { theWorktreesFolder } from '../src/config/sandbox-folder.mjs'
import { refuseToRemoveIfAnybodyIsIn } from './live-processes.mjs'
import { guardedGitBytes } from './sandbox-git.mjs'

const PREFIX = 'a-check-of-'
/** A check's worktree can be in a sandbox's clone, so git runs with the guard (tools/sandbox-git.mjs). */
const git = (repository, ...args) => guardedGitBytes(repository, args, { timeout: 60_000 }).toString('utf8')

/** Remove only a registered worktree, then prune its repository. Each result says what completed. */
export function removeCheckWorktree(repository, at) {
  try {
    refuseToRemoveIfAnybodyIsIn(at)
    git(repository, 'worktree', 'remove', '--force', at)
    if (existsSync(at)) throw new Error('Git returned without removing the directory.')
  } catch (why) {
    return { removed: false, ok: false, says: `The check worktree ${at} could not be removed: ${String(why)}` }
  }
  try {
    git(repository, 'worktree', 'prune')
  } catch (why) {
    return { removed: true, ok: false, says: `The check worktree ${at} is removed, but its repository could not be pruned: ${String(why)}` }
  }
  return { removed: true, ok: true, says: `The check worktree ${at} is removed. Its repository was pruned.` }
}

/**
 * Only recorded endings permit removal. A name may contain hyphens in both ids, so match the
 * recorded check ids rather than splitting the name at a hyphen. Ambiguous matches stay put.
 * @param {{checks: {id: string, ended: boolean, state: string}[], worktrees?: string, sandboxes?: string}} input
 */
export function sweepCheckWorktrees({ checks, worktrees = theWorktreesFolder(homedir()), sandboxes = join(homedir(), '.cache/mole-office/sandboxes') }) {
  const result = { removed: 0, kept: 0, lines: /** @type {string[]} */ ([]) }
  const roots = [worktrees]
  function directories(at) {
    try {
      return readdirSync(at, { withFileTypes: true })
    } catch (why) {
      if (why.code !== 'ENOENT') result.lines.push(`Check worktrees in ${at} could not be listed: ${String(why)}`)
      return []
    }
  }
  for (const entry of directories(sandboxes)) {
    if (entry.isDirectory() && entry.name.startsWith('inspector-')) roots.push(join(sandboxes, entry.name, 'worktrees'))
  }
  for (const root of new Set(roots)) {
    for (const entry of directories(root)) {
      if (!entry.name.startsWith(PREFIX)) continue
      const at = join(root, entry.name)
      const keep = (why) => {
        result.kept += 1
        result.lines.push(`Kept check worktree ${at}: ${why}`)
      }
      const matching = checks.filter((check) => entry.name.endsWith(`-${check.id}`))
      if (matching.length !== 1) {
        keep(matching.length === 0 ? 'the office cannot find its check record.' : 'more than one check record matches its name.')
        continue
      }
      const check = matching[0]
      if (!check.ended) {
        keep(`check ${check.id} is recorded as ${check.state}; only finished or crashed checks are swept.`)
        continue
      }
      if (!entry.isDirectory()) {
        keep('this path is not a directory; the sweep follows no symbolic link.')
        continue
      }
      try {
        const common = git(at, 'rev-parse', '--path-format=absolute', '--git-common-dir').trim()
        const registered = git(common, 'worktree', 'list', '--porcelain', '-z').split('\0')
          .filter((line) => line.startsWith('worktree ')).map((line) => line.slice(9))
        if (!registered.includes(resolve(at))) {
          keep('this path is not a registered worktree in its repository.')
          continue
        }
        const removed = removeCheckWorktree(common, at)
        if (removed.removed) {
          result.removed += 1
          result.lines.push(removed.says)
        } else keep(removed.says)
      } catch (why) {
        keep(`its repository could not be read: ${String(why)}`)
      }
    }
  }
  result.lines.push(`Check worktree sweep: removed ${result.removed}; kept ${result.kept}.`)
  return result
}
