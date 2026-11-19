// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Every office, agent, reason and value in this test is made up. No merge tool starts.
 * The settings door runs against a throwaway database in process, never the live office.
 *
 * THE MERGE TOOL'S SIX GUARDS ARE ROWS OF THE GATES PANEL (wave 13r round Z2), and each moves only as decided. Four
 * allow only block, so nobody can move them: the pinned commit is what was sealed, a resolution is replayed from its
 * own ref, the tested clone is the integrated result, and a withdrawn entry's tool stops. Two allow block and remind,
 * stand at remind in both kinds of office, and may be moved by the person or a secretary, never to off: the plugin
 * pages are built before a landing, and the office is healthy after it. Where each is counted is in
 * tests/the-merge-tool-gates-are-counted-rows.test.ts.
 *
 * WHAT GOES RED. Control run first. Give a block-only row remind, or give one of the two remind rows off, or start one
 * at block, or let only the person move it, and a case here turns red.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { gatePosition } from '../src/config/settings.mjs'
import { SETTING_WORDS } from '../src/config/word-sources.mjs'
import { theWordAPageDraws } from './words-waiting-for-translation.ts'

const WORKSPACE = 'default'
const SECRETARY = 'made-up-secretary'
const WORKER = 'made-up-worker'
const BECAUSE = 'Made-up reason for a gate'

const BLOCK_ONLY = [
  ['pinned-commit-is-what-was-sealed', 'MOLE_OFFICE_GATE_PINNED_COMMIT_IS_WHAT_WAS_SEALED'],
  ['resolution-replayed-from-its-own-ref', 'MOLE_OFFICE_GATE_RESOLUTION_REPLAYED_FROM_ITS_OWN_REF'],
  ['tested-clone-is-the-integrated-result', 'MOLE_OFFICE_GATE_TESTED_CLONE_IS_THE_INTEGRATED_RESULT'],
  ['withdrawn-entry-tool-stops', 'MOLE_OFFICE_GATE_WITHDRAWN_ENTRY_TOOL_STOPS'],
] as const
const BLOCK_OR_REMIND = [
  ['plugin-pages-built-before-landing', 'MOLE_OFFICE_GATE_PLUGIN_PAGES_BUILT_BEFORE_LANDING'],
  ['office-healthy-after-landing', 'MOLE_OFFICE_GATE_OFFICE_HEALTHY_AFTER_LANDING'],
] as const

let t: TestDb
let app: FastifyInstance
const keys = new Map<string, string>()
const moved = new Set<string>()

const asPerson = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const as = (handle: string) => ({ 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': keys.get(handle) ?? '' })

async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  // A reply that carries a key is shown with the key hidden, so no log holds one.
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body.replace(/[0-9a-f]{64}/g, '<a key>') }
}
const change = (headers: Record<string, string>, setting: string, value: string | null) => {
  moved.add(setting)
  return call('POST', '/api/office/settings', headers, { changes: [{ name: setting, value }], because: BECAUSE })
}
const stored = (setting: string) => t.client.sqlite.prepare('SELECT value FROM runtime_settings WHERE name = ?').get(setting) as { value: string } | undefined
const counted = (gate: string) => t.client.sqlite.prepare('SELECT would_stop, stopped, reminded FROM gate_counts WHERE gate = ?').get(gate)

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const [handle, role] of [[SECRETARY, 'secretary'], [WORKER, 'worker']] as const) {
    const started = await call('POST', '/api/agents/started', asPerson, { handle, name: `Made-up ${handle}`, role })
    expect(started.status, started.raw).toBe(201)
    keys.set(handle, String(started.body['whatToGiveIt']?.key ?? ''))
  }
}, 60_000)

afterEach(async () => {
  for (const setting of moved) await call('POST', '/api/office/settings', asPerson, { changes: [{ name: setting, value: null }], because: BECAUSE })
  moved.clear()
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the merge tool\'s six gate rows', () => {
  // Mutation: give one of the four remind or off, or count it somewhere other than the merge tool, and this turns red.
  it('keeps four block-only rows that nobody can move, and reads any other value of theirs as a refusal by name', async () => {
    const { GATES } = await import('../src/config/gates.mjs')
    for (const [id, setting] of BLOCK_ONLY) {
      expect(GATES.find(row => row.id === id), id).toEqual({ id, class: 'quality', group: 'the-merge-queue', setting, positions: { kind: 'block-remind-off', allowed: ['block'] }, whoMayChange: 'the-person', defaults: { buildsMoleOffice: 'block', ordinary: 'block' }, countedBy: 'the-merge-tool', looksAgain: null })
      for (const value of ['remind', 'off']) {
        const refused = await change(asPerson, setting, value)
        expect(refused.status, refused.raw).toBe(400)
        expect(refused.body['error']).toContain(setting)
        expect(stored(setting), `${setting} at ${value}`).toBeUndefined()
        expect(() => gatePosition(id, { [setting]: value }), `${setting} at ${value}`).toThrow(new RegExp(`${setting} is "${value}"`))
      }
      const saved = await change(asPerson, setting, 'block')
      expect(saved.status, saved.raw).toBe(200)
      expect(gatePosition(id, {}), id).toBe('block')
      expect(counted(id), id).toBeUndefined()
    }
  })

  // Mutation: give one of the two off, start one at block, or let only the person move it, and this turns red.
  it('keeps two rows at remind by default that the person or a secretary moves between block and remind, and never to off', async () => {
    const { GATES } = await import('../src/config/gates.mjs')
    for (const [id, setting] of BLOCK_OR_REMIND) {
      expect(GATES.find(row => row.id === id), id).toEqual({ id, class: 'quality', group: 'the-merge-queue', setting, positions: { kind: 'block-remind-off', allowed: ['block', 'remind'] }, whoMayChange: 'the-person-or-a-secretary', defaults: { buildsMoleOffice: 'remind', ordinary: 'remind' }, countedBy: 'the-merge-tool', looksAgain: null })
      expect(gatePosition(id, {}), id).toBe('remind')
      expect(() => gatePosition(id, { [setting]: 'off' }), setting).toThrow(new RegExp(`${setting} is "off"`))
      for (const headers of [asPerson, as(SECRETARY)]) {
        const refused = await change(headers, setting, 'off')
        expect(refused.status, refused.raw).toBe(400)
        expect(refused.body['error']).toContain(setting)
        expect(stored(setting)).toBeUndefined()
      }
      const atBlock = await change(as(SECRETARY), setting, 'block')
      expect(atBlock.status, atBlock.raw).toBe(200)
      expect(stored(setting)?.value).toBe('block')
      const atRemind = await change(as(SECRETARY), setting, 'remind')
      expect(atRemind.status, atRemind.raw).toBe(200)
      expect(stored(setting)?.value).toBe('remind')
      const byTheWorker = await change(as(WORKER), setting, 'block')
      expect(byTheWorker.status, `a worker moved ${setting}: ${byTheWorker.raw}`).toBeGreaterThanOrEqual(400)
      expect(stored(setting)?.value).toBe('remind')
      expect(counted(id), id).toBeUndefined()
    }
  })

  it('draws each row with its setting\'s own words', () => {
    for (const [id, setting] of [...BLOCK_ONLY, ...BLOCK_OR_REMIND]) {
      const words = (SETTING_WORDS as Record<string, string>)[setting]
      expect(words, setting).toEqual(expect.any(String))
      expect(theWordAPageDraws('en', `gates.row.${id}`), id).toBe(words)
      expect(theWordAPageDraws('en', `settingsWords.${setting}`), id).toBe(words)
    }
  })
})
