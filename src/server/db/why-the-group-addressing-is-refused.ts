// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `whyTheGroupAddressingIsRefused` was moved byte for byte out of src/server/lib/groups.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import type { WhichProjects } from '@shared/which-projects.ts'
import { isMoleOffice, type ParticipantRef } from '@shared/participants.ts'
import { NOBODY_IS_IN_THAT_GROUP, YOU_ARE_NOT_IN_THAT_GROUP, noSuchGroup } from '@shared/groups.ts'
import { participantKey } from '@shared/messages.ts'
import { readGroup } from './read-group.ts'

/**
 * WHY A MESSAGE ADDRESSED TO A GROUP IS REFUSED, or null when it may be written.
 *
 * The shape half — that `toGroup` is a non-empty string, and that a message names a group or people
 * and never both — is `whyTheAddressingIsRefused` in lib/messages.ts, because the browser asks the
 * same questions before it sends. This is the half only the database can answer.
 *
 * A NON-MEMBER IS REFUSED. A group is a conversation with subscribers, and a line from somebody
 * outside it would appear among them with nothing saying they are not in it. Mole Office is the one
 * exception: its lines say what happened to the group, and putting the product in every group as a
 * member would make it a subscriber that reads everybody's mail.
 */
export function whyTheGroupAddressingIsRefused(
  groupId: string,
  which: WhichProjects,
  sender: ParticipantRef | null,
): string | null {
  const group = readGroup(groupId, which)
  if (group === null) return noSuchGroup(groupId)
  if (group.members.length === 0) return NOBODY_IS_IN_THAT_GROUP
  if (sender !== null && isMoleOffice(sender)) return null
  if (sender === null || !group.members.some((member) => participantKey(member.who) === participantKey(sender))) {
    return YOU_ARE_NOT_IN_THAT_GROUP
  }
  return null
}
