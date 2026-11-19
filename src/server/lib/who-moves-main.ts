// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO IS MOVING MAIN IN A CHECKOUT NOW. Main has one writer at a time: an entry while it is landing, or an emergency push
 * while it is pushing (wave 13u round 82, item 16). A test holds its lane and not main, so it is not asked here. The state
 * machine's landing step and the emergency push door both ask these, and the merge tool reads the same states from the
 * queue's reply.
 */
import { sqlite } from '../db/client.ts'
import { MERGE_ENTRY_KIND } from '@shared/merge-queue.ts'
import { EMERGENCY_PUSH_KIND } from '@shared/emergency-push.ts'

/**
 * AN ENTRY OF THIS CHECKOUT THAT IS LANDING NOW, or null, other than `except`: one move of main at a time, whichever lane
 * each is in, because a documentation entry lands in a lane of its own, so a lane no longer keeps two landings of one
 * repository apart.
 */
export function theLandingIn(root: string, except: string | null = null): string | null {
  const rows = sqlite
    .prepare("SELECT id FROM records WHERE kind = ? AND deleted_at IS NULL AND json_extract(data, '$.state') = 'landing' AND json_extract(data, '$.changeset.root') = ? AND id IS NOT ?")
    .all(MERGE_ENTRY_KIND, root, except) as { id: string }[]
  return rows[0]?.id ?? null
}

/** AN EMERGENCY PUSH THAT IS MOVING MAIN IN THIS CHECKOUT NOW, or null. */
export function thePushMovingMainIn(root: string): string | null {
  const rows = sqlite
    .prepare("SELECT id FROM records WHERE kind = ? AND deleted_at IS NULL AND json_extract(data, '$.state') = 'pushing' AND json_extract(data, '$.root') = ?")
    .all(EMERGENCY_PUSH_KIND, root) as { id: string }[]
  return rows[0]?.id ?? null
}
