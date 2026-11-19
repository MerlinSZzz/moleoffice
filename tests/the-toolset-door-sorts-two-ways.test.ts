// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TOOLSET DOOR SORTS TWO WAYS: BY WHO A TOOL IS FOR, AND BY CATEGORY.
 *
 * GET /api/toolset and GET /api/toolset/:slug (src/server/api/toolset.ts), piece P1 of plan
 * KP0udNekYcAo. This file files its own categories and tools through the ordinary record door and
 * reads them back through the two doors.
 *
 * What it proves:
 *   - ?who=users keeps the tools for users and for both, ?who=developers keeps the tools for
 *     developers and for both, and no `who` lists every tool;
 *   - an unknown `who` is a 400 naming the three words;
 *   - an unknown slug is a 404 naming the slug, and a known one answers the ten items in order;
 *   - a built tool naming a file this checkout does not hold says locationFound false, and one
 *     naming a file it holds says true;
 *   - a tool whose category was deleted is listed under withoutACategory, not dropped;
 *   - with no tool at all, the answer is an empty list and a sentence, not a 404;
 *   - a category reads as confirmed only while its decision says the owner made it.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { MANUAL_ITEMS } from '../src/shared/toolset.ts'
import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const AS_AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'toolset-tester',
  'x-mole-office-workspace': 'default',
}

let t: TestDb
let app: FastifyInstance
/** Each case works in its own project, so a list over that project sees only that case's tools. */
let HERE = 'default'
let caseNumber = 0
let workspaces: typeof import('../src/server/lib/workspaces.ts')

beforeAll(async () => {
  t = await freshDb()
  // The app's own module instance, imported after `freshDb` resets the module registry.
  workspaces = await import('../src/server/lib/workspaces.ts')
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  caseNumber += 1
  HERE = `toolset-case-${String(caseNumber)}`
  workspaces.createWorkspace({ id: HERE, title: `Tools case ${String(caseNumber)}` })
  AS_AGENT['x-mole-office-workspace'] = HERE
})

interface Reply {
  status: number
  body: Record<string, unknown>
}

async function get(url: string): Promise<Reply> {
  const res = await app.inject({ method: 'GET', url, headers: AS_AGENT })
  return { status: res.statusCode, body: res.json() as Record<string, unknown> }
}

async function file(kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers: AS_AGENT, payload: { kind, title, data } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

function aTool(slug: string, forWhom: string, category: string | null, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    entry: category === null ? 'part of the office' : 'tool',
    slug,
    does: `The ${slug} tool.`,
    forWhom,
    ...(category === null ? {} : { category }),
    whenToUse: 'When it helps.',
    whenNotToUse: 'When it does not.',
    whoMayUse: 'Everyone.',
    howToCall: `node tools/${slug}.mjs`,
    example: `node tools/${slug}.mjs`,
    costs: 'Nothing much.',
    protects: 'Nothing is deleted.',
    eachUseRecords: 'One line on the run.',
    keptBy: "The office's builders.",
    version: 'Version 1.',
    kept: 'in this repository',
    state: 'not built yet',
    ...extra,
  }
}

interface Row {
  slug: string
  locationFound: boolean | null
}
const slugsIn = (rows: unknown): string[] => (rows as Row[]).map((row) => row.slug)
const everySlug = (body: Record<string, unknown>): string[] =>
  [
    ...(body['categories'] as { tools: Row[] }[]).flatMap((one) => slugsIn(one.tools)),
    ...slugsIn(body['withoutACategory']),
    ...slugsIn(body['partsOfTheOffice']),
  ].sort()

