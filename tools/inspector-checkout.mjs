// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE CHECKOUT OF A CHECK'S WORK TREE INSIDE ITS SANDBOX, BY GIT'S PARALLEL CHECKOUT (item 2bb of the requirement list).
 *
 * In a sandbox the inspector clones the run's repository with no files, then checks the tip out inside the sandbox
 * (aWorktreeOfItsOwn in tools/the-inspector.mjs). git wrote the files with one process: 9,422 files of this repository
 * took about 0.9 seconds. checkout.workers below one makes git start a worker process for each core, and the same files
 * took about 0.2 seconds. The workers change how many processes write the files, not which files are written or what is
 * in them. The sandbox's image has git 2.43, and git has read checkout.workers since 2.32.
 */

/**
 * The command that checks `tip` out, detached, in the check's work tree inside the sandbox.
 * @param {string} tip
 * @returns {string[]}
 */
export function theCheckoutInsideTheSandbox(tip) {
  return ['git', '-c', 'checkout.workers=0', 'checkout', '--quiet', '--detach', tip]
}
