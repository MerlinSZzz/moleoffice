// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/** The daily test catches reading: a counter requests it, and tools/run-the-test-catches-job.mjs answers it. */

/** The registered job the daily counter requests. */
export const TEST_CATCHES_JOB = 'test-catches.daily'
/** The one counter that requests a week of test catches each day. Nobody may add to it, so it is a timer and fires with no count. */
export const TEST_CATCHES_COUNTER = Object.freeze({
  title: 'Daily test catches week reading',
  label: 'Test catches week reading',
  counts: 'One reading of the week of test catches each day.',
  mayAdd: { anyone: false, who: [] },
  triggers: [{ kind: 'every', hours: 24 }],
  action: { kind: 'job', job: TEST_CATCHES_JOB },
})
