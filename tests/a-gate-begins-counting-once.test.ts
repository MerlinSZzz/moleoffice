// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { localStamp } from '../src/shared/typed-time.mjs'
let t: TestDb
beforeEach(async () => { t = await freshDb() })
afterEach(() => { vi.restoreAllMocks(); t.close() })
const modulePath = '../src/server/lib/gate-counts.ts'
/** The gates no site counts yet, and the gates nothing counts, which get no zero row, read from where the code keeps them. */
async function theCountedGates() {
  const {GATES} = await import('../src/config/gates.mjs')
  const {GATES_THE_SPOOL_WAITS_FOR} = await import('../src/config/gate-count-spool.mjs')
  const waiting = new Set(GATES_THE_SPOOL_WAITS_FOR.map(row => row.gate))
  const uncounted = (gate: (typeof GATES)[number]) => waiting.has(gate.id) || gate.countedBy === 'nobody'
  return {counted: GATES.filter(gate => !uncounted(gate)), waiting: GATES.filter(uncounted)}
}
// Mutation: write a zero row for a gate the spool still waits for or a gate nothing counts, or leave one out for a gate
// that is counted.
it('writes a zero row only for a counted gate with no day at all, and names what began', async () => {
  const {counted, waiting} = await theCountedGates()
  const {gateCountsBegin} = await import(modulePath)
  t.client.sqlite.prepare('INSERT INTO gate_counts (gate,day,would_stop) VALUES (?,?,?)').run('house-rule-reds', '2000-01-01', 7)
  const prepare = vi.spyOn(t.client.sqlite, 'prepare')
  const first = gateCountsBegin()
  const rows = t.client.sqlite.prepare('SELECT * FROM gate_counts ORDER BY gate,day').all()
  expect(rows).toHaveLength(counted.length)
  expect(rows).toContainEqual({gate: 'house-rule-reds', day: '2000-01-01', would_stop: 7, stopped: 0, reminded: 0, ignored: 0, heeded: 0})
  for (const gate of counted.filter(g => g.id !== 'house-rule-reds')) {
    expect(rows).toContainEqual({gate: gate.id, day: localStamp(new Date()).slice(0, 10), would_stop: 0, stopped: 0, reminded: 0, ignored: 0, heeded: 0})
    expect(first.line).toContain(gate.id)
  }
  // A gate no site counts yet says it is not counted, rather than a zero nobody measured, and so does a gate nothing counts.
  expect(waiting.filter(gate => gate.countedBy === 'nobody').length, 'no gate nothing counts is in the list').toBeGreaterThan(0)
  for (const gate of waiting) expect(rows.some(row => (row as {gate: string}).gate === gate.id), gate.id).toBe(false)
  expect(first.line).toContain(String(counted.length - 1))
  prepare.mockClear()
  expect(gateCountsBegin().line).toMatch(/No gate began counting today/)
  expect(prepare.mock.calls.filter(([sql]) => /\b(?:INSERT|UPDATE|DELETE)\b/i.test(sql))).toEqual([])
})

it('names one newly counted gate in the singular', async () => {
  const {counted} = await theCountedGates()
  const {gateCountsBegin} = await import(modulePath)
  const put = t.client.sqlite.prepare('INSERT INTO gate_counts (gate,day) VALUES (?,?)')
  for (const gate of counted.slice(0, -1)) put.run(gate.id, '2000-01-01')
  expect(gateCountsBegin().line).toMatch(/^1 gate began counting today /)
})
