// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * A CODEX STARTED INSIDE A SANDBOX GETS ONLY THE NAMES A CODEX KEEPS. tools/sandbox-codex/codex runs this program, and
 * tools/sandbox-start.mjs puts that folder first on the PATH of every command it starts. So a Codex that a command in a
 * sandbox starts by name, through any number of shells, starts here.
 *
 * It does three things, and then becomes the Codex (execve), so the process id and the process group stay the same:
 *   1. It keeps only the names theEnvironmentACodexGets keeps (src/config/the-environment-a-codex-gets.mjs).
 *   2. It finds the next codex on PATH: the first folder, in order, whose codex is an executable file and is not a copy
 *      of tools/sandbox-codex/codex. A copy is told by isACopyOfTheSandboxCodex (src/config/the-sandbox-codex.mjs), by
 *      its size and then its bytes, the test whereIsThisTool makes too. So the sandbox codex of a second checkout on
 *      PATH is passed over too, and the switch below is given once.
 *   3. It puts CODEX_SHELL_SNAPSHOT_OFF (src/config/run-permissions.mjs) right after the program's name, in front of
 *      the caller's arguments. The caller's arguments are passed on unchanged.
 *
 * With no such codex it says so in one sentence, exits 127 as a shell does for a command it cannot find, and starts
 * nothing. It prints no value and no folder of PATH. Without process.execve it fails in one sentence. It never starts
 * the Codex as a child instead: the process the caller registered, signals and waits for must be the Codex itself.
 *
 * Not covered: a Codex started by its full path, which is not looked for on PATH.
 */
import { accessSync, constants, existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { CODEX_SHELL_SNAPSHOT_OFF } from '../src/config/run-permissions.mjs'
import { theEnvironmentACodexGets } from '../src/config/the-environment-a-codex-gets.mjs'
import { THE_SANDBOX_CODEX, isACopyOfTheSandboxCodex } from '../src/config/the-sandbox-codex.mjs'

/**
 * The codex `folder` holds when it is an executable file and no copy of the sandbox's own codex, or null.
 * @param {string} folder
 * @returns {string | null}
 */
function theCodexIn(folder) {
  const program = resolve(folder === '' ? '.' : folder, 'codex')
  try {
    if (!statSync(program).isFile()) return null
    accessSync(program, constants.X_OK)
    return isACopyOfTheSandboxCodex(program) ? null : program
  } catch {
    // NOT THERE, NOT EXECUTABLE, OR OF A COPY'S SIZE AND NOT READABLE, SO THAT ITS BYTES CANNOT BE COMPARED: the next
    // folder is read.
    return null
  }
}

/** @returns {never} */
function fail(/** @type {string} */ sentence, /** @type {number} */ code) {
  process.stderr.write(`${sentence}\n`)
  process.exit(code)
}

// WITHOUT THE SANDBOX'S OWN CODEX NO COPY CAN BE TOLD, and every copy on PATH, the one that started this included,
// would look like a real codex to become. That would start this program again and again, so it stops here first.
if (!existsSync(THE_SANDBOX_CODEX)) {
  fail("The sandbox's own codex is not in this checkout, so no copy of it can be told from a real codex, and no Codex was started.", 1)
}

/** @type {string | null} */
let found = null
for (const folder of (process.env['PATH'] ?? '').split(':')) {
  found = theCodexIn(folder)
  if (found !== null) break
}
if (typeof process.execve !== 'function') {
  fail("This Node cannot replace its own process (process.execve), so the sandbox's codex started no Codex.", 1)
} else if (found === null) {
  fail("No codex other than the sandbox's own is on PATH and executable, so no Codex was started.", 127)
} else {
  try {
    process.execve(found, [found, ...CODEX_SHELL_SNAPSHOT_OFF, ...process.argv.slice(2)], theEnvironmentACodexGets(process.env))
  } catch (why) {
    // THE CODE ONLY: the error's own words name the codex's path, which is a folder of PATH.
    const code = why instanceof Error && 'code' in why ? String(why.code) : 'no code'
    fail(`The codex found on PATH could not be started (${code}).`, 126)
  }
}
