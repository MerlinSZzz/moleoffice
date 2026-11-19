// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION I5: a crossed pattern becomes a proposal for the person, never a change, and never twice.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 *   1. A crossing files one proposal, with the numbers behind it.
 *   2. Crossing the same pattern again files nothing. This is the test the criterion asks for by
 *      name: cross a pattern twice, count one proposal.
 *   3. A pattern that has not crossed files nothing at all.
 *   4. Nothing but a proposal is written. No route is added and no existing record is touched.
 *   5. A proposal somebody deleted still counts as proposed, so the person is not asked twice.
 *
 * THE MARK IS THE PROPOSAL ITSELF. There is no table of patterns already proposed: the proposal
 * carries `source` set to `patternFoundBy(key)` and the reader looks for that. So test 2 is also
 * the test that the mark is stored, and test 5 is the test that it is stored on the row rather than
 * beside it.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { patternFoundBy } from '../src/shared/ops.ts'

let t: TestDb
let app: FastifyInstance
let howMany: (workspaceId: string) => number

const WORKSPACE = 'default'

const AS_AN_AGENT: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code/the-test',
}

/**
 * A run of calls that crosses the `chain` pattern: one operation called five or more times inside
 * one stretch, in three or more separate traces.
 */
let written = 0

function aChainThatCrosses(operation: string): void {
  const insert = t.client.sqlite.prepare(
    'insert into api_calls (id, at_ms, operation, effect, route, method, waits, status, ms, bytes, list_len, ' +
      'workspace_id, workspace_stated, actor_type, actor_id, session_id, identity_source, trace_id, purpose, ' +
      'target_id, target_kind, client_addr, client_origin) values ' +
      "(?, ?, ?, 'read', '/api/x', 'GET', 0, 200, 5, 100, null, ?, 1, 'agent', 'claude-code/the-test', null, " +
      "'header', ?, 'cold-recovery', null, null, null, 'local')",
  )
  const now = Date.now()
  for (let trace = 0; trace < 3; trace += 1) {
    for (let call = 0; call < 6; call += 1) {
      insert.run(
        `chain-${operation}-${String((written += 1))}`,
        now - 60_000 + trace * 1000 + call * 10,
        operation,
        WORKSPACE,
        `a-trace-${String(trace)}`,
      )
    }
  }
}

async function propose(): Promise<{
  status: number
  filed: { key: string; recordId: string }[]
  alreadyProposed: { key: string; recordId: string; deleted: boolean }[]
  notCrossed: number
}> {
  const reply = await app.inject({ method: 'POST', url: '/api/usage/patterns/proposals', headers: AS_AN_AGENT })
  const body = JSON.parse(reply.body) as {
    filed: { key: string; recordId: string }[]
    alreadyProposed: { key: string; recordId: string; deleted: boolean }[]
    notCrossed: number
  }
  return { status: reply.statusCode, ...body }
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  howMany = (await import('../src/server/lib/pattern-proposals.ts')).howManyProposalsForCrossings
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a crossed pattern is proposed once and never twice', () => {
  it('files nothing when nothing has crossed', async () => {
    const out = await propose()
    expect(out.filed, 'a proposal was filed with nothing over a threshold').toEqual([])
    expect(howMany(WORKSPACE), 'a proposal exists that no crossing stands behind').toBe(0)
  })

  it('files one proposal for a crossing, and files nothing the second time it crosses', async () => {
    aChainThatCrosses('record.list')

    const first = await propose()
    const mine = first.filed.filter((one) => one.key === 'chain:record.list')
    expect(mine.length, 'a crossed pattern filed no proposal').toBe(1)
    expect(howMany(WORKSPACE), 'the crossing did not file exactly one proposal').toBe(first.filed.length)

    // The same pattern crosses again, harder. Nothing new may be filed for it.
    aChainThatCrosses('record.list')
    const second = await propose()
    expect(
      second.filed.filter((one) => one.key === 'chain:record.list'),
      'the same crossing filed a second proposal',
    ).toEqual([])
    expect(
      second.alreadyProposed.some((one) => one.key === 'chain:record.list' && one.recordId === mine[0]?.recordId),
      'the second call did not say the crossing had already been proposed',
    ).toBe(true)
    expect(howMany(WORKSPACE), 'a crossing was proposed twice').toBe(first.filed.length)
  })

  it('carries the numbers behind the crossing, and puts the fork to the person', async () => {
    const filed = await app.inject({
      method: 'GET',
      url: '/api/records?kind=proposal&shape=full',
      headers: AS_AN_AGENT,
    })
    const body = JSON.parse(filed.body) as { records: { id: string; data: Record<string, unknown> }[] }
    const one = body.records.find((row) => row.data['source'] === patternFoundBy('chain:record.list'))
    expect(one, 'the proposal does not say which crossing it came from').toBeTruthy()
    const data = one?.data ?? {}
    expect(String(data['question']), 'the proposal asks nothing').toContain('?')
    expect((data['options'] as string[]).length, 'the crossing generator wrote fewer than two answers').toBeGreaterThanOrEqual(2)
    expect(
      (data['evidence'] as string[]).join(' '),
      'the proposal does not carry the numbers the threshold was crossed by',
    ).toContain('threshold')
    expect(data['who_settles_it'], 'the fork was not put to the owner').toBe('the owner')
  })

  it('changes nothing but the proposal it files', async () => {
    const before = t.client.sqlite.prepare('select count(*) as n from records').get() as { n: number }
    const kindsBefore = t.client.sqlite
      .prepare('select kind, count(*) as n from records group by kind order by kind')
      .all() as { kind: string; n: number }[]
    aChainThatCrosses('record.read')
    const out = await propose()
    expect(out.filed.length, 'nothing was filed, so this test measured nothing').toBeGreaterThan(0)
    const after = t.client.sqlite.prepare('select count(*) as n from records').get() as { n: number }
    expect(after.n - before.n, 'more rows were written than the proposals this call reported filing').toBe(
      out.filed.length,
    )
    const kindsAfter = t.client.sqlite
      .prepare('select kind, count(*) as n from records group by kind order by kind')
      .all() as { kind: string; n: number }[]
    for (const row of kindsAfter) {
      if (row.kind === 'proposal') continue
      const was = kindsBefore.find((one) => one.kind === row.kind)?.n ?? 0
      expect(row.n, `a ${row.kind} record was written, and only a proposal may be`).toBe(was)
    }
  })

  it('does not ask again about a crossing whose proposal somebody deleted', async () => {
    const filed = await app.inject({ method: 'GET', url: '/api/records?kind=proposal&shape=full', headers: AS_AN_AGENT })
    const body = JSON.parse(filed.body) as { records: { id: string; data: Record<string, unknown> }[] }
    const one = body.records.find((row) => row.data['source'] === patternFoundBy('chain:record.read'))
    expect(one, 'the proposal to delete is not there').toBeTruthy()
    // Deleted by the person, because an agent may not take an unsettled fork out of their queue --
    // the server refuses that, and the refusal is right.
    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/records/${String(one?.id)}`,
      headers: { ...AS_AN_AGENT, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
    })
    expect(removed.statusCode, removed.body).toBeLessThan(300)

    aChainThatCrosses('record.read')
    const out = await propose()
    expect(
      out.filed.filter((row) => row.key === 'chain:record.read'),
      'a crossing whose proposal was deleted was proposed all over again',
    ).toEqual([])
    const said = out.alreadyProposed.find((row) => row.key === 'chain:record.read')
    expect(said, 'the deleted proposal was not reported as one').toBeTruthy()
    expect(said?.deleted, 'nothing said the standing proposal had been deleted').toBe(true)
  })
})
