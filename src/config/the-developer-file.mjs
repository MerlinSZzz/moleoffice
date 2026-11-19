// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHETHER A FILE IS THE DEVELOPER CLAUDE.md, OR THE AGENTS.md WRITTEN FROM IT, whatever it is called.
 *
 * The checkout's CLAUDE.md is written for the agents that develop the office, and a rule keeps it out of an
 * installer. Two things ask the one question this file answers:
 *   - scripts/no-development-material.mjs, which refuses a bundle or an installer that would carry it;
 *   - src/worker/rules.ts, which reads a checkout whose CLAUDE.md is the developer file as a developer
 *     checkout, and any other folder as an installation, whose rules it writes from other sources
 *     (message TxINgmO9H6gu).
 * One test, so the installer's idea of the developer file and the rules writer's cannot drift.
 *
 * IT LIVES HERE AND NOT IN scripts/ because the server loads src/worker/rules.ts
 * (src/server/lib/invariants.ts), and the two tests that build a server from its own files,
 * tests/a-program-is-judged-on-the-files-it-is-built-from.test.ts and
 * tests/the-server-is-judged-on-the-code-it-is-built-from.test.ts, copy src and not scripts. An import
 * of scripts/ from rules.ts would break those servers.
 */

import { closeSync, openSync, readSync } from 'node:fs'

/** The developer CLAUDE.md's heading, its first line. */
export const THE_DEVELOPER_HEADING = '# Working on Mole Office'

/** A text that starts with the developer heading, after at most one comment such as AGENTS.md's first line. */
const STARTS_AS_THE_DEVELOPER_FILE = new RegExp(`^\\s*(<!--[\\s\\S]*?-->\\s*)?${THE_DEVELOPER_HEADING}(\\r?\\n|$)`)

/**
 * Whether a file is the developer CLAUDE.md or AGENTS.md, whatever it is called, by its first bytes
 * only, so the Node and the native files cost nothing.
 *
 * @param {string} file
 */
export function isTheDeveloperFile(file) {
  const start = Buffer.alloc(256)
  const fd = openSync(file, 'r')
  let read = 0
  try {
    read = readSync(fd, start, 0, start.length, 0)
  } finally {
    closeSync(fd)
  }
  return STARTS_AS_THE_DEVELOPER_FILE.test(start.subarray(0, read).toString('utf8'))
}
