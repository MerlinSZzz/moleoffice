// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
export const CHECKPOINT_RUNTIMES = Object.freeze(['claude-code', 'codex', 'opencode'])
/** New sandbox runs opt in at creation. Older runs and their older letters keep their existing policy. */
/** @param {string} runtime */
export function checkpointRunFields(runtime) {
  return CHECKPOINT_RUNTIMES.includes(runtime) ? { extra: { officeCheckpoint: true } } : {}
}

/** @param {Record<string, any>} data */
export function aCheckpointRun(data) { return data?.extra?.officeCheckpoint === true }

export const CHECKPOINT_LETTERS = 8
export const CHECKPOINT_TEXT = 24_000
export const CHECKPOINT_RECORD_BYTES = 48_000

/**
 * OpenCode's `tool_output.max_lines` and `tool_output.max_bytes` defaults, read from OpenCode 1.18.31: a tool reply at
 * most this many lines and this many UTF-8 bytes is kept whole. A longer reply is cut after whole lines and the rest
 * is saved to a file, where the worker does not read it.
 */
export const OPENCODE_TOOL_OUTPUT_MAX_LINES = 2_000
export const OPENCODE_TOOL_OUTPUT_MAX_BYTES = 51_200
