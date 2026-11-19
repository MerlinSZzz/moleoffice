// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Every office, setting value and count in this test is made up. The doors run against a throwaway database in
 * process, never the live office.
 *
 * EACH REFUSED SETTING VALUE IS COUNTED ONCE WHILE THE SERVER RUNS (wave 13r round AA). The gate
 * every-setting-value-is-known is counted the first time the server refuses a value of a setting, and never again for
 * that setting and value, however many pages read it. Its memory holds the setting's name and a hash of the value,
 * never the value, and no count or log line holds the value either. A value refused inside a write, or inside a check
 * of one, is counted the next time the server meets it outside a write. A process that never began counting, as a tool
 * or the message worker, counts nothing. A count that fails is said on its own line and never replaces the refusal.
 *
 * WHAT GOES RED. Control run first. Count every meeting, key the memory by the name alone or by the value alone, keep
 * the value itself, count inside a write or remember a value met there, let a failed count replace the refusal or say
 * nothing of it, or count in a process that never began counting, and a case here turns red.
 */
import { createHash } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const WORKSPACE = 'default'
const BECAUSE = 'Made-up reason for a setting'
const GATE = 'every-setting-value-is-known'
const ITS_SETTING = 'MOLE_OFFICE_GATE_EVERY_SETTING_VALUE_IS_KNOWN'
const ANOTHER_SETTING = 'MOLE_OFFICE_GATE_THE_ROLE_CARDS_FILE_IS_USABLE'
const asPerson = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const NOT_COUNTED = (setting: string) => `A refused value of ${setting} was not counted on the gate ${GATE}: `

let t: TestDb
let app: FastifyInstance
let settings: typeof import('../src/config/settings.mjs')
let counts: typeof import('../src/server/lib/gate-counts.ts')
let checks: typeof import('../src/server/lib/only-a-check.ts')

/** The gate's refusals so far, as the table holds them. */
function counted(): number {
  return (t.client.sqlite.prepare('SELECT coalesce(sum(would_stop), 0) AS n FROM gate_counts WHERE gate = ?').get(GATE) as {n: number}).n
}
const store = (setting: string, value: string) => t.client.sqlite.prepare('INSERT INTO runtime_settings (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value').run(setting, value)
async function read(): Promise<Array<{name: string; storedButRefused: {value: string; reason: string} | null}>> {
  const reply = await app.inject({ method: 'GET', url: '/api/office/settings', headers: asPerson })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as {settings: Array<{name: string; storedButRefused: {value: string; reason: string} | null}>}).settings
}
async function propose(setting: string, value: string) {
  const reply = await app.inject({ method: 'POST', url: '/api/office/settings', headers: asPerson, payload: { changes: [{ name: setting, value }], because: BECAUSE } })
  return { status: reply.statusCode, error: String((reply.json() as {error?: unknown}).error ?? '') }
}
/** The value refused by readSetting itself, with its own words. */
const refusedByName = (setting: string, value: string) => () => settings.readSetting(setting, { [setting]: value })

/** Every line written to the console while `run` runs, so a case can say no line holds a value. */
async function linesWhile(run: () => Promise<void> | void): Promise<string[]> {
  const lines: string[] = []
  const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(level => vi.spyOn(console, level).mockImplementation((...said: unknown[]) => { lines.push(said.map(String).join(' ')) }))
  try { await run() } finally { for (const spy of spies) spy.mockRestore() }
  return lines
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // The app's own instances, which the reset in freshDb gave it.
  settings = await import('../src/config/settings.mjs')
  counts = await import('../src/server/lib/gate-counts.ts')
  checks = await import('../src/server/lib/only-a-check.ts')
}, 60_000)

