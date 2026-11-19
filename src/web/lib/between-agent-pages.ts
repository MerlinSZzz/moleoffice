// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { participantKey } from '@shared/messages.ts'
import type { ShortBetweenAgentsReply } from '../api.ts'

export interface AgentConversationPage extends ShortBetweenAgentsReply {
  page: { next: string | null }
}

export interface AgentConversationPages {
  project: string | null
  next: string | null
  reply: AgentConversationPage
}

/** The chat asks for one short page for the currently chosen project. */
export function betweenAgentsPagePath(project: string | null, cursor: string | null): string {
  const query = new URLSearchParams({ shape: 'page', limit: '25' })
  if (project !== null) query.set('project', project)
  if (cursor !== null) query.set('cursor', cursor)
  return `/api/messages/between-agents?${query}`
}

export function firstBetweenAgentPage(project: string | null, reply: AgentConversationPage): AgentConversationPages {
  return { project, next: reply.page.next, reply }
}

/** A late answer for an earlier project or cursor cannot change the list now shown. */
export function nextBetweenAgentPage(
  held: AgentConversationPages,
  project: string | null,
  cursor: string,
  reply: AgentConversationPage,
): AgentConversationPages {
  if (held.project !== project || held.next !== cursor) return held
  if (!reply.mayRead) return firstBetweenAgentPage(project, reply)
  const key = (one: AgentConversationPage['conversations'][number]): string => JSON.stringify(one.between.map(participantKey).sort())
  const seen = new Set(held.reply.conversations.map(key))
  const conversations = [...held.reply.conversations]
  for (const one of reply.conversations) {
    const id = key(one)
    if (!seen.has(id)) { seen.add(id); conversations.push(one) }
  }
  return { project, next: reply.page.next, reply: { ...reply, conversations } }
}
