// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The two thresholds used by every dead-letter sweep. */
export interface DeadLetterThreshold {
  value: number
  chosen: number | null
  source: string
}
export interface DeadLetterThresholds {
  days: DeadLetterThreshold
  count: DeadLetterThreshold
  restartRequired: false
  ownerDecided: true
  decision: { id: string; title: string | null; live: boolean } | null
  because: string | null
  lastChange: { by: { type: string; id: string; name: string | null }; at: string; field: string | null; from: string | null; to: string | null } | null
}

/** The warrant binds both effective values and the choice to save or remove. */
export function deadLetterThresholdWarrantFor(
  choice: { days: number | null; count: number | null; decision: string | null },
  effective: { days: number; count: number },
): string {
  return 'office.set-dead-letter-thresholds:' + JSON.stringify({
    days: effective.days, count: effective.count, chosenDays: choice.days, chosenCount: choice.count, decision: choice.decision,
  })
}
