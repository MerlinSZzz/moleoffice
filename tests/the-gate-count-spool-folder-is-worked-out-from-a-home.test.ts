// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GATE-COUNT SPOOL'S FOLDER IS ONE FUNCTION OF A HOME, AND THIS MACHINE'S SPOOL IS THAT FUNCTION OF ITS OWN HOME
 * (wave 13r round AE, item 15).
 *
 * The spool is the folder `GATE_COUNT_SPOOL.folder` names, inside the sandboxes folder of a home
 * (src/config/sandbox-folder.mjs). src/config/gate-count-spool.mjs works it out for a home given to it, as
 * theWorktreesFolder does for the worktrees, and this machine's spool is that answer for homedir(). So a tool that is
 * handed another home, and the office's reader, which reads this machine's spool, make the same join.
 *
 * The cases read the folder's name from GATE_COUNT_SPOOL and the sandboxes folder from theSandboxesFolder, and copy
 * neither. Nothing here writes a spool. The home in the first case is an empty temporary folder, and the second reads
 * homedir(), which is this test file's own home (tests/a-test-writes-into-no-home-but-its-own.ts).
 *
 * MUTATIONS, each planted alone after a control run:
 *   - in theGateCountSpoolFolder, join the spool's name to SANDBOXES_FOLDER in place of the home's sandboxes folder:
 *     the first case goes red, because the answer is this machine's spool and not the temporary home's;
 *   - work out THE_GATE_COUNT_SPOOL_FOLDER from userInfo().homedir in place of homedir(): the second case goes red,
 *     because the constant follows the home the password file names and not the one the process was given.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { GATE_COUNT_SPOOL, THE_GATE_COUNT_SPOOL_FOLDER, theGateCountSpoolFolder } from '../src/config/gate-count-spool.mjs'
import { theSandboxesFolder } from '../src/config/sandbox-folder.mjs'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'

const A_HOME = aTestDatabaseFolder('spool-folder-home')
afterAll(() => removeThisTestFolder(A_HOME))

it("answers, for a home in a temporary folder, that home's sandboxes folder with the spool's folder name in it", () => {
  expect(theGateCountSpoolFolder(A_HOME)).toBe(join(theSandboxesFolder(process.platform, A_HOME, process.env), GATE_COUNT_SPOOL.folder))
})

it("gives this machine's spool as the function's answer for homedir()", () => {
  expect(THE_GATE_COUNT_SPOOL_FOLDER).toBe(theGateCountSpoolFolder(homedir()))
})
