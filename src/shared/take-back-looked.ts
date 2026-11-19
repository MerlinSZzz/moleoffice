// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER A PROBLEM'S TAKE-BACK ALREADY HOLDS `aPersonMustLook`.
 * `aPersonAlreadyLooked` was moved byte for byte out of src/server/lib/take-back.ts, with no change of
 * behaviour. That file imports it back and re-exports it.
 */

import type { PanelRecord } from './types.ts'

export function aPersonAlreadyLooked(problem: PanelRecord): boolean {
  return (problem.data['extra'] as { takeBack?: { aPersonMustLook?: unknown } } | undefined)?.takeBack?.aPersonMustLook !== undefined
}
