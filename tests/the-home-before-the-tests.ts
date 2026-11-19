// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE THE HOME DIRECTORY THE TEST RUN STARTED WITH IS WRITTEN DOWN.
 *
 * `tests/a-test-writes-into-no-home-but-its-own.ts` points `HOME` at a fresh directory before each
 * test file is collected, so problem `hlNgNPM9hGTh` cannot happen again. Once it has, nothing else
 * on the machine can say what the home directory was, and the test that checks the guard has to
 * name the directory the guard is about. (Test pictures no longer go under the real home: see
 * `tests/where-shots-go.ts`, problem 4G3nLvf60ydX.)
 *
 * A NAME AND TWO READERS, so that importing this changes nothing — the same shape as
 * `tests/the-agents-variables.ts`. The setup file is the only thing that writes the value.
 *
 * IT CARRIES NO `MOLE_OFFICE_` PREFIX ON PURPOSE. Every name beginning with `MOLE_OFFICE_` is a
 * setting declared in `src/config/settings.mjs` and read only there
 * (`tests/one-configuration-source.test.ts`). This is not a setting: nothing the product runs ever
 * looks at it.
 */

/** The environment variable the setup file writes the old home into. */
export const THE_HOME_BEFORE_THE_TESTS = 'THE_HOME_BEFORE_THE_TESTS'

/**
 * The home directory this test run started with.
 *
 * It fails rather than guessing. An empty value means the setup file did not run, and every caller
 * here would otherwise quietly work out a path under the wrong directory — which is the fault this
 * whole piece is about.
 */
export function theHomeBeforeTheTests(): string {
  const held = process.env[THE_HOME_BEFORE_THE_TESTS]
  if (typeof held !== 'string' || held === '') {
    throw new Error(
      `${THE_HOME_BEFORE_THE_TESTS} is not set, so the home directory this run started with is not ` +
        'known. tests/a-test-writes-into-no-home-but-its-own.ts writes it, and vitest.config.ts names ' +
        'that file under setupFiles.',
    )
  }
  return held
}
