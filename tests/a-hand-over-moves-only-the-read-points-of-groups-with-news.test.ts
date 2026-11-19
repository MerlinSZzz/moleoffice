// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HAND-OVER MOVES THE READ POINT ONLY IN A GROUP THAT HAD SOMETHING NEW OR NO POINT, TELLS EACH PROJECT ONCE, AND
 * ANSWERS WITHOUT THE FULL READ UNLESS IT ASKS FOR IT.
 *
 * The answer of 31 October 2026 (wave 13y round 114, item 47), after the hand-over
 * (`GET /api/messages/groups?move=1&undelivered=1`) was measured on the made-up office shaped to the live counts of the
 * door's busiest caller: 923 groups, a read point in each, and nothing newer than the points.
 *   (a) The hand-over's answer leaves out `groups`, the full read, unless the caller adds `&groups=1`. Its two callers,
 *       the waiter and dsh's hook, read only `summary` and `text`. The busiest caller's answers, the full read with
 *       them, had a median of 889,574 bytes live, at 693 calls in a day.
 *   (b) A read point moves only in a group that gained a message or had no point. A group with nothing new has
 *       nothing unread, so it keeps its point, and the next read gives its old `since`. The busiest caller moved 923
 *       points at every hand-over, and nothing was new in any of them.
 *   (c) The pages are told once in each project where a point moved, never once for each group: one event for each
 *       group filled the event ring, which holds 200 by default, at every hand-over of that caller.
 *
 * THE FIXTURE is one agent in five groups in two projects, at a clock that stands still. Each group holds one message,
 * written at the start. Two groups in the first project hold a read point from before their message, so they have
 * something new. One group in each project holds a read point at its message, so it has nothing new. One group in the
 * second project has no read point. The hand-over is made a minute after the start.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_GROUPS_NEWS_AT_A_HAND_OVER } from '../src/shared/group-news.ts'
import { localStamp } from '../src/shared/time.ts'

const START = new Date('2026-10-31T06:00:00Z')
const AT_START = localStamp(START)
const BEFORE_START = localStamp(new Date(START.getTime() - 3_600_000))
const A_MINUTE_LATER = localStamp(new Date(START.getTime() + 60_000))
const SECOND = 'hand-over-second-project'
const AGENT = { kind: 'agent' as const, id: 'hand-over-reader' }
const AS_THE_AGENT = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'hand-over-handle' }

let t: TestDb
let app: FastifyInstance
let events: typeof import('../src/server/lib/events.ts')
const group: Record<'newsHere' | 'newsHereToo' | 'quietHere' | 'neverReadThere' | 'quietThere', string> = {
  newsHere: '',
  newsHereToo: '',
  quietHere: '',
  neverReadThere: '',
  quietThere: '',
}

interface TheAnswer {
  groups?: { group: { id: string }; since: string | null }[]
  summary: { readPointMoved: boolean }
  text: string
}

async function theDoor(url: string): Promise<TheAnswer> {
  const reply = await app.inject({ method: 'GET', url, headers: AS_THE_AGENT })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as TheAnswer
}

/** The agent's read point in each group, with the rowid that says whether its row was written again. */
function thePoints(): Map<string, { rowid: number; at: string }> {
  const rows = t.client.sqlite.prepare("SELECT rowid, pair, at FROM conversation_reads WHERE reader_kind = 'agent' AND reader_id = ?").all(AGENT.id) as {
    rowid: number
    pair: string
    at: string
  }[]
  return new Map(rows.map((one) => [one.pair, { rowid: one.rowid, at: one.at }]))
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: START })
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  events = await import('../src/server/lib/events.ts')
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  const { openAGroup } = await import('../src/server/lib/groups.ts')
  const { recordThatSomebodyRead } = await import('../src/server/lib/messages.ts')
  createWorkspace({ id: SECOND, title: 'Made-up second project' })
  t.client.sqlite
    .prepare('INSERT INTO agents (id, handle, name, created_at, avatar_asset_id) SELECT ?, ?, ?, ?, avatar_asset_id FROM agents LIMIT 1')
    .run(AGENT.id, 'hand-over-handle', 'Hand-over reader', AT_START)
  const person = { kind: 'person' as const, id: THE_PERSON }
  const open = (workspaceId: string, name: string): string => {
    const opened = openAGroup({ workspaceId, name, openedBy: person, because: 'To plan the greenhouse.', members: [person, AGENT].map((who) => ({ who, because: 'Works in the greenhouse.' })) })
    t.api.createRecord({ workspaceId, kind: 'message', title: 'Greenhouse aired', data: { body: 'The greenhouse was aired.', toGroup: opened.id }, actor: { type: 'human', id: THE_PERSON } })
    return opened.id
  }
  group.newsHere = open('default', 'News here')
  group.newsHereToo = open('default', 'More news here')
  group.quietHere = open('default', 'Quiet here')
  group.neverReadThere = open(SECOND, 'Never read there')
  group.quietThere = open(SECOND, 'Quiet there')
  recordThatSomebodyRead(AGENT, group.newsHere, AGENT, 'default', BEFORE_START)
  recordThatSomebodyRead(AGENT, group.newsHereToo, AGENT, 'default', BEFORE_START)
  recordThatSomebodyRead(AGENT, group.quietHere, AGENT, 'default', AT_START)
  recordThatSomebodyRead(AGENT, group.quietThere, AGENT, SECOND, AT_START)
}, 60_000)

