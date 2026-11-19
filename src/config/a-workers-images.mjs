// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE IMAGES A CODEX WORKER IS GIVEN AT ITS START, and the one way each is checked on disk. A supervisor's ask may name
 * files of the worker's worktree as `images` (src/server/lib/worker-runs.ts), and the launcher gives codex exec each one
 * as `-i <path>` (`--image`, tools/sandbox.mjs). No other runtime is given any.
 *
 * EACH IS CHECKED BEFORE THE START, because codex exec does not refuse an image it cannot read. codex-cli 0.159.2 tells
 * the model in words that it could not read the file and goes on, and it reads a comma in one -i as two files. So an
 * image is a plain path (src/config/a-workers-left-out-paths.mjs), which has no comma, to a file of the worktree: not a
 * link, not a folder, and with its real path inside the worktree's. The ask door and the launcher both check by this rule.
 *
 * THE LAUNCHER'S SENTENCES ABOUT IMAGES ARE MADE HERE TOO, so tools/sandbox.mjs only calls them and a test reads the same
 * words from the same place. A sentence that takes values is a function; one that does not is a constant.
 */

import { lstatSync, realpathSync } from 'node:fs'
import { join, sep } from 'node:path'

/** Why an image is not a file of the worktree: nothing is at its path, or the worktree leaves the path out. */
export const NOTHING_IS_THERE = 'nothing is there'

/** Why an image is not a file of the worktree: its path is a link. */
export const IT_IS_A_LINK = 'it is a link; name the file it leads to'

/** Why an image is not a file of the worktree: its path is a folder or another thing that is not a file. */
export const IT_IS_NOT_A_FILE = 'it is not a file'

/**
 * Why an image is not a file of the worktree: its real path `real` is outside it.
 *
 * @param {string} real
 * @returns {string}
 */
export function itsRealPathIsOutside(real) {
  return `its real path ${real} is outside the worktree`
}

/**
 * Why the plain path `image` is not a file of the worktree `dir`, or null because it is one. `nothingThere` is true when
 * nothing is at that path, which is also how a path the worktree leaves out reads.
 *
 * @param {string} dir
 * @param {string} image
 * @returns {{ why: string, nothingThere: boolean } | null}
 */
export function whyNotAFileOfTheWorktree(dir, image) {
  const at = join(dir, image)
  try {
    const stat = lstatSync(at)
    if (stat.isSymbolicLink()) return { why: IT_IS_A_LINK, nothingThere: false }
    if (!stat.isFile()) return { why: IT_IS_NOT_A_FILE, nothingThere: false }
    const root = realpathSync(dir)
    const real = realpathSync(at)
    if (!real.startsWith(root + sep)) return { why: itsRealPathIsOutside(real), nothingThere: false }
    return null
  } catch (error) {
    const code = /** @type {{ code?: unknown }} */ (error)?.code
    if (code === 'ENOENT' || code === 'ENOTDIR') return { why: NOTHING_IS_THERE, nothingThere: true }
    return { why: `it could not be read (${error instanceof Error ? error.message : String(error)})`, nothingThere: false }
  }
}

/**
 * What the launcher says once the worktree `dir` is made and each of `images` is a file of it.
 *
 * @param {readonly string[]} images
 * @param {string} dir
 * @returns {string}
 */
export function codexExecIsGiven(images, dir) {
  return `codex exec is given ${images.length === 1 ? 'the image' : `${images.length} images`} ${images.join(', ')} in ${dir}, each as -i.`
}

/**
 * The launcher's refusal of `image`, which is not a file of the worktree `dir` for the reason `not`. When nothing is
 * there, it says the template may leave the image's folder out.
 *
 * @param {string} image
 * @param {string} dir
 * @param {{ why: string, nothingThere: boolean }} not
 * @returns {string}
 */
export function anImageNotInTheWorktree(image, dir, not) {
  const more = not.nothingThere ? "; if the sandbox's template leaves its folder out of a worker's worktree, give that folder with --with-path as well" : ''
  return `--image ${image} is not a file of the worker's worktree ${dir}: ${not.why}${more}.`
}

/** What the launcher's refusal of an image that is not a file of the worktree goes on to say. */
export const AN_IMAGE_IS_UNDER_THE_WORKTREE = 'An image is a file of the worktree, named by a plain path under it. Nothing was filed or started.'

/**
 * The launcher's refusal of --image for a worker on `runtime`, which is not codex.
 *
 * @param {string} runtime
 * @returns {string}
 */
export function anImageIsOnlyForCodex(runtime) {
  return `--image is given only to codex exec, as -i <path>; ${runtime} is given no image when it starts, so name the files in the brief instead.`
}

/** The launcher's refusal of --image on a command that is not worker. */
export const AN_IMAGE_IS_ONLY_FOR_WORKER = '--image is only for worker, whose codex exec command is given each image as -i. Nothing was done.'
