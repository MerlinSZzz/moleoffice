// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { AgentTag, PersonalAgentMark } from '@shared/agent-tags.ts'
import { agentTagColourIsVisible } from '@shared/agent-tags.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { sqlite } from '../db/client.ts'
import { PanelError } from './panel-error.ts'

/** Read only the asking person's tags. An agent or unknown reader has no personal tags. */
export function personalAgentTags(reader: ParticipantRef | null): AgentTag[] {
  if (reader?.kind !== 'person') return []
  const row = sqlite.prepare('SELECT agent_tags FROM people WHERE id = ?').get(reader.id) as { agent_tags: string | null } | undefined
  if (row === undefined || row.agent_tags === null) return []
  try {
    const value: unknown = JSON.parse(row.agent_tags)
    if (Array.isArray(value)) return value as AgentTag[]
  } catch { /* The stored value cannot be read. */ }
  throw new PanelError('The personal agent tags could not be read.', 500, undefined, undefined, undefined, { code: 'agentTagsUnreadable', values: {} })
}

/** Build one lookup for a list, preserving the person's order. */
export function agentMarksFor(reader: ParticipantRef | null): Map<string, PersonalAgentMark[]> {
  const marks = new Map<string, PersonalAgentMark[]>()
  for (const tag of personalAgentTags(reader)) {
    for (const id of tag.agents) {
      const held = marks.get(id) ?? []
      held.push({ name: tag.name, colour: tag.colour })
      marks.set(id, held)
    }
  }
  return marks
}

export function keepPersonalAgentTags(reader: ParticipantRef | null, value: unknown): AgentTag[] {
  if (reader?.kind !== 'person') throw new PanelError('Only a registered person may keep personal agent tags.', 403, undefined, undefined, undefined, { code: 'agentTagsNeedPerson', values: {} })
  if (!Array.isArray(value) || value.length > 100) throw new PanelError('Send a list of at most 100 agent tags.', 400, undefined, undefined, undefined, { code: 'agentTagsNeedList', values: {} })
  const names = new Set<string>()
  const exists = sqlite.prepare('SELECT 1 FROM agents WHERE id = ?')
  const tags: AgentTag[] = value.map((item: unknown) => {
    if (item === null || typeof item !== 'object') throw new PanelError('Each agent tag needs a name, colour and list of agents.', 400, undefined, undefined, undefined, { code: 'agentTagsBadTag', values: {} })
    const tag = item as Record<string, unknown>
    if (typeof tag.name !== 'string' || tag.name.trim() === '' || tag.name.trim().length > 60) throw new PanelError('An agent tag name must have 1 to 60 characters.', 400, undefined, undefined, undefined, { code: 'agentTagsBadName', values: {} })
    const name = tag.name.trim()
    const key = name.toLocaleLowerCase()
    if (names.has(key)) throw new PanelError('Each agent tag needs a different name.', 400, undefined, undefined, undefined, { code: 'agentTagsDuplicateName', values: {} })
    names.add(key)
    if (typeof tag.colour !== 'string' || !agentTagColourIsVisible(tag.colour)) throw new PanelError('Choose a colour that can be seen on both light and dark backgrounds.', 400, undefined, undefined, undefined, { code: 'agentTagsBadColour', values: {} })
    if (!Array.isArray(tag.agents) || tag.agents.length > 10000 || tag.agents.some((id: unknown) => typeof id !== 'string' || !exists.get(id))) throw new PanelError('Each tagged agent must be registered in this office.', 400, undefined, undefined, undefined, { code: 'agentTagsUnknownAgent', values: {} })
    return { name, colour: tag.colour.toLowerCase(), agents: [...new Set(tag.agents as string[])] }
  })
  sqlite.prepare('UPDATE people SET agent_tags = ? WHERE id = ?').run(JSON.stringify(tags), reader.id)
  return tags
}
