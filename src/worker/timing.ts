// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { statSync } from 'node:fs'

import { clockStamp } from '@shared/time.ts'

/**
 * Output evidence comes from the output file's modification instant, read when the worker observes
 * the result. It is not continuous activity or the provider's exact answer time. No bytes means no
 * output evidence; a missing legacy stamp is never converted into a guessed instant.
 */
export function outputTiming(outputPath: string): Record<string, unknown> {
  let stat
  try {
    stat = statSync(outputPath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw err
  }
  if (stat.size === 0) return {}
  const lastOutputTime = clockStamp(() => stat.mtime)
  return { lastOutputAt: lastOutputTime.stamp, lastOutputTime, lastOutputTimeSource: 'output-file-mtime' }
}
