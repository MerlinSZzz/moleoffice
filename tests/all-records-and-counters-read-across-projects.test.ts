// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ALL RECORDS AND COUNTERS READ ACROSS PROJECTS, AT THE DOORS. On 29 September 2026 the owner decided that
 * the general pages stand under All projects and read across projects.
 *
 * WHAT THIS FILE PROVES, door by door:
 *
 *   GET /api/records, GET /api/search and GET /api/counters (and GET /api/counters/:id) each take
 *   `?projects=all` or `?projects=<project id>` (src/shared/across-projects.ts).
 *
 *   1. ROWS FROM TWO PROJECTS. `?projects=all` answers the rows of both projects, each row carrying
 *      its own `workspaceId`, and every row's project is one `theProjectsAReaderMayRead` names.
 *   2. ONE PROJECT CHOSEN. `?projects=robotics` answers only that project's rows, whatever project
 *      the header names.
 *   3. THE OLD READING IS UNCHANGED. A request with no `projects` word answers exactly what it did,
 *      from the header's project: it is compared whole with the same project asked by name.
 *   4. THE COUNTS ADD UP ACROSS PROJECTS: `matched` and the group counts across every project are the
 *      sums of each project's own.
 *   5. A READER WHO MAY NOT READ SOMETHING SEES NONE OF IT. No rule keeps a reader out of a whole
 *      project today (src/shared/disclosure.ts; the secretary's message Ux8NxlYa-f4o), so the rule that is
 *      true is the message rule: an agent reading every project sees no
 *      message it is no party to, in any project, and the person sees it. Counters list no messages,
 *      so for them the reply says `narrowedByPermission: null` and every counter's project is one the
 *      reader may read.
 *   6. A PROJECT ID THAT NAMES NOTHING IS REFUSED in words, never answered as an empty list.
 *
 * The data is made up: two projects, a few records, two counters and one message between two made-up
 * agents in the second project. The commit that adds this file names every mutation and its runs.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HERE = 'default'
const THERE = 'robotics'

let t: TestDb
let app: FastifyInstance

const PERSON_HERE = { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const PERSON_THERE = { ...PERSON_HERE, 'x-mole-office-workspace': THERE }
const agentHere = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': HERE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

/** The words the private message carries, found nowhere else, so a reply holding them holds the message. */
const PRIVATE_WORDS = 'kelpforest-a-line-only-bo-may-read'
const PRIVATE_TITLE = 'Kelp forest ledger for bo'

async function get(url: string, headers: Record<string, string>): Promise<{ status: number; body: string; json: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'GET', url, headers })
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, body: reply.body, json }
}

async function post(url: string, payload: unknown, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url, headers: { ...headers, 'content-type': 'application/json' }, payload: payload as never })
  expect(reply.statusCode, reply.body).toBeLessThan(300)
  return reply.json() as Record<string, unknown>
}

