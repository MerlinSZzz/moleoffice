// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { uniqueMomentOfStoredStampInZone } from './time.ts'

/** Original green must finish after both observed landing and original red, at unambiguous instants. */
export function originalGreenFollowsRepair({ endedAt, landedAt, originalEndedAtMs, timeZone }: {
  endedAt: unknown; landedAt: unknown; originalEndedAtMs: number | null; timeZone: string
}): boolean {
  if (typeof endedAt !== 'string' || typeof landedAt !== 'string' || originalEndedAtMs === null) return false
  const ended = uniqueMomentOfStoredStampInZone(endedAt, timeZone)
  const landed = uniqueMomentOfStoredStampInZone(landedAt, timeZone)
  return ended !== null && landed !== null && ended > landed && ended > originalEndedAtMs
}
