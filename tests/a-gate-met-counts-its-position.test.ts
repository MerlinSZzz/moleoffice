// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** All counts are made up in a fresh test office. */
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
let t: TestDb
const modulePath = '../src/server/lib/gate-counts.ts'
async function counters(): Promise<{gateMet: (id: string, position?: string) => string; gateLookedAgain: (id: string, tally: {ignored: number; heeded: number}) => void}> { return import(modulePath) }
beforeAll(async () => { t = await freshDb() }, 60_000)
// Each case starts with the gate_counts table as the office first made it, because these counts are its subject.
beforeEach(() => { t.client.sqlite.prepare('DELETE FROM gate_counts').run() })
afterEach(() => {
  // The saved position case sets this, and a later case must not inherit it.
  t.client.sqlite.prepare("DELETE FROM runtime_settings WHERE name = 'MOLE_OFFICE_GATE_HOUSE_RULES'").run()
})
afterAll(() => { t.close() })
function row(id: string) { return t.client.sqlite.prepare('SELECT * FROM gate_counts WHERE gate = ?').get(id) }
it('adds once per encounter in the same daily row and returns the position the site acts on', async () => {
  const {gateMet} = await counters()
  for (const position of ['off', 'remind', 'block']) expect(gateMet('house-rule-reds', position)).toBe(position)
  expect(row('house-rule-reds')).toMatchObject({would_stop: 3, stopped: 1, reminded: 1, ignored: 0, heeded: 0})
  expect(gateMet('conflict-resolving', '1')).toBe('1')
  expect(row('conflict-resolving')).toMatchObject({would_stop: 1, stopped: 0, reminded: 0})
  expect(gateMet('checks-an-hour', '2')).toBe('2')
  expect(row('checks-an-hour')).toMatchObject({would_stop: 1, stopped: 0, reminded: 0})
  expect(t.client.sqlite.prepare('SELECT count(*) AS n FROM gate_counts').get()).toEqual({n: 3})
})
it('uses the saved position when the site has not read it, and rejects unknown ids and forbidden positions without counting', async () => {
  const {gateMet} = await counters()
  t.client.sqlite.prepare('INSERT INTO runtime_settings (name,value) VALUES (?,?)').run('MOLE_OFFICE_GATE_HOUSE_RULES', 'remind')
  expect(gateMet('house-rule-reds')).toBe('remind')
  for (const [id, position] of [['made-up-gate', 'off'], ['file-territories', 'on'], ['checks-an-hour', '0'], ['conflict-resolving', 'on']]) {
    expect(() => gateMet(id!, position!)).toThrow(id!)
    if (id !== 'made-up-gate') expect(() => gateMet(id!, position!)).toThrow(position!)
  }
  expect(t.client.sqlite.prepare('SELECT sum(would_stop) AS n FROM gate_counts').get()).toEqual({n: 1})
})
it('counts a later look only for a gate that has one, with whole nonnegative item counts', async () => {
  const {gateLookedAgain} = await counters()
  gateLookedAgain('before-the-seal', {ignored: 2, heeded: 3})
  expect(row('before-the-seal')).toMatchObject({would_stop: 0, stopped: 0, reminded: 0, ignored: 2, heeded: 3})
  expect(() => gateLookedAgain('house-rule-reds', {ignored: 1, heeded: 0})).toThrow('house-rule-reds')
  for (const bad of [-1, 0.5, NaN, Infinity]) expect(() => gateLookedAgain('before-the-seal', {ignored: bad, heeded: 0})).toThrow()
  expect(() => gateLookedAgain('before-the-seal', {ignored: 0, heeded: -1})).toThrow()
  expect(row('before-the-seal')).toMatchObject({ignored: 2, heeded: 3})
})
