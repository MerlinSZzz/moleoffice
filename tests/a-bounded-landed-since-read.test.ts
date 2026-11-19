// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { LANDED_SINCE_DEFAULT, LANDED_SINCE_MOST } from '../src/shared/landed-since.ts'
import { laneOf } from '../src/shared/merge-queue.ts'
import { clockStamp } from '../src/shared/time.ts'

let t: TestDb
let app: FastifyInstance
let door: typeof import('../src/server/lib/merge-entry-door.ts')
let made = 0
const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id, provedBy: 'the-person-key' } as const
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  door = await import('../src/server/lib/merge-entry-door.ts')
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

function nextRoot(): string {
  made += 1
  return `/synthetic/landed-since-${String(made)}`
}

function at(ms: number) {
  return clockStamp(() => new Date(ms))
}

function entry(root: string, title: string, ms: number, options: { state?: string; observed?: boolean; instant?: string; atStamp?: string; documents?: boolean; files?: Record<string, unknown> } = {}): string {
  const state = options.state ?? 'merged'
  const clock = { ...at(ms), ...(options.atStamp === undefined ? {} : { stamp: options.atStamp }), ...(options.instant === undefined ? {} : { instant: options.instant }) }
  return door.asTheMergeQueue(() =>
    t.api.createRecord({
      kind: 'merge_entry',
      title,
      workspaceId: 'default',
      actor: person,
      origin: 'fixture',
      data: {
        state,
        run: `synthetic-run-${title}`,
        seal: { id: `synthetic-seal-${title}`, hash: `synthetic-hash-${title}` },
        submittedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
        changeset: { adapter: 'git', root },
        ...(options.documents ? { documents: { tree: 'tree', files: ['readme.md'] } } : {}),
        ...(options.files === undefined ? {} : { integration: { result: 'result', mainAt: 'main', files: options.files, at: clock.stamp } }),
        ...(state === 'merged' ? { integrated: { entry: '', mainBefore: 'a'.repeat(40), mainAfter: 'b'.repeat(40), at: clock.stamp, ...((options.observed ?? true) ? { time: clock } : {}) } } : {}),
      },
    }),
  ).id
}

function read(query: Record<string, string | number>) {
  const search = new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)]))
  return app.inject({ method: 'GET', url: `/api/merge-queue/landed-since?${search.toString()}`, headers })
}

it('answers merged entries at or after since in exact-moment order, and counts the landings it cannot place', async () => {
  const root = nextRoot()
  const base = Date.parse('2026-11-09T10:00:00.000Z')
  const boundary = entry(root, 'boundary', base)
  entry(root, 'old', base - 1_000)
  const second = entry(root, 'second', base + 1_000)
  const third = entry(root, 'third', base + 1_000)
  const later = entry(root, 'later', base + 2_000)
  entry(nextRoot(), 'elsewhere', base + 3_000)
  entry(nextRoot(), 'unobserved elsewhere', base + 3_500, { observed: false })
  entry(root, 'not merged', base + 4_000, { state: 'testing' })
  entry(root, 'unobserved', base + 5_000, { observed: false })

  const response = await read({ since: at(base).stamp, repository: root })
  expect(response.statusCode, response.body).toBe(200)
  const body = response.json()
  const sameMoment = [second, third].sort()
  const titles = new Map([
    [boundary, 'boundary'],
    [second, 'second'],
    [third, 'third'],
    [later, 'later'],
  ])

  expect(body.landings.map((one: { id: string }) => one.id)).toEqual([boundary, ...sameMoment, later])
  expect(body.landings.map((one: { title: string }) => one.title)).toEqual(['boundary', ...sameMoment.map((id) => titles.get(id)), 'later'])
  expect(body).toMatchObject({ repository: root, since: at(base).stamp, sinceInstant: new Date(base).toISOString(), boundary: 'inclusive', order: 'landedInstant,id', unreadablePresent: true, limit: LANDED_SINCE_DEFAULT, returned: 4, truncated: false, next: null })
  expect(body.landings[0]).toMatchObject({ title: 'boundary', run: 'synthetic-run-boundary', repository: root, mainBefore: 'a'.repeat(40), mainAfter: 'b'.repeat(40), landedAt: at(base).stamp, landedInstant: at(base).instant, line: { agent: null, starter: null } })
  expect(body.landings[1]).toMatchObject({ title: titles.get(sameMoment[0]!), landedAt: at(base + 1_000).stamp, landedInstant: at(base + 1_000).instant })
})

