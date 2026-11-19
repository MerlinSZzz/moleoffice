// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE NAME OF THE HEADER IN WHICH THE SESSION HOOK SENDS ITS OWN CLOCK, when a test runs the hook on a scaled clock.
 *
 * The hook gives up each read at a moment on its own clock, which counts from its process start (`performance.now()` in
 * `tools/session-hook.mjs`). A test's stand-in office sees a read only when it arrives, after the hook's start, its
 * imports and its earlier reads, and a busy machine makes those slower. With this header the stand-in can count when a
 * read ended on the hook's own clock. Its value is the hook's clock, in whole milliseconds, when it sent the read.
 *
 * The hook sends it only while MOLE_OFFICE_TEST_HOOK_CLOCK_SCALE is set to something other than 1, which only tests do,
 * so no office receives it. `.mjs`, so the hook, which runs without TypeScript, can import it.
 *
 * Lower case, as Node's server gives every header name.
 */
export const HOOK_CLOCK_HEADER = 'x-mole-office-test-hook-clock'
