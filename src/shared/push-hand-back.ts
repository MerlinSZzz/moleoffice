// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A PUSH'S HAND-BACK PROBLEM KEEPS, READ BACK.
 * `thePushHandBackOf`, the `PushHandBackFacts` type and the zod shape both are made from were moved byte for
 * byte out of src/server/lib/emergency-push.ts, with no change of behaviour. That file re-exports the two
 * exported names.
 */

import { z } from 'zod'
import type { PanelRecord } from '@shared/types.ts'

const aPushHandBack = z.object({
  push: z.string().min(1),
  line: z.object({ kind: z.literal('agent'), id: z.string().min(1) }).nullable(),
  deadline: z.string().min(1).optional(),
  timeZone: z.string().min(1).optional(),
  dueAt: z.string().min(1).optional(),
})
export type PushHandBackFacts = z.infer<typeof aPushHandBack>

/**
 * WHAT A PUSH'S HAND-BACK PROBLEM KEEPS, read back: null when the problem holds no push's hand-back, and what is wrong
 * when it holds one that cannot be read. A problem filed before a push's hand-back had a deadline holds none.
 */
export function thePushHandBackOf(problem: PanelRecord): { facts: PushHandBackFacts } | { cannotBeRead: string } | null {
  const held = (problem.data['extra'] as { emergencyPushHandBack?: unknown } | undefined)?.emergencyPushHandBack
  if (held === undefined) return null
  const read = aPushHandBack.safeParse(held)
  return read.success ? { facts: read.data } : { cannotBeRead: `the emergency push's hand-back facts cannot be read: ${read.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}.` }
}
