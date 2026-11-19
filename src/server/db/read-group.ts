// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `readGroup` was moved byte for byte out of src/server/lib/groups.ts, with no change of behaviour.
 * `refOf` was moved byte for byte out of src/server/lib/groups.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { eq } from 'drizzle-orm'
import { db } from './client.ts'
import { groups } from './schema.ts'
import type { WhichProjects } from '@shared/which-projects.ts'
import type { GroupOnTheWire } from '@shared/groups.ts'
import { membersOf } from './members-of.ts'
import { isParticipantKind, type ParticipantRef } from '@shared/participants.ts'

/**
 * One group with its members, or null because nothing in the projects asked about answers to that id.
 *
 * WHICH PROJECTS IS SAID OUT LOUD, and every group route says `EVERY_PROJECT`. Decision
 * `t5DlN5-uTZoT`: a group follows the conversations, so it belongs to the person and not to the
 * project on screen. The row still carries the project it was opened in, and that is what a screen
 * draws; it is no longer what decides whether the group can be seen. Problem `m1ea9ihnnu9e`.
 */
export function readGroup(id: string, which: WhichProjects): GroupOnTheWire | null {
  const row = db.select().from(groups).where(eq(groups.id, id)).get()
  if (row === undefined) return null
  if ('oneProject' in which && row.workspaceId !== which.oneProject) return null
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    about: row.about,
    openedBy: refOf(row.openedByKind, row.openedById),
    openedBecause: row.openedBecause,
    openedAt: row.openedAt,
    members: membersOf(row.id),
  }
}
/** A participant reference off two stored columns. */
export function refOf(kind: string, id: string): ParticipantRef {
  return { kind: isParticipantKind(kind) ? kind : 'agent', id }
}
