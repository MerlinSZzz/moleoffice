// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DOORS THE GOALS PAGE READS ANSWER ACROSS PROJECTS WHEN ASKED, AND AS BEFORE WHEN NOT.
 *
 * On 29 September 2026 the owner decided that Goals stands under All projects and reads across
 * projects. The page reads five doors that take a project: GET /api/records, GET /api/links,
 * GET /api/work-domains/presence, GET /api/planning/windows and GET /api/planning/dropped-lines. Each
 * now answers `?projects=all` or `?projects=<project id>` (src/shared/across-projects.ts), and each
 * still answers a request without that word exactly as it did, for the pages and tools that use it.
 *
 * WHAT "MAY READ" MEANS TODAY. No rule keeps a reader out of a whole project, so
 * theProjectsAReaderMayRead names every registered project, and every reply says
 * `narrowedByPermission: null`. What is taken out of the rows is a message the reader may not read
 * . The Goals page lists no messages, so that rule takes nothing out of what
 * it draws; it is measured here on GET /api/records, which lists every kind.
 *
 * Two projects, each with a goal, a trajectory serving it, a part, a work domain on the part, a late
 * window and a dropped line. Everything is this file's own, in a fresh database.
 *
 * MUTATIONS, each red here after a green control run:
 *   1. src/server/api/records.ts: list `workspaceId` instead of ACROSS_WORKSPACES for `?projects=`. The
 *      second project's goal is missing from the every-project reading.
 *   2. src/server/api/links.ts: read `allGatedLinks(workspaceOf(req))` whatever `across` says. The
 *      second project's serving link is missing.
 *   3. src/server/api/workdomain.ts: call `presenceOn(ids, workspaceId)` whatever `across` says. Nobody
 *      is on the second project's part.
 *   4. src/server/api/planning.ts: `inTheProjectsAsked` keeps every row. The one-project reading of the
 *      windows holds the other project's window.
 *   5. src/server/api/planning.ts: leave `workspaceId` off a dropped line. The lines do not name their
 *      project.
 *   6. Two lines, because the door takes messages out twice on the across reading: once in
 *      `theRowsTheReaderMaySee` (src/server/lib/across-projects.ts) and once more in the list door's own
 *      `onlyTheMessagesThisReaderMayRead`. With both returning every row, the bystander reads a message
 *      it may not read. With either one alone left out, this stays green.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

const HERE = 'default'
const THERE = 'goals-lathe-shop'

let t: TestDb
let app: FastifyInstance

const as = (workspace: string, type = 'human', id: string = THE_PERSON): Record<string, string> => ({
  'x-mole-office-workspace': workspace,
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})

interface Reply {
  status: number
  body: string
  json: Record<string, unknown>
}

async function ask(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown): Promise<Reply> {
  const reply = await app.inject({
    method,
    url,
    headers: payload === undefined ? headers : { ...headers, 'content-type': 'application/json' },
    ...(payload === undefined ? {} : { payload: payload as never }),
  })
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, body: reply.body, json }
}

async function file(workspace: string, kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const made = await ask('POST', '/api/records', as(workspace), { kind, title, data })
  expect(made.status, made.body).toBe(201)
  return (made.json['record'] as { id: string }).id
}

async function link(workspace: string, fromId: string, toId: string, type: string): Promise<void> {
  const made = await ask('POST', '/api/links', as(workspace), { fromId, toId, type })
  expect(made.status, made.body).toBeLessThan(300)
}

function shiftDay(day: string, by: number): string {
  const at = new Date(`${day}T12:00:00`)
  at.setDate(at.getDate() + by)
  return at.toISOString().slice(0, 10)
}

interface World {
  goal: string
  part: string
  work: string
  window: string
  line: string
}
const world: Record<string, World> = {}
let today = ''
let hiddenMessage = ''

