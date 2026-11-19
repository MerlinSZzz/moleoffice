// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { enWave13y } from '@shared/words/en-wave-13y.ts'
import { PanelError } from './panel-error.ts'
import { AGENT_CONVERSATIONS_CURSOR_INVALID, AGENT_CONVERSATIONS_CURSOR_PROJECT } from '@shared/refusal-codes.ts'
import { participantKey } from '@shared/messages.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { aBetweenAgentsReader, type ABetweenAgentsPlace, type ABetweenAgentsScanPlace, type APlacedBetweenAgentsRow } from './messages.ts'

/** The page size the chat asks for. */
export const AGENT_CONVERSATIONS_PAGE_SIZE = 25

interface APageCursor {
  last: string
  first: ABetweenAgentsPlace
  project: string | null
}

function readCursor(encoded: string | undefined, project: string | null): APageCursor | null {
  if (encoded === undefined) return null
  const invalid = (): never => {
    throw new PanelError(enWave13y['server.agentConversationsCursorInvalid'], 400, undefined, undefined, undefined,
      { code: AGENT_CONVERSATIONS_CURSOR_INVALID, values: {} })
  }
  if (encoded.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(encoded)) return invalid()
  let value: unknown
  try {
    const bytes = Buffer.from(encoded, 'base64url')
    if (bytes.toString('base64url') !== encoded) return invalid()
    value = JSON.parse(bytes.toString('utf8'))
  } catch {
    return invalid()
  }
  if (value === null || typeof value !== 'object') return invalid()
  const cursor = value as Partial<APageCursor>
  const first = cursor.first
  if (typeof cursor.last !== 'string' || (cursor.project !== null && typeof cursor.project !== 'string') ||
      first === undefined || first === null || typeof first.at !== 'string' ||
      !Number.isSafeInteger(first.rowid) || !Number.isSafeInteger(first.recipient)) return invalid()
  if (cursor.project !== project) {
    const all = enWave13y['server.agentConversationsAllProjects']
    const from = cursor.project ?? all
    const to = project ?? all
    throw new PanelError(enWave13y['server.agentConversationsCursorProject']
      .replace(/\{from\}|\{to\}/g, (slot) => slot === '{from}' ? from : to), 400, undefined, undefined, undefined,
      { code: AGENT_CONVERSATIONS_CURSOR_PROJECT, values: { from, to } })
  }
  return { last: cursor.last, first, project }
}

function placeOf(one: APlacedBetweenAgentsRow, project: string | null): APageCursor {
  return { last: one.row.last.sentAt, first: one.first, project }
}

/** The whole reader orders by newest line, then the first time it found the pair. */
function compare(a: APageCursor, b: APageCursor): number {
  return b.last.localeCompare(a.last) || a.first.at.localeCompare(b.first.at) ||
    a.first.rowid - b.first.rowid || a.first.recipient - b.first.recipient
}

function pairKey(one: APlacedBetweenAgentsRow): string {
  return one.row.between.map(participantKey).join('|')
}

/**
 * Find one page without constructing the whole conversation list. A recent message can lead to more than one pair,
 * and a notice can lead to the pair of the message it names. The shared reader settles those cases before the limit.
 * Rows with the boundary timestamp are all considered because the whole list keeps its original order for a tie.
 */
export function aPageOfAgentConversations(reader: ParticipantRef | null, workspaceId: string, project: string | null, encoded?: string) {
  const cursor = readCursor(encoded, project)
  const source = aBetweenAgentsReader(reader, workspaceId)
  const held = new Map<string, APlacedBetweenAgentsRow>()
  const collect = (agents: ParticipantRef[]): void => {
    for (const who of agents) {
      for (const one of source.involving(who)) {
        if (project !== null && !one.row.projects.includes(project)) continue
        const place = placeOf(one, project)
        if (cursor !== null && compare(place, cursor) <= 0) continue
        const key = pairKey(one)
        const previous = held.get(key)
        if (previous === undefined || compare(place, placeOf(previous, project)) < 0) held.set(key, one)
      }
    }
  }
  const ordered = (): APlacedBetweenAgentsRow[] => [...held.values()].sort((a, b) => compare(placeOf(a, project), placeOf(b, project)))
  const answer = (all: APlacedBetweenAgentsRow[]) => {
    const page = all.slice(0, AGENT_CONVERSATIONS_PAGE_SIZE)
    const last = page.at(-1)
    const next = all.length <= AGENT_CONVERSATIONS_PAGE_SIZE || last === undefined ? null : Buffer.from(JSON.stringify(placeOf(last, project))).toString('base64url')
    return { conversations: page.map((one) => one.row), page: { next } }
  }
  if (project !== null) {
    const agents = source.agentsInSparseProject(project)
    if (agents !== null) {
      collect(agents)
      return answer(ordered())
    }
  }
  let edge: ABetweenAgentsScanPlace | null = null
  let size = 128
  for (;;) {
    const batch = source.scan(edge, cursor?.last ?? null, size)
    collect(batch.agents)
    const all = ordered()
    const beyond = all[AGENT_CONVERSATIONS_PAGE_SIZE]
    if (batch.exhausted || batch.edge === null || (beyond !== undefined && batch.edge.at < beyond.row.last.sentAt)) {
      return answer(all)
    }
    edge = batch.edge
    size = Math.min(size * 2, 512)
  }
}
