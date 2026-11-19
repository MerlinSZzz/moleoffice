// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `membersOf` was moved byte for byte out of src/server/lib/groups.ts, with no change of behaviour.
 * `membersOfMany` was moved byte for byte out of src/server/lib/groups.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import type { GroupMemberOnTheWire } from '@shared/groups.ts'
import { and, asc, inArray, isNull } from 'drizzle-orm'
import { db } from './client.ts'
import { readInPieces } from './in-pieces.ts'
import { groupMembers } from './schema.ts'
import { refOf } from './read-group.ts'

/** Everybody in one group now, oldest join first. Somebody who has left is not here. */
export function membersOf(groupId: string): GroupMemberOnTheWire[] {
  return membersOfMany([groupId]).get(groupId) ?? []
}
/**
 * EVERYBODY IN EACH OF THESE GROUPS NOW, keyed by group id, by the rule `membersOf` states. A group with nobody in it
 * has no entry.
 *
 * ONE READ FOR ALL OF THEM, because the group list asked once per group: 62 reads of the membership table for one
 * GET /api/groups on an office of 31 groups (wave 13y round 13). Rows come back oldest join first across every group,
 * so each group's own list keeps that order.
 */
export function membersOfMany(groupIds: readonly string[]): Map<string, GroupMemberOnTheWire[]> {
  const out = new Map<string, GroupMemberOnTheWire[]>()
  // IN PIECES (src/server/db/in-pieces.ts): the groups are as many as the office has opened. A group's
  // rows all come from one piece, so its own list keeps the order.
  const rows = readInPieces(groupIds, (piece) =>
    db
      .select()
      .from(groupMembers)
      .where(and(inArray(groupMembers.groupId, piece), isNull(groupMembers.leftAt)))
      .orderBy(asc(groupMembers.joinedAt), asc(groupMembers.id))
      .all(),
  )
  for (const row of rows) {
    const held = out.get(row.groupId) ?? []
    held.push({ who: refOf(row.memberKind, row.memberId), joinedAt: row.joinedAt, joinedBecause: row.joinedBecause })
    out.set(row.groupId, held)
  }
  return out
}
