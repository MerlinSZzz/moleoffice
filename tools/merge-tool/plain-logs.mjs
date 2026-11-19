// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY COMMAND THE MERGE TOOL RUNS IN AN ENTRY'S SANDBOX WRITES A PLAIN LOG. vitest
 * colours its log unless it sees an agent, and the queue is not one, so a coloured FAIL line matched neither the
 * failure-lines reader nor a test's exact lookup. Each command runs with NO_COLOR=1 and without FORCE_COLOR, whatever
 * the sandbox's own environment holds: every vitest run the tool starts here (the suite, the related tests, a file run
 * alone, the plugin lane's gates), and the builds beside them, which a plain log costs nothing.
 *
 * NOT HERE: the suite the cloud box runs, whose command is the box's own door, and the second opinion on Modal, whose
 * command tools/modal-tests.mjs writes. Neither is a command this file starts.
 *
 * The guard has no merge-tool arguments, so a test can import these words on its own.
 */
import './a-library-is-not-a-program.mjs'

/** The words before every command: `env` takes FORCE_COLOR out and sets NO_COLOR=1. */
export const A_PLAIN_LOG = Object.freeze(['env', '-u', 'FORCE_COLOR', 'NO_COLOR=1'])

/** The words the sandbox runs for `command` and `args`: at the lowest priority, with a plain log. */
export function theCommandInTheSandbox(command, args) {
  return ['nice', '-n', '19', ...A_PLAIN_LOG, command, ...args]
}
