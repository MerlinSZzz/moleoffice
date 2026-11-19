// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KEPT BUNDLES DOOR READS ACROSS PROJECTS. A decision of 29 September 2026 has Context bundles stand
 * under All projects and read across projects.
 *
 * GET /api/bundles answers `?projects=all` or `?projects=<project id>` (src/shared/across-projects.ts,
 * read through theProjectsAQueryAsks): the kept bundles of the projects asked for, each row naming its
 * project in `workspaceId`, and the reply naming the projects read in `projects`. With no `projects`
 * word it answers exactly as before, from the project the header names. This file checks both readings
 * and that an unknown project is refused with a sentence.
 *
 * WHO MAY READ WHAT. No rule keeps a reader out of a whole project today (src/server/lib/across-projects.ts
 * says so), so the across-projects reply says `narrowedByPermission: null` and every row's project is one
 * theProjectsAReaderMayRead names. The kept bundles hold no messages, because a bundle is never a message,
 * so the message rule has nothing to take out of this list. The page's search for
 * a record reads GET /api/records ?projects=, whose message rule tests/the-goals-doors-read-across-projects.test.ts
 * pins.
 *
 * MUTATIONS, each proved after a control run and restored; the commit message names every run and log.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HERE = 'default'
const ELSEWHERE = 'bundle-robotics'

let t: TestDb
let app: FastifyInstance

const OWNER = { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const OWNER_ELSEWHERE = { ...OWNER, 'x-mole-office-workspace': ELSEWHERE }

interface Reply {
  status: number
  body: string
  json: Record<string, unknown>
}

async function ask(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<Reply> {
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
const get = (url: string, headers: Record<string, string>): Promise<Reply> => ask('GET', url, headers)
const post = (url: string, payload: unknown, headers: Record<string, string>): Promise<Reply> => ask('POST', url, headers, payload)

/** A kept bundle over the whole of the project the headers name. */
async function keep(title: string, headers: Record<string, string>): Promise<string> {
  const made = await post('/api/records', { kind: 'context_bundle', title, data: { scope: 'project', preset: 'continue' } }, headers)
  expect(made.status, made.body).toBe(201)
  return (made.json['record'] as { id: string }).id
}

type KeptRow = { id: string; title: string; workspaceId?: string }
const bundlesOf = (reply: Reply): KeptRow[] => reply.json['bundles'] as KeptRow[]

let hereBundle = ''
let elsewhereBundle = ''

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  expect((await post('/api/workspaces', { id: ELSEWHERE, title: 'Robotics' }, OWNER)).status).toBe(201)

  hereBundle = await keep('Kept here', OWNER)
  elsewhereBundle = await keep('Kept in Robotics', OWNER_ELSEWHERE)
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('GET /api/bundles across projects', () => {
  it('reads the kept bundles of every project, each row naming its project', async () => {
    const all = await get('/api/bundles?projects=all', OWNER)
    expect(all.status, all.body).toBe(200)
    const rows = bundlesOf(all)
    expect(rows.find((row) => row.id === hereBundle)?.workspaceId).toBe(HERE)
    expect(rows.find((row) => row.id === elsewhereBundle)?.workspaceId).toBe(ELSEWHERE)
    expect(all.json['projects']).toEqual(expect.arrayContaining([HERE, ELSEWHERE]))
  })

  it('says permission took nothing, and every row is in a project the reader may read', async () => {
    const { theProjectsAReaderMayRead } = await import('../src/server/lib/across-projects.ts')
    const { theMessageReader } = await import('../src/server/lib/messages.ts')
    const mayRead = new Set(theProjectsAReaderMayRead(theMessageReader({ type: 'human', id: THE_PERSON })).map((one) => one.id))
    const all = await get('/api/bundles?projects=all', OWNER)
    expect(all.json['narrowedByPermission']).toBeNull()
    const rows = bundlesOf(all)
    expect(rows.length).toBeGreaterThanOrEqual(2)
    for (const row of rows) expect(mayRead.has(row.workspaceId ?? ''), `${row.title} is in ${String(row.workspaceId)}`).toBe(true)
  })

  it('reads one project chosen in the address, whatever project the header names', async () => {
    const one = await get(`/api/bundles?projects=${ELSEWHERE}`, OWNER)
    expect(one.status, one.body).toBe(200)
    expect(bundlesOf(one).map((row) => row.id)).toEqual([elsewhereBundle])
    expect(one.json['projects']).toEqual([ELSEWHERE])
  })

  it('answers the old reading exactly as before when no project is asked for', async () => {
    const old = await get('/api/bundles', OWNER)
    expect(old.status, old.body).toBe(200)
    const rows = bundlesOf(old)
    expect(rows.map((row) => row.id)).toEqual([hereBundle])
    // THE SAME ROW SHAPE AS BEFORE, with no project field, and no list of projects on the reply.
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(['exports', 'id', 'spec', 'title', 'unreadable'])
    expect('projects' in old.json).toBe(false)
    expect(bundlesOf(await get('/api/bundles', OWNER_ELSEWHERE)).map((row) => row.id)).toEqual([elsewhereBundle])
  })

  it('refuses a project nobody registered, with a sentence, rather than answering an empty list', async () => {
    const wrong = await get('/api/bundles?projects=no-such-project', OWNER)
    expect(wrong.status).toBe(400)
    expect(String(wrong.json['error'])).toContain('No project is called "no-such-project"')
  })
})