it('reads every repository in the project when none is named', async () => {
  const base = Date.parse('2026-11-09T14:00:00.000Z')
  const first = entry(nextRoot(), 'first repository', base + 1_000)
  const second = entry(nextRoot(), 'second repository', base + 2_000)

  const response = await read({ since: at(base).instant })
  expect(response.statusCode, response.body).toBe(200)
  expect(response.json()).toMatchObject({ repository: null, since: at(base).stamp, sinceInstant: new Date(base).toISOString() })
  expect(new Set(response.json().landings.map((one: { id: string }) => one.id))).toEqual(new Set([first, second]))
})


it('does not guess a malformed or special observation, and says ordering cannot be complete', async () => {
  const root = nextRoot()
  const base = Date.parse('2026-11-09T16:00:00.000Z')
  entry(root, 'missing', base, { observed: false })
  entry(root, 'malformed', base + 1_000, { instant: 'not-an-instant' })
  entry(root, 'special now', base + 2_000, { instant: 'now' })
  entry(root, 'offsetless', base + 2_500, { instant: '2026-11-09T16:00:02' })
  const good = entry(root, 'good', base + 3_000)

  const response = await read({ since: at(base).instant, repository: root })
  expect(response.statusCode, response.body).toBe(200)
  expect(response.json()).toMatchObject({ unreadablePresent: true, returned: 1 })
  expect(response.json().landings.map((one: { id: string }) => one.id)).toEqual([good])
  expect(response.json().landings.map((one: { title: string }) => one.title)).toEqual(['good'])
})

it('orders repeated clock-hour landings by their exact stored instant, not their wall stamp', async () => {
  const root = nextRoot()
  const stamp = '2026-10-25 01:30:00'
  const summer = entry(root, 'summer hour', Date.parse('2026-10-25T00:30:00.000Z'), { atStamp: stamp, instant: '2026-10-25T01:30:00.000+01:00' })
  const winter = entry(root, 'winter hour', Date.parse('2026-10-25T01:30:00.000Z'), { atStamp: stamp, instant: '2026-10-25T01:30:00.000+00:00' })

  const response = await read({ since: '2026-10-25T00:00:00.000+00:00', repository: root })
  expect(response.statusCode, response.body).toBe(200)
  const body = response.json()
  expect(body.landings.map((one: { id: string }) => one.id)).toEqual([summer, winter])
  expect(body.landings.map((one: { landedAt: string }) => one.landedAt)).toEqual([stamp, stamp])
  expect(body.landings.map((one: { landedInstant: string }) => one.landedInstant)).toEqual(['2026-10-25T01:30:00.000+01:00', '2026-10-25T01:30:00.000+00:00'])
  expect(body).toMatchObject({ unreadablePresent: false, returned: 2, truncated: false })
})

