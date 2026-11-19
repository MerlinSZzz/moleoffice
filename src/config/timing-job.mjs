// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/** Scheduled timing checks use the counters' durable firing and answer doors. */
export const TIMING_JOB = 'review-panel.timing'
export const TIMING_RETRY_MS = 30 * 60_000
export const TIMING_DEADLINE_MS = 3 * 24 * 60 * 60_000
export const REVIEW_PANEL_PATHS = Object.freeze([
  'src/web/components/agent/',
  'src/web/lib/review.ts',
  'src/shared/review-pane-words.ts',
  'src/web/api.ts',
  'src/server/lib/reviews.ts',
  'src/server/api/reviews.ts',
  'src/server/api/messages.ts',
])

/** @param {string} lane */
export function timingCounters(lane) {
  return [
    { title: 'Weekly review timing', label: 'Weekly timing check', counts: 'One timing check each week.', mayAdd: { anyone: false, who: [] }, triggers: [{ kind: 'every', hours: 168 }], action: { kind: 'job', job: TIMING_JOB } },
    { title: 'Review changes timing', label: 'Review changes check', counts: 'Landings that change review panel files.', follows: [{ event: 'landing', lane, paths: [...REVIEW_PANEL_PATHS] }], triggers: [{ kind: 'count', n: 1 }], action: { kind: 'job', job: TIMING_JOB } },
  ]
}
