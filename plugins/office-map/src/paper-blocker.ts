// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Rect } from './viewport.ts'

/** What a rect in the shared paper's arc is, to the close-up's debug reason. A rect can be in more
 * than one group (the same furniture rect is also a ground obstacle), so every membership is kept
 * instead of reporting whichever list happened to come first. */
export type PaperBlockerKind = 'other-body' | 'own-body' | 'furniture' | 'ground'

export function paperBlockerKinds(rect: Rect, groups: {
  others: readonly Rect[]; playBodies: readonly Rect[]; furniture: readonly Rect[]; ground: readonly Rect[]
}): PaperBlockerKind[] {
  const byKind: Record<PaperBlockerKind, readonly Rect[]> = {
    'other-body': groups.others, 'own-body': groups.playBodies, furniture: groups.furniture, ground: groups.ground,
  }
  return (Object.keys(byKind) as PaperBlockerKind[]).filter(kind => byKind[kind].includes(rect))
}