it('pages same-moment landings by id and says when the batch is cut', async () => {
  const root = nextRoot()
  const base = Date.parse('2026-11-09T12:00:00.000Z')
  const ids = Array.from({ length: 5 }, (_, index) => entry(root, `tie ${String(index)}`, base))
  const ordered = [...ids].sort()
  const since = at(base - 1_000).stamp

  const first = await read({ since, repository: root, limit: 2 })
  expect(first.statusCode, first.body).toBe(200)
  const firstBody = first.json()
  expect(firstBody).toMatchObject({ limit: 2, returned: 2, truncated: true, unreadablePresent: false, next: { at: at(base).instant, id: ordered[1] } })
  expect(firstBody.landings.map((one: { id: string }) => one.id)).toEqual(ordered.slice(0, 2))

  const second = await read({ since, repository: root, limit: 2, afterAt: firstBody.next.at, afterId: firstBody.next.id })
  expect(second.statusCode, second.body).toBe(200)
  const secondBody = second.json()
  expect(secondBody).toMatchObject({ limit: 2, returned: 2, truncated: true, next: { at: at(base).instant, id: ordered[3] } })
  expect(secondBody.landings.map((one: { id: string }) => one.id)).toEqual(ordered.slice(2, 4))

  const third = await read({ since, repository: root, limit: 2, afterAt: secondBody.next.at, afterId: secondBody.next.id })
  expect(third.statusCode, third.body).toBe(200)
  const thirdBody = third.json()
  expect(thirdBody).toMatchObject({ limit: 2, returned: 1, truncated: false, next: null })
  expect(thirdBody.landings.map((one: { id: string }) => one.id)).toEqual(ordered.slice(4))
  expect(new Set([...firstBody.landings, ...secondBody.landings, ...thirdBody.landings].map((one: { id: string }) => one.id))).toEqual(new Set(ids))
})

it('refuses a cursor that is not the exact instant next.at gives', async () => {
  const response = await read({ since: at(Date.parse('2026-11-09T10:00:00.000Z')).stamp, afterAt: '2026-11-09 10:00:00', afterId: 'some-id' })
  expect(response.statusCode, response.body).toBe(400)
})


it('keeps the fractional part of since', async () => {
  const root = nextRoot()
  const base = Date.parse('2026-11-09T18:00:00.000Z')
  entry(root, 'early fraction', base + 200)
  const late = entry(root, 'late fraction', base + 800)

  const response = await read({ since: new Date(base + 500).toISOString(), repository: root })
  expect(response.statusCode, response.body).toBe(200)
  expect(response.json().landings.map((one: { id: string }) => one.id)).toEqual([late])
})

it('pages by the exact fractional cursor without repeating or skipping', async () => {
  const root = nextRoot()
  const base = Date.parse('2026-11-09T19:00:00.000Z')
  const first = entry(root, 'first fraction', base + 400)
  const second = entry(root, 'second fraction', base + 700)
  const since = new Date(base).toISOString()

  const firstPage = await read({ since, repository: root, limit: 1 })
  expect(firstPage.statusCode, firstPage.body).toBe(200)
  const firstBody = firstPage.json()
  expect(firstBody.landings.map((one: { id: string }) => one.id)).toEqual([first])
  expect(firstBody).toMatchObject({ truncated: true, next: { at: at(base + 400).instant, id: first } })

  const secondPage = await read({ since, repository: root, limit: 1, afterAt: firstBody.next.at, afterId: firstBody.next.id })
  expect(secondPage.statusCode, secondPage.body).toBe(200)
  expect(secondPage.json().landings.map((one: { id: string }) => one.id)).toEqual([second])
  expect(secondPage.json()).toMatchObject({ truncated: false, next: null })
})

it.each([
  ['since', 'yesterday'],
  ['since', '2026-02-30 00:00:00'],
  ['since', '2026-11-09T25:00:00+00:00'],
  ['limit', '0'],
  ['limit', String(LANDED_SINCE_MOST + 1)],
  ['limit', '2.5'],
  ['repository', ''],
  ['lane', ''],
  ['afterAt', '2026-11-09T10:00:00+00:00'],
  ['afterId', 'some-id'],
  ['unknown', 'x'],
])('refuses %s=%s', async (key, value) => {
  const response = await read({ since: at(Date.parse('2026-11-09T10:00:00.000Z')).stamp, [key]: value })
  expect(response.statusCode, response.body).toBe(400)
})


