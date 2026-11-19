// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY TEST PROCESS SAYS WHICH TEST FILE IT IS RUNNING, SO A REFUSAL CAN NAME IT. Problem E1SWGJK7wG68.
 *
 * tools/live-office-guard.mjs refuses a connection to the live office from any test process, and its
 * refusal names the test file when it can. This file puts the path of the test file being run into
 * the variable the guard reads, before the file is collected. A child the test starts inherits it, so
 * a refusal in a tool the test started names the test too. vitest.config.ts names this under
 * `setupFiles`.
 */
import { expect } from 'vitest'
import { TEST_FILE_VARIABLE } from '../tools/live-office-guard.mjs'

const file = expect.getState().testPath
if (typeof file === 'string' && file !== '') process.env[TEST_FILE_VARIABLE] = file