afterAll(async () => {
  vi.useRealTimers()
  await app.close()
  t.close()
})

describe('a hand-over of group news', () => {
  let before = new Map<string, { rowid: number; at: string }>()
  let handedOver: TheAnswer | null = null
  let told: (string | null)[] = []

  beforeAll(async () => {
    before = thePoints()
    expect([...before.keys()].sort(), 'the fixture holds four read points').toEqual([group.newsHere, group.newsHereToo, group.quietHere, group.quietThere].sort())
    vi.setSystemTime(new Date(START.getTime() + 60_000))
    expect(localStamp(new Date()), 'the clock stands at the hand-over').toBe(A_MINUTE_LATER)
    const lastId = events.channelState().lastId
    handedOver = await theDoor(THE_GROUPS_NEWS_AT_A_HAND_OVER)
    told = events
      .since(lastId, 'default', AGENT)
      .events.map((one) => one.event)
      .flatMap((event) => (event.name === 'list.changed' && event.about?.id === AGENT.id ? [event.workspaceId] : []))
  })

  it('moves the read point to now in each group that had something new, and in the group that had none', () => {
    const after = thePoints()
    for (const id of [group.newsHere, group.newsHereToo, group.neverReadThere]) expect(after.get(id)?.at, `the point in ${id}`).toBe(A_MINUTE_LATER)
    expect(handedOver?.summary.readPointMoved).toBe(true)
  })

  it('keeps the read point, row and all, in each group that had nothing new, and the next read gives its old since', async () => {
    const after = thePoints()
    for (const id of [group.quietHere, group.quietThere]) expect(after.get(id), `the point in ${id}`).toEqual(before.get(id))
    const next = await theDoor('/api/messages/groups')
    const since = new Map((next.groups ?? []).map((one) => [one.group.id, one.since]))
    expect(since.get(group.quietHere)).toBe(AT_START)
    expect(since.get(group.quietThere)).toBe(AT_START)
    expect(since.get(group.newsHere)).toBe(A_MINUTE_LATER)
    expect(since.get(group.neverReadThere)).toBe(A_MINUTE_LATER)
  })

  it('tells the pages once in each project where a point moved', () => {
    expect(told.sort()).toEqual(['default', SECOND].sort())
  })

  it('answers without the full read, and with it when the hand-over asks for it', async () => {
    expect(handedOver).not.toHaveProperty('groups')
    // NOTHING IS NEW NOW, so the two hand-overs below move nothing and answer alike but for the full read.
    const points = thePoints()
    const without = await theDoor(THE_GROUPS_NEWS_AT_A_HAND_OVER)
    const withThem = await theDoor(`${THE_GROUPS_NEWS_AT_A_HAND_OVER}&groups=1`)
    expect(without).not.toHaveProperty('groups')
    expect(withThem.groups?.map((one) => one.group.id).sort()).toEqual(Object.values(group).sort())
    expect(withThem.summary).toEqual(without.summary)
    expect(withThem.text).toBe(without.text)
    expect(thePoints(), 'a hand-over with nothing new moves no point').toEqual(points)
  })
})