describe('GET /api/toolset', () => {
  it('answers an empty list and a sentence when no tool is filed, not a 404', async () => {
    const read = await get('/api/toolset')
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    expect(read.body['categories']).toEqual([])
    expect(read.body['withoutACategory']).toEqual([])
    expect(read.body['partsOfTheOffice']).toEqual([])
    expect(read.body['says']).toContain('No tool has been filed in this project yet.')
  })

  it('keeps users and both for users, developers and both for developers, and everything with no who', async () => {
    const category = await file('tool_category', 'Records and writing', { says: 'Writing tools.' })
    await file('tool', 'For users', aTool('for-users', 'users', category))
    await file('tool', 'For developers', aTool('for-developers', 'developers', category))
    await file('tool', 'For both', aTool('for-both', 'both', category))
    await file('tool', 'A developer page', aTool('developer-page', 'developers', null))

    const users = await get('/api/toolset?who=users')
    expect(users.status, JSON.stringify(users.body)).toBe(200)
    expect(everySlug(users.body)).toEqual(['for-both', 'for-users'])

    const developers = await get('/api/toolset?who=developers')
    expect(everySlug(developers.body)).toEqual(['developer-page', 'for-both', 'for-developers'])
    expect(slugsIn(developers.body['partsOfTheOffice'])).toEqual(['developer-page'])

    const everybody = await get('/api/toolset')
    expect(everySlug(everybody.body)).toEqual(['developer-page', 'for-both', 'for-developers', 'for-users'])
    const listed = (everybody.body['categories'] as { name: string; confirmed: boolean; decision: string | null }[])[0]
    expect(listed).toMatchObject({ name: 'Records and writing', confirmed: false, decision: null })
  })

  it('refuses an unknown who with a 400 naming the three words', async () => {
    const read = await get('/api/toolset?who=everyone')
    expect(read.status).toBe(400)
    const said = String(read.body['error'])
    for (const word of ['"users"', '"developers"', '"both"']) expect(said).toContain(word)
  })

  it('says locationFound false for a built tool naming a missing file, and true for one naming a file here', async () => {
    const category = await file('tool_category', 'Developing the office', { says: 'Builders.' })
    await file('tool', 'Missing', aTool('missing', 'developers', category, { state: 'built', location: 'tools/no-such-tool-here.mjs' }))
    await file('tool', 'Present', aTool('present', 'developers', category, { state: 'built', location: 'tools/office-copy.mjs' }))
    await file('tool', 'Planned', aTool('planned', 'developers', category))
    const read = await get('/api/toolset')
    const rows = (read.body['categories'] as { tools: Row[] }[])[0]?.tools ?? []
    const bySlug = new Map(rows.map((row) => [row.slug, row.locationFound]))
    expect(bySlug.get('missing')).toBe(false)
    expect(bySlug.get('present')).toBe(true)
    expect(bySlug.get('planned')).toBeNull()
  })

  it('lists a tool whose category was deleted under withoutACategory', async () => {
    const category = await file('tool_category', 'Pages and pictures', { says: 'Pictures.' })
    await file('tool', 'Screenshots', aTool('page-screenshots', 'both', category))
    const gone = await app.inject({ method: 'DELETE', url: `/api/records/${category}`, headers: AS_AGENT })
    expect(gone.statusCode, gone.body).toBe(200)
    const read = await get('/api/toolset')
    expect(read.body['categories']).toEqual([])
    expect(slugsIn(read.body['withoutACategory'])).toEqual(['page-screenshots'])
  })
})

describe('a category on the list', () => {
  it('reads as confirmed only while its decision says the owner made it, as the write asks', async () => {
    const decision = t.api.createRecord({
      workspaceId: HERE,
      kind: 'decision',
      title: 'Services is a category',
      data: { because: 'the owner confirmed it', decided_by: 'the owner' },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
    })
    const category = await file('tool_category', 'Services', { says: 'Things outside the office.', confirmedBy: decision.id })
    const standing = async (): Promise<boolean> => {
      const list = await get('/api/toolset')
      const one = (list.body['categories'] as { id: string; confirmed: boolean }[]).find((row) => row.id === category)
      return one?.confirmed ?? false
    }
    expect(await standing()).toBe(true)
    // The decision is changed afterwards so that it no longer says the owner made it. The write rule
    // already refuses such a decision as confirmedBy; the list must give the same answer.
    t.api.patchRecord(decision.id, { dataPatch: { decided_by: THE_TEST_OFFICES_SECRETARY.handle } }, t.api.HUMAN)
    expect(await standing()).toBe(false)
  })
})

describe('GET /api/toolset/:slug', () => {
  it('answers a 404 naming the slug when no tool has it', async () => {
    const read = await get('/api/toolset/no-such-tool')
    expect(read.status).toBe(404)
    expect(String(read.body['error'])).toContain('"no-such-tool"')
  })

  it('answers the ten items in order, each with its number and its name', async () => {
    const category = await file('tool_category', 'Backup and sharing', { says: 'Copies.' })
    await file('tool', 'Backup', aTool('backup', 'both', category))
    const read = await get('/api/toolset/backup')
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    const items = read.body['items'] as { n: number; name: string; holds: Record<string, unknown> }[]
    expect(items.map((item) => [item.n, item.name])).toEqual(MANUAL_ITEMS.map((item) => [item.n, item.name]))
    expect(items[0]?.holds).toEqual({ title: 'Backup', does: 'The backup tool.' })
    expect(items[9]?.holds).toEqual({ keptBy: "The office's builders.", version: 'Version 1.', copyOf: null })
    expect(read.body['category']).toEqual({ id: category, name: 'Backup and sharing', found: true })
  })
})
