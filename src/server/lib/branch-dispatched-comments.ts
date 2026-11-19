// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The chat's new-agent press also carries comments held for a retired dispatch recipient. */
import { sqlite } from '../db/client.ts'
import { addMessage, createThread, dispatchThread, proofForStartingANewAgent, readThread } from './agents.ts'
import { withDispatchedAgentKeys } from '../db/with-dispatched-agent-keys.ts'
import { sayWhereADeliveryStands } from './messages.ts'
import { type RegisteredAgent } from './participants.ts'
import { agentForRecord } from '../db/agent-for-record.ts'
import { getRecord, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { theMessageWentToANewAgent } from '../../shared/messages.ts'

/**
 * THE COMMENTS HELD FOR A RETIRED DISPATCH RECIPIENT IN ONE PROJECT, oldest first, which the press
 * carries. None for an agent that is not retired.
 */
export function theCommentsHeldFor(old: RegisteredAgent, workspaceId: string): { id: string; threadId: string }[] {
  return old.retired ? (theCommentsHeldForThese([old.id], workspaceId).get(old.id) ?? []) : []
}

/** The same held comments grouped by recipient, for a reading about many agents. */
export function theCommentsHeldForThese(agentIds: readonly string[], workspaceId: string): Map<string, { id: string; threadId: string }[]> {
  const rows = sqlite.prepare(
    "SELECT a.agent_id AS agentId, m.id, m.thread_id AS threadId FROM agent_messages m JOIN agent_threads t ON t.id = m.thread_id " +
    "JOIN agent_records a ON a.record_id = CASE WHEN m.recipient_kind = 'agent' THEN m.recipient_session_id ELSE m.recipient_agent_id END " +
    "WHERE a.agent_id IN (SELECT value FROM json_each(?)) AND t.workspace_id = ? AND t.state <> 'abandoned' AND m.state = 'queued' AND m.role = 'human' " +
    'ORDER BY m.created_at, m.rowid',
  ).all(JSON.stringify(agentIds), workspaceId) as { agentId: string; id: string; threadId: string }[]
  const grouped = new Map<string, { id: string; threadId: string }[]>()
  for (const row of rows) {
    const comments = grouped.get(row.agentId) ?? []
    comments.push({ id: row.id, threadId: row.threadId })
    grouped.set(row.agentId, comments)
  }
  return grouped
}

export function branchDispatchedComments(
  old: RegisteredAgent,
  workspaceId: string,
  actor: Actor,
  chat: readonly { messageId: string; workspaceId: string; sentAt: string }[] = [],
) {
  const waiting = theCommentsHeldFor(old, workspaceId)
  if (waiting.length === 0) return null
  proofForStartingANewAgent(actor)
  // Read every source before writing. Both kinds travel in one run, ordered by their recorded time.
  const sources = waiting.map((one) => {
    const message = readThread(one.threadId, workspaceId).messages.find((row) => row.id === one.id)!
    // A MESSAGE CARRYING SEVERAL COMMENTS OF A SENT REVIEW is copied carrying the same comments with
    // the same quotes, in the same order. Its `quotes` hold one quote for
    // each comment in `carries`, in the same order, because both are read from the one stored list.
    const several = message.fromAnnotationId === null && message.carries.length > 1
    return {
      original: one.id as string | null, at: message.createdAt, carried: message.carries,
      input: {
        intent: message.intent, body: message.body, recipient: { kind: 'new' },
        ...(several
          ? { carries: message.carries.map((commentId, at) => ({ commentId, quote: message.quotes[at]! })) }
          : { context: message.context, fromAnnotationId: message.fromAnnotationId }),
      } as Parameters<typeof addMessage>[2],
    }
  })
  for (const one of chat) {
    if (sources.some((source) => source.carried.includes(one.messageId))) continue
    const message = getRecord(one.messageId)
    const body = message?.data['body']
    if (message?.kind !== 'message' || typeof body !== 'string') {
      throw new PanelError(`Message ${one.messageId} has no words to carry to the new agent. Nothing was sent.`, 400)
    }
    sources.push({ original: null, at: one.sentAt, carried: [one.messageId], input: {
      intent: 'discuss', body, recipient: { kind: 'new' },
      context: { target: { kind: 'record', recordId: one.messageId, workspaceId: one.workspaceId } },
    } })
  }
  sources.sort((a, b) => a.at.localeCompare(b.at))
  return withDispatchedAgentKeys(() => {
    const thread = createThread({ workspaceId, title: `Comments waiting for ${old.name}`, mode: 'direct' }, actor)
    const copiesOf = new Map<string, string>()
    const moved: string[] = []
    for (const one of sources) {
      const copy = addMessage(thread.id, workspaceId, one.input, actor)
      if (one.original !== null) copiesOf.set(copy.id, one.original)
      moved.push(one.original ?? copy.id)
    }
    const sent = dispatchThread(thread.id, workspaceId, actor, copiesOf, { agent: old.id, handle: old.handle })
    const run = sent.runs[0]!
    const row = sqlite.prepare('SELECT agent_id FROM agent_runs WHERE id = ?').get(run.id) as { agent_id: string }
    const registered = agentForRecord(row.agent_id)!
    for (const one of chat) {
      sayWhereADeliveryStands(one.messageId, { kind: 'agent', id: old.id }, { mark: 'delivered', because: theMessageWentToANewAgent(old.handle, registered.handle) })
    }
    return {
      agent: row.agent_id, handle: registered.handle, branchedFrom: old.handle, moved,
      says: sent.note,
    }
  })
}
