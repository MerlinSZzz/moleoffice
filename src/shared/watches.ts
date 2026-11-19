// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WATCH: THE CLOSED LISTS. KIND_SPECS.watch in ./kinds.ts holds its fields; this file holds the words two of them
 * may take, as ./bookings.ts does for a booking.
 *
 * Item 38 of wave 13s's requirements: a watch or timer an agent keeps
 * running is a record, so that after a compaction, a new conversation or a restart one look shows which watch should
 * be running and is not. The record says so in its own words; the office does not run or look at the watch itself.
 *
 * NOTHING HERE TOUCHES THE DATABASE, because the browser imports it.
 */

/** The kind word, in one place. */
export const WATCH_KIND = 'watch'

/**
 * HOW A WATCH RUNS: as a background task its agent's own tool keeps, as a timer of the computer's system, or as a group
 * of processes its agent started.
 */
export const WATCH_RUNS_AS = ['background_task', 'system_timer', 'process_group'] as const
export type WatchRunsAs = (typeof WATCH_RUNS_AS)[number]

/**
 * WHERE A WATCH STANDS. `running` while it should be running; `stopped` when it stopped before its end; `ended` when
 * its end came. A watch that ended as planned is not one that stopped short, so the two are two words.
 */
export const WATCH_STATES = ['running', 'stopped', 'ended'] as const
export type WatchState = (typeof WATCH_STATES)[number]