async function aWorld(workspace: string, name: string): Promise<World> {
  const goal = await file(workspace, 'goal', `${name} goal`, { horizon: 'short', what: `${name} is true.`, owner: THE_PERSON, state: 'open' })
  const part = await file(workspace, 'planned_state', `${name} part`, { what: `${name} part is real.` })
  const trajectory = await file(workspace, 'trajectory', `${name} steps`, { plannedStateIds: [part], because: 'In order.' })
  await link(workspace, trajectory, goal, 'serves')
  const work = await file(workspace, 'task', `${name} work`, { state: 'doing' })
  const agent = await file(workspace, 'agent', `${name} agent`, { handle: `${name.toLowerCase()}-agent`, state: 'active', runtime: 'claude-code' })
  const domain = await file(workspace, 'work_domain', `${name} scope`, { objective: `Work on ${name}.`, agent, writes: [`src/${name}.py`] })
  await link(workspace, domain, part, 'about')
  const placed = await ask('POST', '/api/planning/windows', as(workspace), { recordId: work, startsOn: shiftDay(today, -3), endsOn: shiftDay(today, -1) })
  expect(placed.status, placed.body).toBe(201)
  const planned = await ask('POST', '/api/planning/allocations', as(workspace), { horizon: 'month', period: today.slice(0, 7), recordId: work, plannedHours: 2 })
  expect(planned.status, planned.body).toBe(201)
  const line = (planned.json['allocation'] as { id: string }).id
  const dropped = await ask('PATCH', `/api/planning/allocations/${line}`, as(workspace), { state: 'dropped', note: 'it slipped' })
  expect(dropped.status, dropped.body).toBe(200)
  return { goal, part, work, window: ((placed.json['window'] as { id: string }).id), line }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await ask('POST', '/api/workspaces', as(HERE), { id: THERE, title: 'Lathe shop' })
  expect(made.status, made.body).toBeLessThan(300)
  today = ((await ask('GET', '/api/planning/today', as(HERE))).json['day'] as string)
  world[HERE] = await aWorld(HERE, 'Bench')
  world[THERE] = await aWorld(THERE, 'Lathe')

  // A MESSAGE BETWEEN TWO AGENTS IN THE SECOND PROJECT, which a third agent may not read.
  for (const handle of ['goals-ada', 'goals-bo']) {
    const agent = await ask('POST', '/api/records', as(HERE), { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' } })
    expect(agent.status, agent.body).toBe(201)
  }
  const agents = ((await ask('GET', '/api/participants', as(HERE))).json['agents'] as { id: string; handle: string }[])
  const idOf = (handle: string) => agents.find((one) => one.handle === handle)!.id
  hiddenMessage = t.api.createRecord({
    kind: 'message',
    title: 'Lathe message between two agents',
    workspaceId: THERE,
    data: { body: 'Only for bo.', to: [{ kind: 'agent', id: idOf('goals-bo') }] },
    actor: { type: 'agent', id: idOf('goals-ada') } as never,
  }).id
  t.client.sqlite.prepare('DELETE FROM message_delivery WHERE message_id = ? AND recipient_id != ?').run(hiddenMessage, idOf('goals-bo'))
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(hiddenMessage) as { data: string }
  const data = JSON.parse(row.data) as Record<string, unknown>
  delete data['routed']
  writeDataBypassingTheGate(t, hiddenMessage, data)
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

const goalsOf = (reply: Reply) => (reply.json['records'] as { id: string; workspaceId: string }[])

describe('GET /api/records', () => {
  it('answers the header project alone without ?projects=, as before', async () => {
    const here = await ask('GET', '/api/records?kind=goal', as(HERE))
    expect(here.status, here.body).toBe(200)
    expect(goalsOf(here).map((one) => one.id)).toEqual([world[HERE]!.goal])
    const there = await ask('GET', '/api/records?kind=goal', as(THERE))
    expect(goalsOf(there).map((one) => one.id)).toEqual([world[THERE]!.goal])
  })

  it('reads every project with ?projects=all, each row naming its project, and says nothing was narrowed', async () => {
    const every = await ask('GET', '/api/records?kind=goal&projects=all', as(HERE))
    expect(every.status, every.body).toBe(200)
    expect(goalsOf(every).map((one) => one.id).sort()).toEqual([world[HERE]!.goal, world[THERE]!.goal].sort())
    expect(Object.fromEntries(goalsOf(every).map((one) => [one.id, one.workspaceId]))).toEqual({
      [world[HERE]!.goal]: HERE,
      [world[THERE]!.goal]: THERE,
    })
    expect(every.json['narrowedByPermission']).toBeNull()
    const { theProjectsAReaderMayRead } = await import('../src/server/lib/across-projects.ts')
    const { theMessageReader } = await import('../src/server/lib/messages.ts')
    const mayRead = new Set(theProjectsAReaderMayRead(theMessageReader({ type: 'human', id: THE_PERSON } as never)).map((one) => one.id))
    for (const row of goalsOf(every)) expect(mayRead.has(row.workspaceId), row.workspaceId).toBe(true)
  })

  it('reads one project with ?projects=<id>, whatever the header says', async () => {
    const one = await ask('GET', `/api/records?kind=goal&projects=${THERE}`, as(HERE))
    expect(one.status, one.body).toBe(200)
    expect(goalsOf(one).map((row) => row.id)).toEqual([world[THERE]!.goal])
  })

  it('refuses a project nobody registered, with a sentence, rather than answering an empty list', async () => {
    const none = await ask('GET', '/api/records?kind=goal&projects=no-such-project', as(HERE))
    expect(none.status).toBe(400)
    expect(String(none.json['error'])).toContain('No project is called "no-such-project"')
  })

  it('leaves out, in every project, a message the reader may not read', async () => {
    const bystander = await ask('GET', '/api/records?kind=message&projects=all', as(HERE, 'agent', 'goals-dee'))
    expect(bystander.status, bystander.body).toBe(200)
    expect(goalsOf(bystander).map((one) => one.id)).not.toContain(hiddenMessage)
    const addressee = await ask('GET', '/api/records?kind=message&projects=all', as(HERE, 'agent', 'goals-bo'))
    expect(goalsOf(addressee).map((one) => one.id)).toContain(hiddenMessage)
  })
})

describe('GET /api/links', () => {
  const serving = (reply: Reply) =>
    (reply.json['links'] as { toId: string; type: string }[]).filter((one) => one.type === 'serves').map((one) => one.toId).sort()

  it('answers the header project alone without ?projects=, and every project with it', async () => {
    const old = await ask('GET', '/api/links', as(HERE))
    expect(old.status, old.body).toBe(200)
    expect(serving(old)).toEqual([world[HERE]!.goal])
    const every = await ask('GET', '/api/links?projects=all', as(HERE))
    expect(every.status, every.body).toBe(200)
    expect(serving(every)).toEqual([world[HERE]!.goal, world[THERE]!.goal].sort())
    expect(every.json['narrowedByPermission']).toBeNull()
    const one = await ask('GET', `/api/links?projects=${THERE}`, as(HERE))
    expect(serving(one)).toEqual([world[THERE]!.goal])
  })
})

describe('GET /api/work-domains/presence', () => {
  it('finds nobody on the other project\'s part without ?projects=, and its agent with it', async () => {
    const ids = `${world[HERE]!.part},${world[THERE]!.part}`
    const people = (reply: Reply, id: string) => ((reply.json['byRecord'] as Record<string, { domainTitle: string }[]>)[id] ?? []).map((one) => one.domainTitle)
    const old = await ask('GET', `/api/work-domains/presence?records=${ids}`, as(HERE))
    expect(old.status, old.body).toBe(200)
    expect(people(old, world[HERE]!.part)).toEqual(['Bench scope'])
    expect(people(old, world[THERE]!.part)).toEqual([])
    const every = await ask('GET', `/api/work-domains/presence?records=${ids}&projects=all`, as(HERE))
    expect(every.status, every.body).toBe(200)
    expect(people(every, world[HERE]!.part)).toEqual(['Bench scope'])
    expect(people(every, world[THERE]!.part)).toEqual(['Lathe scope'])
    expect(every.json['narrowedByPermission']).toBeNull()
  })
})

describe('GET /api/planning/windows and /api/planning/dropped-lines', () => {
  const span = () => `from=${shiftDay(today, -30)}&to=${shiftDay(today, 30)}`

  it('answers every window without ?projects=, as before, and one project\'s with it', async () => {
    const windowIds = (reply: Reply) => (reply.json['windows'] as { window: { id: string } }[]).map((one) => one.window.id).sort()
    const old = await ask('GET', `/api/planning/windows?${span()}`, as(HERE))
    expect(old.status, old.body).toBe(200)
    expect(windowIds(old)).toEqual([world[HERE]!.window, world[THERE]!.window].sort())
    const one = await ask('GET', `/api/planning/windows?${span()}&projects=${THERE}`, as(HERE))
    expect(one.status, one.body).toBe(200)
    expect(windowIds(one)).toEqual([world[THERE]!.window])
    const every = await ask('GET', `/api/planning/windows?${span()}&projects=all`, as(HERE))
    expect(windowIds(every)).toEqual([world[HERE]!.window, world[THERE]!.window].sort())
  })

  it('names each dropped line\'s project only when ?projects= asks, and keeps the old reply as it was', async () => {
    type Line = { id: string; workspaceId?: string | null }
    const lines = (reply: Reply) => reply.json['lines'] as Line[]
    const old = await ask('GET', `/api/planning/dropped-lines?${span()}`, as(HERE))
    expect(old.status, old.body).toBe(200)
    expect(lines(old).map((one) => one.id).sort()).toEqual([world[HERE]!.line, world[THERE]!.line].sort())
    for (const line of lines(old)) expect('workspaceId' in line, 'the old reply grew a field').toBe(false)
    const every = await ask('GET', `/api/planning/dropped-lines?${span()}&projects=all`, as(HERE))
    expect(Object.fromEntries(lines(every).map((one) => [one.id, one.workspaceId]))).toEqual({
      [world[HERE]!.line]: HERE,
      [world[THERE]!.line]: THERE,
    })
    const one = await ask('GET', `/api/planning/dropped-lines?${span()}&projects=${HERE}`, as(THERE))
    expect(lines(one).map((row) => row.id)).toEqual([world[HERE]!.line])
  })
})