/** Register one agent as the person and give back its registry id. */
async function anAgent(handle: string): Promise<string> {
  await post('/api/records', { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' } }, PERSON_HERE)
  const listed = (await get('/api/participants', PERSON_HERE)).json as { agents?: { id: string; handle: string }[] }
  const row = (listed.agents ?? []).find((one) => one.handle === handle)
  if (row === undefined) throw new Error(`the agent ${handle} was registered and is not listed`)
  return row.id
}

type Row = { id: string; title: string; kind: string; workspaceId: string }
type ListReply = { records: Row[]; matched: number; tally?: { everything: number; families: Record<string, number> }; projects?: string[]; narrowedByPermission?: unknown }

let message = ''
let counterHere = ''
let counterThere = ''

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await post('/api/workspaces', { id: THERE, title: 'Robotics' }, PERSON_HERE)

  // RECORDS IN BOTH PROJECTS, three here and two there, of two groups of kinds.
  for (const title of ['Seed tray notes', 'Fan speed notes']) await post('/api/records', { kind: 'note', title }, PERSON_HERE)
  await post('/api/records', { kind: 'idea', title: 'A cooler bench for the trays', data: {} }, PERSON_HERE)
  await post('/api/records', { kind: 'note', title: 'Gripper calibration notes' }, PERSON_THERE)
  await post('/api/records', { kind: 'idea', title: 'A softer gripper pad', data: {} }, PERSON_THERE)

  // ONE MESSAGE BETWEEN TWO MADE-UP AGENTS, in the second project. dee is no party to it.
  await anAgent('ada-across-writer')
  const bo = await anAgent('bo-across-reader')
  await anAgent('dee-across-bystander')
  message = t.api.createRecord({
    kind: 'message',
    title: PRIVATE_TITLE,
    workspaceId: THERE,
    data: { body: PRIVATE_WORDS, to: [{ kind: 'agent', id: bo }] },
    actor: { type: 'agent', id: 'ada-across-writer' } as never,
  }).id

  // ONE COUNTER IN EACH PROJECT, filed by a registered agent through the counters' own door.
  const keeper = await anAgent('across-counter-keeper')
  void keeper
  const counter = (workspace: string, title: string) =>
    post(
      '/api/counters',
      { title, counts: `Trials counted for ${title}.`, triggers: [{ kind: 'count', n: 5 }], action: { kind: 'task', title: `Look at ${title}` } },
      { ...agentHere('across-counter-keeper'), 'x-mole-office-workspace': workspace },
    ).then((made) => (made['counter'] as { id: string }).id)
  counterHere = await counter(HERE, 'Tray trials')
  counterThere = await counter(THERE, 'Gripper trials')
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

/** The ids GET /api/workspaces lists, which is every project a reader may read today. */
async function theProjectIds(): Promise<string[]> {
  const listed = (await get('/api/workspaces', PERSON_HERE)).json as { workspaces: { id: string }[] }
  return listed.workspaces.map((one) => one.id)
}

// ============================================================================ GET /api/records

describe('GET /api/records across projects', () => {
  it('answers the rows of both projects with ?projects=all, each naming its project', async () => {
    const reply = (await get('/api/records?projects=all&shape=light', PERSON_HERE)).json as ListReply
    const titles = reply.records.map((row) => row.title)
    expect(titles).toContain('Seed tray notes')
    expect(titles).toContain('Gripper calibration notes')
    expect(reply.records.find((row) => row.title === 'Gripper calibration notes')?.workspaceId).toBe(THERE)
    expect(reply.records.find((row) => row.title === 'Seed tray notes')?.workspaceId).toBe(HERE)
    const mayRead = await theProjectIds()
    // EVERY ROW BUT A MESSAGE NAMES A PROJECT THE READER MAY READ. A message is kept in the message centre and belongs to no
    // project; it is listed because it is in the view of one.
    for (const row of reply.records.filter((one) => one.kind !== 'message')) expect(mayRead, `a row of ${row.workspaceId}`).toContain(row.workspaceId)
    for (const row of reply.records.filter((one) => one.kind === 'message')) expect(row.workspaceId, row.title).toBe('message-centre')
    expect(reply.projects).toEqual(mayRead)
    expect(reply.narrowedByPermission).toBeNull()
  })

  it('answers only the chosen project with ?projects=robotics, whatever the header names', async () => {
    const reply = (await get('/api/records?projects=robotics&shape=light', PERSON_HERE)).json as ListReply
    expect(reply.records.length).toBeGreaterThan(0)
    // EVERY ROW BUT A MESSAGE IS ROBOTICS'S. A message in its view is kept in the message centre.
    expect(new Set(reply.records.filter((row) => row.kind !== 'message').map((row) => row.workspaceId))).toEqual(new Set([THERE]))
    for (const row of reply.records.filter((one) => one.kind === 'message')) expect(row.workspaceId, row.title).toBe('message-centre')
    expect(reply.records.map((row) => row.title)).not.toContain('Seed tray notes')
  })

  it('answers the old reading, with no projects word, exactly as the header’s project asked by name', async () => {
    for (const query of ['shape=light', 'shape=light&tally=family&sort=title&direction=asc&limit=2', 'kind=note']) {
      const withShape = query.includes('shape=') ? query : `${query}&shape=full`
      const old = (await get(`/api/records?${withShape}`, PERSON_HERE)).json as ListReply
      const named = (await get(`/api/records?${withShape}&projects=${HERE}`, PERSON_HERE)).json as ListReply & { next?: string | null }
      expect(old.projects, 'the old reading carries no projects').toBeUndefined()
      const { projects, next, ...rest } = named
      expect(projects).toEqual([HERE])
      const { next: oldNext, ...oldRest } = old as ListReply & { next?: string | null }
      expect(oldRest).toEqual(rest)
      // The next page's request is the same one, carrying the projects word when it was asked.
      expect(oldNext === null ? null : `${oldNext}`).toBe(next === null || next === undefined ? null : next.replace(`&projects=${HERE}`, ''))
      expect(new Set(old.records.map((row) => row.workspaceId))).toEqual(new Set(old.records.length === 0 ? [] : [HERE]))
    }
  })

  it('adds the counts up across projects', async () => {
    const every = (await get('/api/records?projects=all&shape=light&tally=family&limit=1', PERSON_HERE)).json as ListReply
    const each = await Promise.all(
      (await theProjectIds()).map(async (id) => (await get(`/api/records?projects=${id}&shape=light&tally=family&limit=1`, PERSON_HERE)).json as ListReply),
    )
    expect(every.matched).toBe(each.reduce((sum, one) => sum + one.matched, 0))
    expect(every.tally?.everything).toBe(each.reduce((sum, one) => sum + (one.tally?.everything ?? 0), 0))
    for (const family of Object.keys(every.tally?.families ?? {})) {
      expect(every.tally?.families[family], family).toBe(each.reduce((sum, one) => sum + (one.tally?.families[family] ?? 0), 0))
    }
    expect(every.matched).toBeGreaterThan(each[0]?.matched ?? 0)
  })

  it('shows an agent no message it may not read, in any project, and shows the person the same message', async () => {
    const asDee = (await get('/api/records?projects=all&kind=message&shape=full', agentHere('dee-across-bystander'))).json as ListReply
    expect(asDee.records.map((row) => row.id)).not.toContain(message)
    expect(JSON.stringify(asDee)).not.toContain(PRIVATE_WORDS)
    const deeEvery = (await get('/api/records?projects=all&shape=full', agentHere('dee-across-bystander'))).body
    expect(deeEvery).not.toContain(PRIVATE_TITLE)
    const deeThere = (await get(`/api/records?projects=${THERE}&kind=message&shape=full`, agentHere('dee-across-bystander'))).json as ListReply
    expect(deeThere.records.map((row) => row.id)).not.toContain(message)

    const asPerson = (await get('/api/records?projects=all&kind=message&shape=full', PERSON_HERE)).json as ListReply
    expect(asPerson.records.map((row) => row.id)).toContain(message)
    // A MESSAGE IS KEPT IN THE MESSAGE CENTRE AND BELONGS TO NO PROJECT. It is listed in the view of
    // the project it was written in, and its mark says which project that is.
    const listed = asPerson.records.find((row) => row.id === message) as (Row & { data?: { writtenIn?: { project?: string } } }) | undefined
    expect(listed?.workspaceId).toBe('message-centre')
    expect(listed?.data?.writtenIn?.project).toBe(THERE)
    const personThere = (await get(`/api/records?projects=${THERE}&kind=message&shape=full`, PERSON_HERE)).json as ListReply
    expect(personThere.records.map((row) => row.id)).toContain(message)
    const personHere = (await get(`/api/records?projects=${HERE}&kind=message&shape=full`, PERSON_HERE)).json as ListReply
    expect(personHere.records.map((row) => row.id)).not.toContain(message)
  })

  it('refuses a project id that names nothing, in words', async () => {
    const reply = await get('/api/records?projects=nowhere-at-all&shape=full', PERSON_HERE)
    expect(reply.status).toBe(400)
    expect(String(reply.json['error'])).toContain('No project is called "nowhere-at-all"')
  })
})

// ============================================================================ GET /api/search

describe('GET /api/search across projects', () => {
  it('finds a word in both projects with ?projects=all and counts nothing elsewhere', async () => {
    const reply = (await get('/api/search?q=notes&projects=all', PERSON_HERE)).json as {
      results: { record: Row }[]
      elsewhere: unknown[]
      projects?: string[]
      workspace: string
    }
    const where = new Set(reply.results.map((hit) => hit.record.workspaceId))
    expect(where).toEqual(new Set([HERE, THERE]))
    expect(reply.elsewhere).toEqual([])
    expect(reply.workspace).toBe('all')
    expect(reply.projects).toEqual(await theProjectIds())
  })

  it('searches only the chosen project, and counts the other one as elsewhere', async () => {
    const reply = (await get(`/api/search?q=notes&projects=${THERE}`, PERSON_HERE)).json as {
      results: { record: Row }[]
      elsewhere: { workspaceId: string; matched: number }[]
    }
    expect(new Set(reply.results.map((hit) => hit.record.workspaceId))).toEqual(new Set([THERE]))
    expect(reply.elsewhere.map((one) => one.workspaceId)).toEqual([HERE])
    expect(reply.elsewhere[0]?.matched).toBe(2)
  })

  it('answers the old reading, with no projects word, as the header’s project asked by name', async () => {
    const old = (await get('/api/search?q=notes', PERSON_HERE)).json as Record<string, unknown>
    const named = (await get(`/api/search?q=notes&projects=${HERE}`, PERSON_HERE)).json as Record<string, unknown>
    expect(old['projects']).toBeUndefined()
    const { projects, note: namedNote, ...rest } = named
    const { note: oldNote, ...oldRest } = old
    expect(projects).toEqual([HERE])
    expect(oldRest).toEqual(rest)
    // The two sentences say the same count; the one asked by name names its project instead of "this project".
    expect(String(oldNote)).toMatch(/^2 of \d+ records say "notes"/)
    expect(String(namedNote).split(' say ')[0]).toBe(String(oldNote).split(' say ')[0])
  })

  it('shows an agent no message it may not read when it searches every project', async () => {
    const asDee = (await get(`/api/search?q=${PRIVATE_WORDS}&projects=all`, agentHere('dee-across-bystander'))).json as { results: unknown[] }
    expect(asDee.results).toEqual([])
    const asPerson = (await get(`/api/search?q=${PRIVATE_WORDS}&projects=all`, PERSON_HERE)).json as { results: { record: Row }[] }
    expect(asPerson.results.map((hit) => hit.record.id)).toContain(message)
  })
})

// ============================================================================ GET /api/counters

describe('GET /api/counters across projects', () => {
  type CountersAcross = { counters: { id: string; workspaceId: string; title: string }[]; projects: string[]; says: string; narrowedByPermission?: unknown }

  it('lists the counters of both projects with ?projects=all, each naming its project', async () => {
    const reply = (await get('/api/counters?projects=all', PERSON_HERE)).json as CountersAcross
    expect(reply.counters.map((one) => [one.id, one.workspaceId])).toEqual([
      [counterThere, THERE],
      [counterHere, HERE],
    ])
    const mayRead = await theProjectIds()
    for (const one of reply.counters) expect(mayRead).toContain(one.workspaceId)
    expect(reply.narrowedByPermission).toBeNull()
    expect(reply.says).toContain('2 counters')
  })

  it('lists only the chosen project with ?projects=robotics', async () => {
    const reply = (await get(`/api/counters?projects=${THERE}`, PERSON_HERE)).json as CountersAcross
    expect(reply.counters.map((one) => one.id)).toEqual([counterThere])
    expect(reply.projects).toEqual([THERE])
  })

  it('answers the old reading, with no projects word, from the header’s project as before', async () => {
    const old = (await get('/api/counters', PERSON_HERE)).json as { workspaceId: string; counters: Record<string, unknown>[]; says: string }
    expect(old.workspaceId).toBe(HERE)
    expect(old.counters.map((one) => one['id'])).toEqual([counterHere])
    expect(old.counters[0]).not.toHaveProperty('workspaceId')
    expect(old.says).toBe('1 counter, of which 1 is running and 0 paused.')
    const oneThere = await get(`/api/counters/${counterThere}`, PERSON_HERE)
    expect(oneThere.status, 'the old reading of a counter in another project').toBe(404)
  })

  it('reads one counter in whichever project holds it with ?projects=all', async () => {
    const reply = await get(`/api/counters/${counterThere}?projects=all`, PERSON_HERE)
    expect(reply.status, reply.body).toBe(200)
    expect(reply.json['workspaceId']).toBe(THERE)
    expect((reply.json['counter'] as { id: string }).id).toBe(counterThere)
    const missing = await get('/api/counters/NOPEnothere99?projects=all', PERSON_HERE)
    expect(missing.status).toBe(404)
  })

  it('refuses a project id that names nothing, in words', async () => {
    const reply = await get('/api/counters?projects=nowhere-at-all', PERSON_HERE)
    expect(reply.status).toBe(400)
    expect(String(reply.json['error'])).toContain('No project is called "nowhere-at-all"')
  })
})
