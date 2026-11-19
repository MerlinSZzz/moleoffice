// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE PATHS A WORKER'S WORKTREE LEAVES OUT, and the one way they are read. A sandbox's template may name paths of the
 * repository that a worker's worktree leaves out, as a sparse checkout (git's own), because a worker seldom needs
 * them and they are large: one sandbox's worktrees were about 0.7 GB each, and 25 workers took about 17 GB.
 *
 * THE DECLARATION is the template's sandbox.json, under `aWorkersWorktreeLeavesOut`, read at each start where the
 * launcher reads the template's other settings (tools/sandbox.mjs). A supervisor's worktree is whole. A worker that
 * needs a left-out path names it in its ask (`paths`, src/server/lib/worker-runs.ts) or to the launcher as
 * `--with-path`, and gets it.
 *
 * A PLAIN PATH is what a person would write for a folder or file under the repository: parts of letters, digits, ".",
 * "_" and "-", joined by single slashes, with no slash at either end and no part "." or "..". git reads the sparse
 * patterns as patterns, so anything else could name more, or other, files than were written. It is refused, not
 * read some other way. The launcher, the office's ask door and the template's reader all check by this one rule.
 */

/** The key of the template's sandbox.json that names the paths. */
export const A_WORKERS_WORKTREE_LEAVES_OUT = 'aWorkersWorktreeLeavesOut'

const A_PLAIN_CHARACTER = /^[A-Za-z0-9._-]$/

/**
 * Why `path` is not a plain path under the repository, or null because it is one.
 *
 * @param {unknown} path
 * @returns {string | null}
 */
export function whyNotAPlainPath(path) {
  if (typeof path !== 'string') return `it is ${path === null ? 'null' : `a ${typeof path}`}, not a path`
  if (path === '') return 'it is empty'
  if (path.startsWith('/')) return 'it begins with "/", and a path here is under the repository'
  if (path.endsWith('/')) return 'it ends with "/"'
  for (const part of path.split('/')) {
    if (part === '') return 'it has two slashes together'
    if (part === '.' || part === '..') return `it has the part "${part}"`
    const odd = [...part].find((character) => !A_PLAIN_CHARACTER.test(character))
    if (odd !== undefined) return `it has the character ${JSON.stringify(odd)}, and a plain path has only letters, digits, ".", "_", "-" and "/"`
  }
  return null
}

/**
 * Why `list` is not a list of plain paths, each named once, or null because it is one. `named` is how the words name
 * the list's place, such as `paths` or `--with-path`.
 *
 * @param {unknown} list
 * @param {string} named
 * @returns {string | null}
 */
export function whyNotPlainPaths(list, named) {
  if (!Array.isArray(list)) return `${named} is not a list`
  const seen = new Set()
  for (const path of list) {
    const why = whyNotAPlainPath(path)
    if (why !== null) return `${named} names ${JSON.stringify(path)}, which is not a plain path: ${why}`
    if (seen.has(path)) return `${named} names ${String(path)} twice`
    seen.add(path)
  }
  return null
}

/**
 * The paths the template's settings leave out of a worker's worktree, as written, and [] when they name none. A value
 * that is not a list of plain paths, each once, throws, naming the file and the key, so nothing is left out by a guess.
 *
 * @param {Record<string, unknown>} settings the template's sandbox.json, as read
 * @param {string} file where it was read
 * @returns {string[]}
 */
export function thePathsAWorkerLeavesOut(settings, file) {
  const value = settings[A_WORKERS_WORKTREE_LEAVES_OUT]
  if (value === undefined) return []
  const why = whyNotPlainPaths(value, A_WORKERS_WORKTREE_LEAVES_OUT)
  if (why !== null) {
    throw new Error(`${file}: ${why}. It must be a list of plain paths under the repository, each once, as in ["design/big-files"].`)
  }
  return [.../** @type {string[]} */ (value)]
}
