// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT'S SIDE LIST IS ONE LIST ACROSS EVERY PROJECT, EACH ROW MARKED WITH ITS PROJECTS, LATEST FIRST.
 *
 * A decision took option A: one list, each conversation marked with its project, filtered by
 * project. Messages belong to no project and keep a mark of the project they were written in
 * and, when the writer said so, the project they are about. This file writes conversations in
 * three projects and reads the three lists the side list draws (contacts, groups, conversations between agents) as the
 * page reads them, from a page in a fourth.
 *
 *   1. One list across two projects: every list holds the conversations of both projects, whichever project asks.
 *   2. Agent contacts carry their own projects; groups and between-agent conversations carry message projects.
 *      Conversation marks still show two names and "+N" where needed.
 *   3. The filter keeps an agent contact under its own projects, independently of where messages were written.
 *   4. Unread counts are unchanged: each row counts every unread message whatever project it was written in, the circle
 *      is the sum of the rows, and reading one message in one project lowers its row by one.
 *
 * WHAT MAKES IT RED (each run with a control first, the logs in .scratch/r47):
 *   - The between-agents door reading the asking project's messages only (`conversationsBetweenAgents({ oneProject:
 *     workspaceId }, me)` in src/server/api/messages.ts) → case 1.
 *   - `theProjectsWithANewerMessage` in src/shared/messages.ts putting the newer message's projects last → cases 2 and 4.
 *   - `PROJECT_NAMES_ON_A_ROW` in src/web/lib/projectmarks.ts made 3 → case 2.
 *   - `inTheChosenProject` in src/web/lib/projectmarks.ts asking only a row's latest project → case 3.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import type { WorkspaceReading } from '../src/shared/workspaces.ts'
import { inTheChosenProject, theMarkToDraw } from '../src/web/lib/projectmarks.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const as = (project: string | null, who: { kind: 'human' | 'agent'; id: string } = { kind: 'human', id: THE_PERSON }): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-actor-type': who.kind,
  'x-mole-office-actor-id': who.id,
  ...(project === null ? {} : { 'x-mole-office-workspace': project }),
})
const agent = (id: string) => ({ kind: 'agent' as const, id })

/** One request, answered below 300, or `expected` when the caller names it. */
async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: object, expected?: number): Promise<Record<string, any>> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  if (expected === undefined) expect(reply.statusCode, `${method} ${url}: ${reply.body}`).toBeLessThan(300)
  else expect(reply.statusCode, `${method} ${url}: ${reply.body}`).toBe(expected)
  return JSON.parse(reply.body) as Record<string, any>
}

/** One message from `from`, written on a page of `project` (null: no project named), to `to`, answered as `call` checks. */
async function say(project: string | null, from: string, to: { kind: string; id: string }, body: string, extra: Record<string, unknown> = {}, expected?: number): Promise<string> {
  const made = await call('POST', '/api/records', as(project, agent(from)), { kind: 'message', title: body.slice(0, 40), data: { body, to: [to], ...extra } }, expected)
  return made['record'].id as string
}

const PROJECTS = [
  ['orchard', 'Test: Orchard'],
  ['harbour', 'Test: Harbour'],
  ['lantern', 'Test: Lantern'],
  ['elsewhere', 'Test: Elsewhere'],
] as const
let known: WorkspaceReading[] = []
let groupId = ''
const ids: Record<string, string> = {}
/** Each agent's participant id, which is the id a contact row names it by. */
const rid: Record<string, string> = {}
const THE_FOUR = ['marked-three', 'only-orchard', 'only-harbour', 'no-project']

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const [id, title] of PROJECTS) await call('POST', '/api/workspaces', as(null), { id, title })
  for (const handle of [...THE_FOUR, 'pair-a', 'pair-b', 'pair-c', 'group-writer']) {
    await call('POST', '/api/agents/started', as('orchard'), { handle, name: handle, role: 'worker' })
    rid[handle] = String((await call('GET', `/api/participants/agent/${handle}`, as('orchard')))['participant'].id)
  }
  const owner = { kind: 'person', id: THE_PERSON }
  // A CONVERSATION IN THREE PROJECTS: written in orchard, then in harbour, then in harbour about lantern.
  ids['three-1'] = await say('orchard', 'marked-three', owner, 'Test: first, in orchard.')
  ids['three-2'] = await say('harbour', 'marked-three', owner, 'Test: second, in harbour.')
  ids['three-3'] = await say('harbour', 'marked-three', owner, 'Test: third, in harbour, about lantern.', { aboutProject: 'lantern' })
  // ONE CONVERSATION IN EACH OF TWO PROJECTS, and one whose message names no project.
  ids['orchard'] = await say('orchard', 'only-orchard', owner, 'Test: only in orchard.')
  ids['harbour'] = await say('harbour', 'only-harbour', owner, 'Test: only in harbour.')
  ids['none'] = await say(null, 'no-project', owner, 'Test: written where no project was named.')
  // BETWEEN TWO AGENTS, two conversations in two projects, by agents of their own so the four rows above stay as written.
  // NOTHING HOLDS pair-b OR pair-c IN THE TEST OFFICE, so the office stores each message, routes it and answers 409. The
  // messages are stored all the same, and the between-agents list reads them.
  await say('orchard', 'pair-a', agent('pair-b'), 'Test: between two agents, in orchard.', {}, 409)
  await say('harbour', 'pair-a', agent('pair-c'), 'Test: between two agents, in harbour.', {}, 409)
  // TWO GROUPS, opened from pages of two projects, each written in once.
  for (const [project, name] of [['orchard', 'Test: the orchard group'], ['harbour', 'Test: the harbour group']] as const) {
    const made = await call('POST', '/api/groups', as(project), {
      name,
      because: 'a group in the one list',
      members: [
        { who: { kind: 'person', id: THE_PERSON }, because: 'the owner reads it' },
        { who: agent('group-writer'), because: 'it writes in it' },
      ],
    })
    if (project === 'orchard') groupId = made['group'].id as string
    await call('POST', '/api/records', as(project, agent('group-writer')), { kind: 'message', title: name, data: { body: `${name}: a line.`, toGroup: made['group'].id } })
  }
  known = (await call('GET', '/api/workspaces', as(null)))['workspaces'] as WorkspaceReading[]
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** The three lists, as a page standing in `project` reads them. */
async function theLists(project: string) {
  const contacts = await call('GET', '/api/messages/contacts', as(project))
  const groups = await call('GET', '/api/groups?shape=page', as(project))
  const between = await call('GET', '/api/messages/between-agents?shape=page', as(project))
  const contactOf = (handle: string) => (contacts['contacts'] as any[]).find((one) => one.who?.id === rid[handle])
  return { contacts, groups, between, contactOf }
}

describe("the chat's side list across projects", () => {
  it('1. holds the conversations of every project in each of its three lists, whichever project the page is in', async () => {
    for (const project of ['orchard', 'elsewhere']) {
      const { contactOf, groups, between } = await theLists(project)
      expect(contactOf('only-orchard')?.last?.id, `${project}: the contact from orchard`).toBe(ids['orchard'])
      expect(contactOf('only-harbour')?.last?.id, `${project}: the contact from harbour`).toBe(ids['harbour'])
      const groupNames = (groups['groups'] as any[]).map((one) => one.name)
      expect(groupNames, `${project}: the groups`).toEqual(expect.arrayContaining(['Test: the orchard group', 'Test: the harbour group']))
      const pairs = (between['conversations'] as any[]).map((one) => one.projects)
      expect(pairs, `${project}: the conversations between agents`).toEqual(expect.arrayContaining([['orchard'], ['harbour']]))
    }
  })

  it('2. marks agent contacts with membership and conversation rows with message projects', async () => {
    const { contactOf, groups, between } = await theLists('elsewhere')
    expect(contactOf('marked-three')?.projects).toEqual(['orchard'])
    expect(contactOf('only-orchard')?.projects).toEqual(['orchard'])
    expect(contactOf('only-harbour')?.projects).toEqual(['orchard'])
    expect(contactOf('no-project')?.projects).toEqual(['orchard'])
    expect((groups['groups'] as any[]).find((one) => one.id === groupId)?.projects).toEqual(['orchard'])
    expect((between['conversations'] as any[]).every((one) => Array.isArray(one.projects) && one.projects.length === 1)).toBe(true)
    // WHAT THE ROW DRAWS: names, not ids, two of them, and how many more.
    expect(theMarkToDraw(['lantern', 'harbour', 'orchard'], known)).toEqual({
      names: ['Test: Lantern', 'Test: Harbour'],
      more: 1,
      all: ['Test: Lantern', 'Test: Harbour', 'Test: Orchard'],
    })
    expect(theMarkToDraw(contactOf('only-orchard').projects, known)).toEqual({ names: ['Test: Orchard'], more: 0, all: ['Test: Orchard'] })
    expect(theMarkToDraw([], known)).toEqual({ names: [], more: 0, all: [] })
    // AND NOTHING BEFORE THE PROJECTS ARE READ: an id is a key, not a name.
    expect(theMarkToDraw(['orchard'], [])).toEqual({ names: [], more: 0, all: [] })
  })

  it('3. the filter keeps an agent contact under its membership projects', async () => {
    const { contactOf } = await theLists('elsewhere')
    const shown = (chosen: string | null) => THE_FOUR.filter((handle) => inTheChosenProject(contactOf(handle), chosen)).sort()
    expect(shown(null)).toEqual(['marked-three', 'no-project', 'only-harbour', 'only-orchard'])
    expect(shown('orchard')).toEqual(['marked-three', 'no-project', 'only-harbour', 'only-orchard'])
    expect(shown('harbour')).toEqual([])
    expect(shown('lantern')).toEqual([])
  })

  it('4. leaves the unread counts as they were: every project counted, the circle the sum, a read lowers its row', async () => {
    const before = await theLists('elsewhere')
    expect(before.contactOf('marked-three').unread).toBe(3)
    expect(before.contactOf('only-orchard').unread).toBe(1)
    expect(before.contactOf('only-harbour').unread).toBe(1)
    const sum = (before.contacts['contacts'] as any[]).reduce((n, one) => n + one.unread, 0)
    expect(before.contacts['unread'].messages).toBe(sum)
    const circle = await call('GET', '/api/messages/circle', as('orchard'))
    expect(circle['unread']).toEqual(before.contacts['unread'])
    await call('POST', `/api/messages/${ids['three-1']}/mark`, as('lantern'), { mark: 'seen' })
    const after = await theLists('harbour')
    expect(after.contactOf('marked-three').unread).toBe(2)
    expect(after.contactOf('marked-three').projects, 'reading changes no mark').toEqual(['orchard'])
    expect(after.contacts['unread'].messages).toBe(sum - 1)
  })
})
