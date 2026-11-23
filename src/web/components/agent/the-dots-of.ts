// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT'S PRESENCE READ, IN ONE PLACE. The chat reads the dots it draws here, and the agent picker reads here which
 * agents are working now, so a picker never calls an agent working that the chat draws without a green dot.
 */
import type { ParticipantKind } from '@shared/participants.ts'
import { api, type PresenceOnTheWire } from '../../api.ts'
import { currentWorkspace } from '../../lib/workspace.ts'

/** How many dots one read of `GET /api/presence?of=` asks for. The door answers at most 500. */
export const DOTS_IN_ONE_READ = 200

/**
 * The dots of these participants, in the project on screen, or none where the read answered for another one. The door
 * says which project it answered for (`workspaceId`). A read started before the page moved to another project answers
 * for the old one, and drawing it would show dots worked out somewhere else.
 */
export async function theDotsOf(whos: readonly { kind: ParticipantKind; id: string }[]): Promise<PresenceOnTheWire[]> {
  const project = currentWorkspace()
  const answers = await Promise.all(
    Array.from({ length: Math.ceil(whos.length / DOTS_IN_ONE_READ) }, (_, i) => api.presenceOf(whos.slice(i * DOTS_IN_ONE_READ, (i + 1) * DOTS_IN_ONE_READ))),
  )
  if (project !== currentWorkspace() || answers.some((one) => one.workspaceId !== project)) return []
  return answers.flatMap((one) => one.presence)
}
