// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { ParticipantRef } from './participants.ts'

export interface EntryEndFacts {
  agent: { id: string; retired?: boolean; startedBy?: ParticipantRef | null } | null
  submittedBy: ParticipantRef | null
}

/** Existing entry-end order: live author, recorded starter, then submitter, once per stored identity. */
export function entryEndRecipients({ agent, submittedBy }: EntryEndFacts, canonicalAgentId: (stored: string) => string): ParticipantRef[] {
  const to: ParticipantRef[] = []
  const add = (who: ParticipantRef | null | undefined): void => {
    if (who == null || who.kind !== 'agent') return
    const id = canonicalAgentId(who.id)
    if (!to.some(one => one.id === id)) to.push({ kind: 'agent', id })
  }
  if (agent !== null && agent.retired !== true) add({ kind: 'agent', id: agent.id })
  add(agent?.startedBy)
  add(submittedBy)
  return to
}
