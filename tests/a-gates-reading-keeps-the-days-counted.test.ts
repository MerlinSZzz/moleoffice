// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** All dates and counts are made up in a fresh test office. */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { localStamp } from '../src/shared/typed-time.mjs'
let t: TestDb, app: FastifyInstance
beforeEach(async () => { t = await freshDb(); app = (await apiApp()).app; await app.ready() })
afterEach(async () => { vi.restoreAllMocks(); await app.close(); t.close() })
const modulePath = '../src/server/lib/gate-counts.ts'
function tally(n: number) { return {wouldStop: n, stopped: n, reminded: 0, ignored: 0, heeded: 0} }
function dayAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return localStamp(d).slice(0, 10) }
async function rows() { const reply = await app.inject({method: 'GET', url: '/api/office/gates'}); expect(reply.statusCode, reply.body).toBe(200); return reply.json().classes.flatMap((c: {groups: {rows: {id: string; counts: unknown}[]}[]}) => c.groups.flatMap(g => g.rows)) as {id: string; counts: unknown}[] }
it('uses null before counting and includes exactly today and the previous 29 local days', async () => {
  expect((await rows()).find(r => r.id === 'house-rule-reds')?.counts).toBeNull()
  const {gateMet} = await import(modulePath)
  gateMet('house-rule-reds', 'block')
  expect((await rows()).find(r => r.id === 'house-rule-reds')?.counts).toEqual({began: dayAgo(0), lastThirtyDays: tally(1), sinceCountingBegan: tally(1)})
  const put = t.client.sqlite.prepare('INSERT INTO gate_counts (gate,day,would_stop,stopped) VALUES (?,?,?,?)')
  put.run('house-rule-reds', dayAgo(40), 4, 4)
  put.run('house-rule-reds', dayAgo(30), 8, 8)
  put.run('house-rule-reds', dayAgo(29), 2, 2)
  const prepare = vi.spyOn(t.client.sqlite, 'prepare')
  const reading = await rows()
  expect(reading.find(r => r.id === 'house-rule-reds')?.counts).toEqual({began: dayAgo(40), lastThirtyDays: tally(3), sinceCountingBegan: tally(15)})
  expect(prepare.mock.calls.filter(([sql]) => /gate_counts/.test(sql))).toHaveLength(1)
  expect(prepare.mock.calls.find(([sql]) => /gate_counts/.test(sql))?.[0]).toMatch(/GROUP BY gate/i)
})
