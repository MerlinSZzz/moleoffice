// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A page of agent conversations can be extended without drawing an old project's answer. */
import { expect, it } from 'vitest'
import type { ShortBetweenAgentsRow } from '../src/shared/short-lists.ts'
import { betweenAgentsPagePath, firstBetweenAgentPage, nextBetweenAgentPage } from '../src/web/lib/between-agent-pages.ts'

function row(left: string, right: string, count: number): ShortBetweenAgentsRow {
  return {
    between: [{ kind: 'agent', id: left }, { kind: 'agent', id: right }],
    last: { id: `made-up-${left}-${right}`, body: 'made-up message' },
    newSince: count,
    anythingNew: count > 0,
    projects: ['made-up-project'],
  }
}

const first = row('made-up-a', 'made-up-b', 2)
const second = row('made-up-c', 'made-up-d', 0)
const third = row('made-up-e', 'made-up-f', 1)
const reply = (conversations: ShortBetweenAgentsRow[], next: string | null) => ({
  conversations, mayRead: true, because: 'made-up reason', workspaceId: 'made-up-workspace', page: { next },
})

it('asks for 25 short rows and carries an optional project and cursor', () => {
  const path = new URL(betweenAgentsPagePath('made-up project', 'made-up/cursor'), 'http://localhost')
  expect(path.pathname).toBe('/api/messages/between-agents')
  expect(Object.fromEntries(path.searchParams)).toEqual({ shape: 'page', limit: '25', project: 'made-up project', cursor: 'made-up/cursor' })
  const firstPath = new URL(betweenAgentsPagePath(null, null), 'http://localhost')
  expect(Object.fromEntries(firstPath.searchParams)).toEqual({ shape: 'page', limit: '25' })
})

it('appends an answer once and keeps its row order, counts and next cursor', () => {
  const started = firstBetweenAgentPage('made-up-project', reply([first, second], 'cursor-1'))
  const extended = nextBetweenAgentPage(started, 'made-up-project', 'cursor-1', reply([second, third], 'cursor-2'))
  expect(extended.reply.conversations).toEqual([first, second, third])
  expect(extended.next).toBe('cursor-2')
  expect(nextBetweenAgentPage(extended, 'made-up-project', 'cursor-1', reply([third], null))).toBe(extended)
})

it('ignores a late page for a project or cursor that is no longer shown', () => {
  const current = firstBetweenAgentPage('made-up-new-project', reply([first], 'new-cursor'))
  expect(nextBetweenAgentPage(current, 'made-up-old-project', 'new-cursor', reply([second], null))).toBe(current)
  expect(nextBetweenAgentPage(current, 'made-up-new-project', 'old-cursor', reply([second], null))).toBe(current)
  const complete = nextBetweenAgentPage(current, 'made-up-new-project', 'new-cursor', reply([second], null))
  expect(complete.next).toBeNull()
  expect(complete.reply.conversations).toEqual([first, second])
})
