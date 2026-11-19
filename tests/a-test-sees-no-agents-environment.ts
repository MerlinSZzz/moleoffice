// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TEST SEES A PLAIN MACHINE, HOWEVER THE RUNNER WAS STARTED. Acceptance findings 34 and 44, 23 September
 * 2026.
 *
 * An agent's run in a sandbox is started with the office's address and identity, and with the git identity
 * of the agent it serves (tools/sandbox-start.mjs). A test run inside it inherited them all. Nine test files
 * that are green plain went red, and browser tests wrote 65 records into the live office through the address
 * they inherited. So before any test file is collected these are taken out of the test's process, and a test
 * that needs an office or an identity names its own, as every green one already does.
 *
 * vitest.config.ts names this file under `setupFiles`, first. It runs in the process that runs the test
 * file, before the file is collected, so a child the test starts inherits the plain environment too.
 */
import { THE_AGENTS_VARIABLES } from './the-agents-variables.ts'

for (const name of THE_AGENTS_VARIABLES) delete process.env[name]
