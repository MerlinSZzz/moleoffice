// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GROUPS DOOR AND THE BRIEF HAND OVER ONE SUMMARY OF A GROUP'S NEWS, PRINTED ONE WAY.
 *
 * An agent woken by its waiter used to hear nothing of its groups until its next start. The brief
 * worked out a summary of the groups' new messages, and GET /api/messages/groups answered the raw
 * messages with the sender as a reference only. Now the office works the summary out in one place
 * (`whatYourGroupsGained` in src/server/lib/group-news.ts), and one formatter in
 * src/shared/group-news.ts prints it. The brief and the door both carry it.
 *
 * WHAT IS PROVED HERE, with made-up agents and groups:
 *
 *   1. For the same reader, the door's summary is the brief's `newInYourGroups`, and the door's printed
 *      text is a part of the brief's opening, word for word.
 *   2. The door says who sent each message in words, as `whoSentIt`, beside the stored reference.
 *   3. `?move=1` answers the news and moves the read point, so a second read finds nothing new.
 *   4. A group the reader is not in is not read: none of its words are in the door's answer.
 *
 * THE READER IS A WORKER, so the rule on who may read a message applies to it as well.
 *
 * MUTATIONS (each after a green control run, then restored):
 *   - case 1: the door prints its text through a second formatter (the shared text with one word
 *     changed). Red.
 *   - case 2: the door leaves `whoSentIt` off each message. Red.
 *   - case 3: the door never moves the read point (`false` for `asked.move === '1'`). Red.
 *   - case 4: `whatTheGroupsGained` reads the groups the person is in instead of the groups the reader
 *     is in. Red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const READER = 'news-reader'
const WRITER = 'news-writer'

let t: TestDb
let server: Awaited<ReturnType<typeof apiApp>>

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
function asAgent(handle: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': WORKSPACE,
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
  }
}

/** Register an agent through the starter door and answer its registry id. */
async function started(handle: string, name: string): Promise<string> {
  const reply = await server.app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle, name, role: 'worker' },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { agent: { id: string } }).agent.id
}

/** Open a group of the person and these agents, and answer its id. */
async function aGroup(name: string, agentIds: string[]): Promise<string> {
  const opened = await server.app.inject({
    method: 'POST',
    url: '/api/groups',
    headers: AS_THE_PERSON,
    payload: {
      name,
      because: 'The seed trays are discussed here.',
      members: [
        { who: { kind: 'person', id: THE_PERSON }, because: 'The person opened it.' },
        ...agentIds.map((id) => ({ who: { kind: 'agent', id }, because: 'It works on the seed trays.' })),
      ],
    },
  })
  expect(opened.statusCode, opened.body).toBe(201)
  return (opened.json() as { group: { id: string } }).group.id
}

/** Write one message into a group, as these headers, and answer its id. */
async function said(groupId: string, body: string, headers: Record<string, string>): Promise<string> {
  const sent = await server.app.inject({
    method: 'POST',
    url: '/api/records',
    headers,
    payload: { kind: 'message', title: body.slice(0, 40), data: { body, toGroup: groupId } },
  })
  expect(sent.statusCode, sent.body).toBe(201)
  return (sent.json() as { record: { id: string } }).record.id
}

interface TheDoor {
  me: { kind: string; id: string }
  groups: { group: { id: string }; since: string | null; messages: { id: string; body: string; sentBy: unknown; whoSentIt?: string }[] }[]
  workspaceId: string
  summary: { readFor: string | null; readPointMoved: boolean; groups: { id: string; newest: { id: string; from: string }[] }[] }
  text: string
}

async function theDoor(query = ''): Promise<TheDoor> {
  const reply = await server.app.inject({ method: 'GET', url: `/api/messages/groups${query}`, headers: asAgent(READER) })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as TheDoor
}

const FROM_THE_PERSON = 'The seed trays for bench two came in this morning.'
const FROM_THE_WRITER = 'I watered tray six and labelled it.'
const ELSEWHERE = 'The greenhouse heater is off until Monday.'
let writerId = ''
let mine = ''
let theirs = ''
let writersMessage = ''

beforeAll(async () => {
  t = await freshDb()
  server = await apiApp()
  await server.app.ready()
  const readerId = await started(READER, 'News Reader')
  writerId = await started(WRITER, 'News Writer')
  const other = await started('news-bystander', 'News Bystander')
  mine = await aGroup('The seed tray crew', [readerId, writerId])
  theirs = await aGroup('The heater crew', [other])
  await said(mine, FROM_THE_PERSON, AS_THE_PERSON)
  writersMessage = await said(mine, FROM_THE_WRITER, asAgent(WRITER))
  await said(theirs, ELSEWHERE, AS_THE_PERSON)
}, 60_000)

afterAll(async () => {
  await server.app.close()
  t.close()
})

describe('the groups door and the brief hand over one summary, printed one way', () => {
  it('prints the same text and carries the same summary as the brief, for the same reader', async () => {
    const reply = await server.app.inject({ method: 'GET', url: '/api/brief', headers: asAgent(READER) })
    expect(reply.statusCode, reply.body).toBe(200)
    const brief = reply.json() as { head: string; newInYourGroups: unknown }
    const door = await theDoor()
    expect(door.text).toContain(FROM_THE_PERSON)
    expect(door.text).toContain(FROM_THE_WRITER)
    expect(brief.head).toContain(door.text)
    expect(door.summary).toEqual(brief.newInYourGroups)
  })

  it('says who sent each message in words', async () => {
    const door = await theDoor()
    const group = door.groups.find((one) => one.group.id === mine)
    const message = group?.messages.find((one) => one.id === writersMessage)
    expect(message, JSON.stringify(door.groups)).toBeDefined()
    expect(message?.whoSentIt).toBe(`agent ${WRITER} (News Writer, id ${writerId})`)
    expect(group?.messages.every((one) => typeof one.whoSentIt === 'string' && one.whoSentIt !== '')).toBe(true)
  })

  it('does not read a group the reader is not in', async () => {
    const door = await theDoor()
    expect(door.groups.map((one) => one.group.id)).not.toContain(theirs)
    expect(door.summary.groups.map((one) => one.id)).not.toContain(theirs)
    expect(JSON.stringify(door)).not.toContain(ELSEWHERE)
    expect(door.text).not.toContain('The heater crew')
  })

  it('moves the read point with ?move=1, so a second read finds nothing new', async () => {
    const moved = await theDoor('?move=1')
    expect(moved.summary.readPointMoved).toBe(true)
    expect(moved.text).toContain(FROM_THE_WRITER)
    const again = await theDoor()
    expect(again.summary.readPointMoved).toBe(false)
    expect(again.groups.find((one) => one.group.id === mine)?.messages).toEqual([])
    expect(again.summary.groups).toEqual([])
    expect(again.text).not.toContain(FROM_THE_WRITER)
  })
})
