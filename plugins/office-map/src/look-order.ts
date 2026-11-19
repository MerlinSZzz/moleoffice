// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// The exact ordered unique study recipes; source index * 3 + clothing choice.
export const lookOrder = [0,1,2,3,4,5,6,9,10,11,12,15,16,17,18,19,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,51,52,53,54,56] as const
// The number of colourings an agent made before the cut-off keeps choosing among, so appending looks never changes it.
export const looksBeforeCutoff = 43
// Agents made at or after this stored local stamp, in the form createdAt has, choose among the whole of lookOrder.
export const lookCutoff = '2026-11-18 00:00:00'
/** How many colourings an agent made at `createdAt` chooses among, out of a list of `total` colourings. */
export function lookCount(createdAt: string, total: number): number {
  return createdAt < lookCutoff ? looksBeforeCutoff : total
}
