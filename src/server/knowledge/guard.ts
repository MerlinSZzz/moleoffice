// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The guard around knowledge writes. Knowledge records use dedicated doors so their review and
 * workspace rules cannot be bypassed by an ordinary record write.
 */
import { KNOWLEDGE_WORDS } from '@shared/words/en-wave-13u.ts'
import { isKnowledgeKind } from '@shared/knowledge/constants.ts'
import { PanelError } from '../lib/panel-error.ts'

let depth = 0
/** Keep nested knowledge operations inside the guard until the outer write finishes, even on error. */
export function knowledgeWrite<T>(fn: () => T): T {
  depth++
  try { return fn() } finally { depth-- }
}
/** Refuse an ordinary write to a knowledge kind unless a dedicated knowledge operation is active. */
export function refuseOrdinaryKnowledgeWrite(kind: string): void {
  if (isKnowledgeKind(kind) && depth === 0) throw new PanelError(KNOWLEDGE_WORDS.onlyDoor, 403)
}
