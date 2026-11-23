// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HIS DECISIONS, THE READ BEHIND TWO OF HOME'S FIGURES. GET /api/figures/my-decisions counts the forks the person settled
 * in a span, and the average time each had waited on him, from when it was filed to when his decision settled it.
 *
 * WHAT IS PROVED, in a test office with two made-up projects whose forks were filed by an agent and settled by the person:
 *   1. The header's project is read alone, one project id reads that one, and ?projects=all reads both together.
 *   2. Each fork is counted on the day the settling link was made, and each day has its own count and average.
 *   3. A fork settled outside the span and a fork still waiting are not counted.
 *   4. A project where he settled nothing has no average, which is not known and not 0, and says so.
 */
import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { setWordLanguage, t } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { AGENT, apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const SECOND = 'made-up-decisions-second'
const NONE = 'made-up-decisions-none'
const SPAN = 'from=2026-11-02&to=2026-11-04'

let t0: TestDb
let app: FastifyInstance
const PERSON: Record<string, string> = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const inProject = (project: string): Record<string, string> => ({ ...PERSON, 'x-mole-office-workspace': project })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function read(url: string, headers: Record<string, string>): Promise<{ status: number; body: any; raw: string }> {
  const reply = await app.inject({ method: 'GET', url, headers })
  return { status: reply.statusCode, body: reply.json(), raw: reply.body }
}

/**
 * A fork an agent filed at `filedAt`, and, unless `settledAt` is null, the person's decision and the link that settles
 * it, made at `settledAt`. The two times are written straight into the rows, so the wait is known.
 */
async function aFork(project: string, filedAt: string, settledAt: string | null): Promise<string> {
  const fork = t0.api.createRecord({
    workspaceId: project, kind: 'proposal', title: 'A made-up fork',
    data: { question: 'One way or the other?', options: ['a — one way', 'b — the other'] }, actor: AGENT,
  })
  t0.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(filedAt, fork.id)
  if (settledAt === null) return fork.id
  const decision = t0.api.createRecord({
    workspaceId: project, kind: 'decision', title: 'A made-up decision', data: { because: 'Made up.' },
    actor: { type: 'human', id: THE_PERSON, stated: true },
  })
  const linked = await app.inject({
    method: 'POST', url: '/api/links', headers: inProject(project), payload: { fromId: decision.id, toId: fork.id, type: 'derived_from' },
  })
  expect(linked.statusCode, linked.body).toBe(201)
  t0.client.sqlite.prepare('UPDATE links SET created_at = ? WHERE from_id = ? AND to_id = ?').run(settledAt, decision.id, fork.id)
  return fork.id
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t0 = await freshDb()
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  app = (await apiApp()).app
  await app.ready()
  setWordLanguage('en')
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t0.file), 'keys.json')))
  for (const project of [SECOND, NONE]) {
    const filed = await app.inject({ method: 'POST', url: '/api/workspaces', headers: PERSON, payload: { id: project, title: `The made-up project ${project}` } })
    expect(filed.statusCode, filed.body).toBe(201)
  }
}, 60_000)

afterAll(async () => {
  setWordLanguage('en')
  await app?.close()
  t0?.close()
})

describe('his decisions', () => {
  it('counts the forks he settled on each day of the span, with the average wait, per project and for every project', async () => {
    await aFork('default', '2026-11-02 09:00:00', '2026-11-02 11:00:00')
    await aFork('default', '2026-11-03 08:00:00', '2026-11-03 09:00:00')
    await aFork(SECOND, '2026-11-02 10:00:00', '2026-11-02 10:30:00')
    // Settled after the span ends, and still waiting: neither is counted.
    await aFork('default', '2026-11-04 09:00:00', '2026-11-06 09:00:00')
    await aFork('default', '2026-11-03 09:00:00', null)

    const own = await read(`/api/figures/my-decisions?${SPAN}`, PERSON)
    expect(own.status, own.raw).toBe(200)
    expect(own.body.projects).toEqual(['default'])
    expect(own.body).toMatchObject({ from: '2026-11-02', to: '2026-11-04', settled: 2, averageMinutes: 90, notTimed: 0, cut: false })
    expect(own.body.days).toEqual([
      { day: '2026-11-02', settled: 1, averageMinutes: 120 },
      { day: '2026-11-03', settled: 1, averageMinutes: 60 },
      { day: '2026-11-04', settled: 0, averageMinutes: null },
    ])
    expect(own.body.says).toBe(t('figures.myDecisions.says', { from: '2026-11-02', to: '2026-11-04' }))

    const second = await read(`/api/figures/my-decisions?projects=${SECOND}&${SPAN}`, PERSON)
    expect(second.status, second.raw).toBe(200)
    expect(second.body.projects).toEqual([SECOND])
    expect(second.body).toMatchObject({ settled: 1, averageMinutes: 30 })

    const all = await read(`/api/figures/my-decisions?projects=all&${SPAN}`, PERSON)
    expect(all.status, all.raw).toBe(200)
    expect(all.body.projects).toEqual(expect.arrayContaining(['default', SECOND, NONE]))
    expect(all.body).toMatchObject({ settled: 3, averageMinutes: 70, notTimed: 0, cut: false })
    expect(all.body.days).toEqual([
      { day: '2026-11-02', settled: 2, averageMinutes: 75 },
      { day: '2026-11-03', settled: 1, averageMinutes: 60 },
      { day: '2026-11-04', settled: 0, averageMinutes: null },
    ])
  })

  it('says plainly that the average is not known in a project where he settled nothing', async () => {
    const none = await read(`/api/figures/my-decisions?${SPAN}`, inProject(NONE))
    expect(none.status, none.raw).toBe(200)
    expect(none.body.projects).toEqual([NONE])
    expect(none.body).toMatchObject({ settled: 0, averageMinutes: null, notTimed: 0 })
    expect(none.body.days.map((one: { averageMinutes: number | null }) => one.averageMinutes)).toEqual([null, null, null])
    expect(none.body.says).toBe(t('figures.myDecisions.none', { from: '2026-11-02', to: '2026-11-04' }))
  })
})
