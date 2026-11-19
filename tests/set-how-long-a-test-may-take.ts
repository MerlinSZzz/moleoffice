// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GIVE THIS TEST FILE THE BUDGET ITS KIND OF TEST NEEDS, BEFORE THE RUNNER COLLECTS IT.
 *
 * vitest.config.ts names this file under `setupFiles`, so the runner imports it once for every
 * test file, immediately before collecting that file. tests/how-long-a-test-may-take.ts holds the
 * rule, the two numbers and what was measured. This file only applies it.
 *
 * The runner throws away whatever this sets after each file, so one file's budget never reaches
 * the next one.
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, expect, vi } from 'vitest'
import {
  A_HOOK_THAT_IMPORTS_THE_SERVER,
  A_HOOK_THAT_STARTS_SOMETHING,
  A_TEST_THAT_STARTS_SOMETHING,
  importsTheServer,
  startsSomethingOutsideTheTestProcess,
} from './how-long-a-test-may-take.ts'
import { readEachHooksLimit } from './the-time-a-hook-has-left.ts'
import { keepTheWaitsOnHookFailure } from './a-start-keeps-its-waits.ts'

/**
 * WHICH FILE IS ABOUT TO BE COLLECTED. The runner writes it down before it imports a setup file,
 * and `expect.getState().testPath` reads it back.
 *
 * IT FAILS RATHER THAN GUESSING. If the path is not there, this cannot tell a browser test from a
 * pure one, and carrying on would quietly hand every browser test in the suite a five-second
 * budget again — the exact fault this file exists to stop, back with nothing to say for itself.
 */
const { testPath } = expect.getState()
if (typeof testPath !== 'string' || testPath === '') {
  throw new Error(
    'tests/set-how-long-a-test-may-take.ts could not find out which test file is being collected: ' +
      'expect.getState().testPath was empty. Without it no test file can be given the right budget, ' +
      'so this fails rather than leaving every browser test on the five-second default.',
  )
}

const source = readFileSync(testPath, 'utf8')
if (startsSomethingOutsideTheTestProcess(source)) {
  vi.setConfig({
    testTimeout: A_TEST_THAT_STARTS_SOMETHING,
    hookTimeout: A_HOOK_THAT_STARTS_SOMETHING,
  })
} else if (importsTheServer(source)) {
  vi.setConfig({ hookTimeout: A_HOOK_THAT_IMPORTS_THE_SERVER })
}

/**
 * EACH HOOK OF THIS FILE SAYS WHEN IT MUST END, while it runs, so liveApp can stop waiting before the hook's limit and
 * say what it waited for. This hook is the file's first, so it runs before every other. tests/the-time-a-hook-has-left.ts
 * says how. vitest reads which fixtures a hook asks for from its first argument, so that argument is written as `{}`.
 */
beforeAll(({}: object, file) => {
  readEachHooksLimit(file)
})

afterAll(({}: object, file) => {
  keepTheWaitsOnHookFailure(file)
})
