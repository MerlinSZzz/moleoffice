// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE'S CLOCK, AS A STAMP.
 * `now` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour. That file
 * imports it back and re-exports it.
 */

import { nowStamp } from '@shared/time.ts'

export function now(): string {
  return nowStamp()
}