afterEach(() => {
  t.client.sqlite.prepare('DELETE FROM runtime_settings WHERE name IN (?, ?)').run(ITS_SETTING, ANOTHER_SETTING)
  t.client.sqlite.exec('DROP TRIGGER IF EXISTS made_up_no_count_of_a_refused_value; DROP TRIGGER IF EXISTS made_up_no_new_count_of_a_refused_value')
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

// This case runs first, before anything in this file begins counting.
// Mutation: install the count when gate-counts.ts loads, rather than when the server's start begins counting.
it('counts nothing in a process that never began counting, as a tool or the message worker', async () => {
  expect(refusedByName(ITS_SETTING, 'made-up-in-a-tool')).toThrow(`${ITS_SETTING} is "made-up-in-a-tool"`)
  const proposed = await propose(ITS_SETTING, 'made-up-in-a-tool')
  expect(proposed.status, proposed.error).toBe(400)
  expect(counted()).toBe(0)
})

// Mutation: count every meeting; key the memory by the setting's name alone, or by the value alone.
it('counts a refused value once, however often the server meets it, and each other value or setting once', async () => {
  counts.gateCountsBegin()
  expect(counted()).toBe(0)
  store(ITS_SETTING, 'made-up-position')
  // A reading meets the stored value twice, once for its value and once for the write check.
  expect((await read()).find(s => s.name === ITS_SETTING)?.storedButRefused?.value).toBe('made-up-position')
  expect(counted()).toBe(1)
  await read()
  expect(() => settings.gatePosition(GATE)).toThrow(`${ITS_SETTING} is "made-up-position"`)
  expect(counted(), 'the same value met again').toBe(1)
  store(ITS_SETTING, 'off')
  await read()
  expect(counted(), 'another value of the same setting').toBe(2)
  store(ANOTHER_SETTING, 'made-up-position')
  await read()
  expect(counted(), 'the same value of another setting').toBe(3)
  // A value proposed at the settings door is refused before its write begins, so it is counted at once.
  const proposed = await propose(ANOTHER_SETTING, 'made-up-proposal')
  expect(proposed.status, proposed.error).toBe(400)
  expect(proposed.error).toContain(`${ANOTHER_SETTING} is "made-up-proposal"`)
  expect(counted()).toBe(4)
  expect((await propose(ANOTHER_SETTING, 'made-up-proposal')).status).toBe(400)
  expect(counted(), 'the same proposal again').toBe(4)
})

// Mutation: hand the count the value itself, or keep it in the memory.
it("hands the count the setting's name and a hash of the value, and no count or line holds the value", async () => {
  const VALUE = 'made-up-value-nobody-may-keep'
  const handed: string[] = []
  settings.countRefusedSettingValuesWith((which) => { handed.push(which) })
  try {
    expect(refusedByName(ITS_SETTING, VALUE)).toThrow(`${ITS_SETTING} is "${VALUE}"`)
  } finally { counts.gateCountsBegin() }
  expect(handed).toEqual([`${ITS_SETTING} ${createHash('sha256').update(VALUE).digest('hex')}`])
  const before = counted()
  const lines = await linesWhile(async () => {
    store(ITS_SETTING, VALUE)
    await read()
  })
  expect(counted()).toBe(before + 1)
  expect(JSON.stringify(t.client.sqlite.prepare('SELECT * FROM gate_counts WHERE gate = ?').all(GATE))).not.toContain(VALUE)
  expect(lines.filter(line => line.includes(VALUE))).toEqual([])
})

// Mutation: count inside a write, or remember a value met there without counting it.
it('counts nothing inside a write or a check of one, and counts the value the next time it is met outside', () => {
  counts.gateCountsBegin()
  const before = counted()
  t.client.sqlite.transaction(() => { expect(refusedByName(ITS_SETTING, 'made-up-inside-a-write')).toThrow() })()
  expect(counted(), 'met inside a write that was kept').toBe(before)
  checks.writeOrCheck('check', () => { expect(refusedByName(ITS_SETTING, 'made-up-inside-a-write')).toThrow(); return null })
  expect(counted(), 'met inside a check of a write').toBe(before)
  expect(refusedByName(ITS_SETTING, 'made-up-inside-a-write')).toThrow()
  expect(counted(), 'met outside a write').toBe(before + 1)
  expect(refusedByName(ITS_SETTING, 'made-up-inside-a-write')).toThrow()
  expect(counted()).toBe(before + 1)
})

// Mutation: let the count's failure replace the refusal, say nothing of it, or name the value in the line.
it('says a count that fails on its own line, still refuses the value in its own words, and counts it when it can', async () => {
  counts.gateCountsBegin()
  const VALUE = 'made-up-uncountable'
  // A count on another day would be a new row, so both ways in are refused.
  t.client.sqlite.exec(`CREATE TRIGGER made_up_no_count_of_a_refused_value BEFORE UPDATE ON gate_counts WHEN NEW.gate = '${GATE}' AND NEW.would_stop > OLD.would_stop BEGIN SELECT RAISE(ABORT, 'Made-up: this database refuses the count.'); END;
    CREATE TRIGGER made_up_no_new_count_of_a_refused_value BEFORE INSERT ON gate_counts WHEN NEW.gate = '${GATE}' AND NEW.would_stop > 0 BEGIN SELECT RAISE(ABORT, 'Made-up: this database refuses the count.'); END;`)
  const before = counted()
  let proposed = { status: 0, error: '' }
  const lines = await linesWhile(async () => { proposed = await propose(ANOTHER_SETTING, VALUE) })
  expect(proposed.status, proposed.error).toBe(400)
  expect(proposed.error).toContain(`${ANOTHER_SETTING} is "${VALUE}"`)
  expect(proposed.error).not.toContain('Made-up: this database refuses the count.')
  expect(lines).toContain(`${NOT_COUNTED(ANOTHER_SETTING)}Made-up: this database refuses the count.`)
  expect(lines.filter(line => line.includes(VALUE))).toEqual([])
  expect(counted()).toBe(before)
  // A count that failed is not remembered, so the value is counted the next time the count can be written.
  t.client.sqlite.exec('DROP TRIGGER made_up_no_count_of_a_refused_value; DROP TRIGGER made_up_no_new_count_of_a_refused_value')
  expect((await propose(ANOTHER_SETTING, VALUE)).status).toBe(400)
  expect(counted()).toBe(before + 1)
})
