// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { checkSubtraction, type LeftOutCounts, type LeftOutGroup, type RecipientsBucket } from '../src/shared/disclosure.ts'

export function recipientDisclosureForFixture(
  connected: number,
  recent: number,
  leftOut: number,
): { subtraction: LeftOutCounts; leftOutGroups: LeftOutGroup<RecipientsBucket>[] } {
  const subtraction: LeftOutCounts = {
    candidates: connected + recent + leftOut,
    carried: connected + recent,
    leftOut,
    shortened: 0,
  }
  const leftOutGroups: LeftOutGroup<RecipientsBucket>[] = [{
    cause: 'budget',
    bucket: 'recent_limit',
    count: leftOut,
    ids: Array.from({ length: leftOut }, (_, index) => `fixture-omitted-${String(index)}`),
  }]
  if (leftOutGroups.length !== 1) throw new Error('A recipient fixture must name its recent-limit bucket even when it is empty.')
  checkSubtraction('recipient answer fixture', subtraction, leftOutGroups)
  return { subtraction, leftOutGroups }
}
