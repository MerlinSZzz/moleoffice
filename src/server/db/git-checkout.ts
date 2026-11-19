// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT GIT SAYS ABOUT A CHECKOUT, read from the files git reads, without starting git.
 *
 * Three readers ask: the checkout reading of GET /api/runtime (src/server/lib/resources.ts), which
 * says whether the office runs from a worktree, and the database's opener (src/server/db/client.ts)
 * and the key file's maker (src/server/lib/keys.ts), which will not write an office's data inside
 * one. They ask the same question, so it is answered once (problem nd7jOk5LCU4s): where git keeps a
 * checkout's files in src/config/settings.mjs, and whether a path is in a worktree here.
 */
import { existsSync, realpathSync } from 'node:fs'
import { dirname, join, resolve as resolvePath } from 'node:path'
import { REFUSING_TO_WRITE } from '../../config/guard-refusal.mjs'
import { gitDirsOf } from '../../config/settings.mjs'

/**
 * WHERE GIT KEEPS ITS FILES FOR ONE CHECKOUT is worked out in src/config/settings.mjs, and only there.
 * The settings need it in plain Node, before any server code loads, to find a worktree's .env without
 * starting git (wave 13t, round 23), and a .mjs file cannot import this one. It is handed on here so the
 * server's readers ask one place.
 */
export { gitDirsOf }

/**
 * THE GIT WORKTREE A PATH SITS IN, or null when it sits in none.
 *
 * The nearest folder above the path that holds a `.git` decides: when that checkout is a worktree
 * (its own gitdir is not the main clone's), the answer is that folder; when it is a main clone, or
 * no checkout holds the path, the answer is null. A main clone is where the owner's own office runs
 * (GET /api/runtime says `isWorktree: false` there), so it is never refused.
 *
 * THE PATH IS FOLLOWED THROUGH LINKS, from the nearest part of it that exists: a file is kept where
 * the disk puts it, so a `data` folder that is a link to a temporary folder is not in the checkout.
 *
 * @param path an absolute path, which need not exist yet
 */
export function theWorktreeHolding(path: string): string | null {
  let existing = resolvePath(path)
  while (!existsSync(existing) && dirname(existing) !== existing) existing = dirname(existing)
  let folder = realpathSync(existing)
  for (;;) {
    if (existsSync(join(folder, '.git'))) {
      const dirs = gitDirsOf(folder)
      return dirs !== null && dirs.gitDir !== dirs.commonDir ? folder : null
    }
    const up = dirname(folder)
    if (up === folder) return null
    folder = up
  }
}

/**
 * NO OFFICE KEEPS ITS DATA INSIDE A GIT WORKTREE (problem nd7jOk5LCU4s). A worktree is somebody's
 * work, not an office's home. 328 key files of throwaway offices were found in worktrees under the
 * sandboxes by 6 October 2026, made by dev servers and a test started there on the checkout's own
 * `data/`, and the session hook in that checkout reads such a file as its office's key. So neither
 * the database nor the key file is opened or made in a worktree, and the start says so before it
 * writes anything. The owner's office runs from a main clone, which this never refuses.
 *
 * The words begin `REFUSING TO `, so tools/serve-dev.mjs stops instead of starting it again.
 */
export function refuseADataFolderInAWorktree(file: string): void {
  const worktree = theWorktreeHolding(dirname(resolvePath(file)))
  if (worktree === null) return
  throw new Error(
    `${REFUSING_TO_WRITE} ${resolvePath(file)}, because its folder is inside the git worktree ${worktree}. ` +
      'An office\'s database and keys left in a checkout are read there by the session hook, and by anybody who looks. ' +
      'Start this office on a database outside the checkout, for example MOLE_OFFICE_DB=$(mktemp -d)/mole-office.db. ' +
      'Nothing was read and nothing was written.',
  )
}
