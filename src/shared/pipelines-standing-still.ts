// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PIPELINES THAT STAND STILL, AS HOME'S LATE OR STUCK IS TOLD THEM. Wave 13s round 281, point HD-2e of home as a
 * data dashboard. The one statement that works out which pipelines stand still is
 * src/server/lib/pipelines-standing-still.ts, and the door is GET /api/pipelines/standing-still
 * (src/server/api/pipelines-standing-still.ts).
 */

/** One pipeline that stands still: it has a step that is not done, and every step of it that is not done is paused. */
export interface APipelineStandingStill {
  id: string
  title: string
  workspaceId: string
  /** How many of its steps are not done. Every one of them is paused. */
  unfinished: number
}

/**
 * WHAT THE DOOR ANSWERS, for the project the request names: at most as many pipelines as Late or stuck draws, newest
 * first and then by id, and how many stand still in all. With no pipeline standing still, `rows` is empty and `total`
 * is 0.
 */
export interface PipelinesStandingStill {
  rows: APipelineStandingStill[]
  total: number
}

/**
 * WHAT JAVASCRIPT'S trim() TAKES OFF, every character of it, for SQLite's trim(X, Y), which takes off only a space
 * when it is given no set. Worked out from trim() itself rather than typed, so the statement trims a step's id, its
 * state and its pause exactly as src/shared/blocks.ts and src/shared/work.ts do. No such character is past U+FFFF.
 */
export const WHAT_TRIM_TAKES_OFF: string = Array.from({ length: 0x10000 }, (_, code) => String.fromCharCode(code))
  .filter((one) => one.trim() === '')
  .join('')