it('filters the queue lanes and pages their own exact moments and path counts', async () => {
  const root = nextRoot()
  const other = nextRoot()
  const base = Date.parse('2026-11-09T20:00:00.000Z')
  const normalLane = laneOf({ root })
  const docsLane = laneOf({ root }, { tree: 'tree', files: ['readme.md'] })
  const normal = entry(root, 'normal paths', base, { files: { 'added.ts': 'a'.repeat(64), 'deleted.ts': 'absent', 'changed.ts': 'b'.repeat(40) } })
  entry(root, 'docs paths', base + 100, { documents: true, files: { 'readme.md': 'a'.repeat(64) } })
  const second = entry(root, 'normal unknown paths', base + 200)
  entry(other, 'other lane', base + 300, { files: {} })
  const since = new Date(base).toISOString()
  const first = await read({ since, lane: normalLane, limit: 1 })
  expect(first.statusCode, first.body).toBe(200)
  expect(first.json()).toMatchObject({ lane: normalLane, truncated: true, landings: [{ id: normal, lane: normalLane, landedInstant: at(base).instant, pathsChanged: 3 }] })
  const next = first.json().next
  const page = await read({ since, lane: normalLane, limit: 1, afterAt: next.at, afterId: next.id })
  expect(page.json()).toMatchObject({ truncated: false, landings: [{ id: second, lane: normalLane, pathsChanged: null }] })
  const docs = await read({ since, repository: root, lane: docsLane })
  expect(docs.json().landings).toMatchObject([{ lane: docsLane, pathsChanged: 1 }])
  expect((await read({ since, repository: other, lane: docsLane })).json().landings).toEqual([])
  const all = await read({ since, repository: root })
  expect(all.json().landings.map((one: { lane: string }) => one.lane)).toEqual([normalLane, docsLane, normalLane])
})

it('reports missing or invalid path maps and scopes unreadable moments to the requested lane', async () => {
  const root = nextRoot()
  const base = Date.parse('2026-11-09T21:00:00.000Z')
  const docsLane = laneOf({ root }, {})
  const normalLane = laneOf({ root })
  entry(root, 'missing docs clock', base, { documents: true, observed: false })
  const invalid = entry(root, 'bad path map', base + 100, { files: { 'bad.ts': 9 } })
  const empty = entry(root, 'empty path map', base + 200, { files: {} })
  const since = new Date(base).toISOString()
  const normal = (await read({ since, repository: root, lane: normalLane })).json()
  expect(normal.unreadablePresent).toBe(false)
  expect(normal.landings).toMatchObject([{ id: invalid, pathsChanged: null }, { id: empty, pathsChanged: 0 }])
  expect((await read({ since, repository: root, lane: docsLane })).json()).toMatchObject({ unreadablePresent: true, landings: [] })
})

it('warns when an entry has no readable lane and excludes another project', async () => {
  const root = nextRoot()
  const base = Date.parse('2026-11-09T22:00:00.000Z')
  const good = entry(root, 'inside project', base)
  const elsewhere = entry(root, 'other project', base + 100)
  const unknown = entry(root, 'unknown lane', base + 200)
  t.client.sqlite.prepare("INSERT INTO workspaces (id, title, created_at, updated_at) VALUES ('lane-elsewhere', 'Elsewhere', '2026-11-09 00:00:00', '2026-11-09 00:00:00')").run()
  t.client.sqlite.prepare("UPDATE records SET workspace_id = 'lane-elsewhere' WHERE id = ?").run(elsewhere)
  t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.changeset.root') WHERE id = ?").run(unknown)
  const result = (await read({ since: new Date(base).toISOString(), lane: laneOf({ root }) })).json()
  expect(result).toMatchObject({ unreadablePresent: true, landings: [{ id: good }] })
  expect((await read({ since: new Date(base).toISOString(), repository: root, lane: laneOf({ root }) })).json()).toMatchObject({ unreadablePresent: false, landings: [{ id: good }] })
})
