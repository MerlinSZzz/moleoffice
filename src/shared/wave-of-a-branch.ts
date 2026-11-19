// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WAVE A GIT BRANCH NAMES.
 * `theWaveOf` was moved byte for byte out of src/server/lib/merge-queue-page.ts, with no change of behaviour.
 * That file re-exports it.
 */

/** The wave a git branch names: a branch that starts with `wave-` names the part before its next hyphen, such as 13p. A branch not in that shape is its own name. */
export function theWaveOf(branch: string | null): string | null {
  if (branch === null || branch.trim() === '') return null
  return /^wave-([^-]+)/iu.exec(branch)?.[1] ?? branch
}
