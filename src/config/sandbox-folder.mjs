// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHERE SANDBOXES' INSTANCE FOLDERS ARE MADE, AND THE WORDS A SANDBOX'S CONTAINER ROW NAMES ITS INSTANCE FOLDER IN, with
 * the one way they are read back. Problem 1aDRTmegLfhy, found by the check of run 5OEGnN3JXrRs on 23 September 2026.
 *
 * A files seal counts a run's sandbox folder only while the container row that tools/sandbox.mjs registered
 * names that same folder, which is A2 of a decision. The resources ledger has no folder column,
 * so the row says it in its words. The writer and the reader used to type those words separately, and a test typed them
 * a third time. A change to any one would have made every real sandbox's folder count as none, and every original be
 * handed on, with nothing failing. All three use this now. The folder is always the resolved one (realpath), as
 * tools/sandbox-start.mjs writes it on the run.
 */
import { existsSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { theLocalAppDataFolder, thePathsOf } from './the-paths-of-a-system.mjs'

/**
 * WHERE THE LAUNCHER MAKES INSTANCE FOLDERS UNLESS --sandboxes SAYS OTHERWISE, on one system. Under the home's
 * .cache on Linux and the Mac, as chapter 3 asks. On Windows under %LOCALAPPDATA%, where a program keeps its own
 * local files there (`theLocalAppDataFolder`).
 *
 * @param {string} platform a value of `process.platform`
 * @param {string} home
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function theSandboxesFolder(platform, home, env) {
  if (platform === 'win32') return thePathsOf(platform).join(theLocalAppDataFolder(env, home), 'mole-office', 'sandboxes')
  return thePathsOf(platform).join(home, '.cache', 'mole-office', 'sandboxes')
}

/**
 * THIS MACHINE'S: declared here, where the server reads it too. The office's check for key files left in a sandbox's
 * out/ folder (src/server/lib/key-files.ts) looks in every instance folder under it. tools/sandbox-common.mjs hands
 * it on to the tools.
 */
export const SANDBOXES_FOLDER = theSandboxesFolderNow()

/**
 * THIS MACHINE'S, READ AT THE CALL: the same folder as SANDBOXES_FOLDER, worked out from the home as it is when asked.
 * A process that moves HOME after this file loads, as a test does before it starts an office, finds the folder that
 * home names. The upload receipts are found this way (src/config/storage/receipts.ts).
 * @returns {string}
 */
export function theSandboxesFolderNow() {
  return theSandboxesFolder(process.platform, homedir(), process.env)
}

/**
 * Where chapter 3 puts worktrees, under the home on every platform, including Windows.
 * The server, check-worktrees and the inspector now read one declaration.
 * @param {string} home
 * @returns {string}
 */
export function theWorktreesFolder(home) {
  return join(home, '.cache', 'mole-office', 'worktrees')
}

/** This machine's worktrees folder, read by the server as SANDBOXES_FOLDER is. */
export const WORKTREES_FOLDER = theWorktreesFolder(homedir())

/**
 * WHERE THE STABLE OFFICE'S CHECKOUT IS, under the home on every platform as the worktrees are. That checkout serves the
 * live database and holds its keys, so the sandbox launcher never mounts it, a folder inside it or a folder that holds
 * it (whyAPathIsTheStableCheckout in tools/sandbox-common.mjs). It is declared here and not as an office setting,
 * because a setting the office reads could be changed to turn that refusal off.
 * @param {string} home
 * @returns {string}
 */
export function theStableCheckoutFolder(home) {
  return join(home, '.cache', 'mole-office', 'stable')
}

/**
 * HOW A HOST PATH MEETS A FOLDER NO SANDBOX MAY MOUNT: 'is', 'is inside', 'holds', or null when it does not. Both are
 * compared as written and as they are on disk (the realpath of the nearest folder that exists, with the rest after it),
 * so a link to one cannot stand in for the other. The stable checkout is asked here, and so is the office's data folder
 * (tools/the-offices-data-folder.mjs). It lives here, beside theStableCheckoutFolder, because the service command
 * (src/config/the-service-command.mjs) asks it too and src/ imports nothing from tools/; tools/sandbox-common.mjs
 * hands it on to the tools.
 * @param {string} path an absolute host path
 * @param {string} folder an absolute host folder
 * @returns {'is' | 'is inside' | 'holds' | null}
 */
export function howAPathMeets(path, folder) {
  /** @param {string} given */
  const onDisk = (given) => {
    let held = given
    /** @type {string[]} */
    const rest = []
    while (!existsSync(held) && dirname(held) !== held) { rest.unshift(basename(held)); held = dirname(held) }
    return join(realpathSync(held), ...rest)
  }
  /**
   * @param {string} inner
   * @param {string} outer
   */
  const inside = (inner, outer) => { const r = relative(outer, inner); return r !== '' && !r.startsWith('..') && !isAbsolute(r) }
  for (const one of new Set([resolve(path), onDisk(resolve(path))])) {
    for (const other of new Set([folder, onDisk(folder)])) {
      const how = one === other ? 'is' : inside(one, other) ? 'is inside' : inside(other, one) ? 'holds' : null
      if (how !== null) return how
    }
  }
  return null
}

/**
 * The part of a container row's words that names its instance folder.
 * @param {string} folder the resolved instance folder
 * @returns {string}
 */
export function theWordsNamingTheFolder(folder) {
  return `its folder is ${folder}.`
}

/**
 * Whether a container row's words name exactly this folder. The words must end there or go on after a
 * space: a row naming /x/b.c does not name /x/b, although the one is written at the start of the other.
 * @param {unknown} detail the row's words
 * @param {string} folder the resolved instance folder
 * @returns {boolean}
 */
export function theRowNamesTheFolder(detail, folder) {
  if (typeof detail !== 'string') return false
  const words = theWordsNamingTheFolder(folder)
  return detail.endsWith(words) || detail.includes(`${words} `)
}
