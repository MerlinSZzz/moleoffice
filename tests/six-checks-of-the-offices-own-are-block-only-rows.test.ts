// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Every office, reason and value in this test is made up. The doors run against a throwaway database in process,
 * never the live office.
 *
 * SIX CHECKS OF THE OFFICE'S OWN ARE ROWS OF THE GATES PANEL (wave 13r round AA), from round H's table, and none can be
 * moved: each allows only block, in both kinds of office. Four are counted by the server where each refuses. Nothing
 * counts the other two, and their words say why: the old setting names refuse before any database opens, and a test
 * world's keys are held by the world's own copy and its starter. Where the four are counted is in
 * tests/a-refused-setting-value-is-counted-once.test.ts, tests/a-refused-dsh-transcript-is-counted-once.test.ts,
 * tests/a-keyless-act-at-an-asking-door-is-counted.test.ts and tests/a-refused-role-cards-start-is-counted.test.ts.
 *
 * WHAT GOES RED. Control run first. Give a row remind or off, let a secretary move one, count one of the two that
 * nothing counts, drop a reason from their words, drop from a counted row's words what the server does not count, or
 * let the outside door take a count for any of the six.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { gatePosition } from '../src/config/settings.mjs'
import { SETTING_WORDS } from '../src/config/word-sources.mjs'
import { theWordAPageDraws } from './words-waiting-for-translation.ts'

const WORKSPACE = 'default'
const BECAUSE = 'Made-up reason for a gate'
const COUNTED_BY_THE_SERVER = [
  ['every-setting-value-is-known', 'MOLE_OFFICE_GATE_EVERY_SETTING_VALUE_IS_KNOWN'],
  ['a-dsh-checks-transcript-is-its-own', 'MOLE_OFFICE_GATE_A_DSH_CHECKS_TRANSCRIPT_IS_ITS_OWN'],
  ['an-act-at-a-keyed-door-needs-a-key', 'MOLE_OFFICE_GATE_AN_ACT_AT_AN_ASKING_DOOR_IS_PROVED'],
  ['the-role-cards-file-is-usable', 'MOLE_OFFICE_GATE_THE_ROLE_CARDS_FILE_IS_USABLE'],
] as const
const COUNTED_BY_NOBODY = [
  ['old-setting-names-stop-the-office', 'MOLE_OFFICE_GATE_OLD_SETTING_NAMES_STOP_THE_OFFICE'],
  ['a-test-world-trusts-only-its-own-keys', 'MOLE_OFFICE_GATE_A_TEST_WORLD_TRUSTS_ONLY_ITS_STARTER_AND_SECRETARIES'],
] as const
// Why nothing counts each of the two, in the words the owner's table and the secretary gave (round AA).
const WHY_NOBODY_COUNTS: Record<string, string[]> = {
  'old-setting-names-stop-the-office': ['Nothing counts this row.', 'before any database opens', 'whichever command next starts from that checkout', "silently drop the old setting's value", 'goes with the check'],
  'a-test-world-trusts-only-its-own-keys': ['only inside a test world', "copied database and starter's environment hold it", 'neither counts it nor moves it', 'No setting reads this row inside a world', 'only shows the gate and its position'],
}
// What the server does not count of the two rows whose counts came with limits, in the words of those limits (round AA).
const WHAT_THE_SERVER_DOES_NOT_COUNT: Record<string, string[]> = {
  'every-setting-value-is-known': ['keeps no copy of the value', 'A value the server meets only in the middle of a write is not counted.', 'a refusal that stops its start before then is not counted', 'A refusal in a tool or in the message worker is not counted either.'],
  'a-dsh-checks-transcript-is-its-own': ["The check tool's own refusal is not counted"],
}

let t: TestDb
let app: FastifyInstance
let office: Record<string, string>
let secretaryKey = ''
const SECRETARY = 'made-up-secretary'
const moved = new Set<string>()
const asPerson = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

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
const counted = (gate: string) => t.client.sqlite.prepare('SELECT * FROM gate_counts WHERE gate = ?').all(gate)

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const keys = JSON.parse(readFileSync(join(dirname(t.file), 'keys.json'), 'utf8'))
  office = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-key': keys.office, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker' }
  const started = await call('POST', '/api/agents/started', asPerson, { handle: SECRETARY, name: 'Made-up secretary', role: 'secretary' })
  expect(started.status, started.raw).toBe(201)
  secretaryKey = String(started.body['whatToGiveIt']?.key ?? '')
}, 60_000)

afterEach(async () => {
  for (const setting of moved) await call('POST', '/api/office/settings', asPerson, { changes: [{ name: setting, value: null }], because: BECAUSE })
  moved.clear()
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("six checks of the office's own", () => {
  // Mutation: give one of the six remind or off, put it in another group, let a secretary change it, or count one of
  // the two that nothing counts.
  it('keeps six block-only rows that nobody can move, and reads any other value of theirs as a refusal by name', async () => {
    const { GATES } = await import('../src/config/gates.mjs')
    for (const [ids, countedBy] of [[COUNTED_BY_THE_SERVER, 'the-server'], [COUNTED_BY_NOBODY, 'nobody']] as const) {
      for (const [id, setting] of ids) {
        expect(GATES.find(row => row.id === id), id).toEqual({ id, class: 'quality', group: 'the-offices-own-checks', setting, positions: { kind: 'block-remind-off', allowed: ['block'] }, whoMayChange: 'the-person', defaults: { buildsMoleOffice: 'block', ordinary: 'block' }, countedBy, looksAgain: null })
        // The settings reading leaves out every setting whose name holds KEY, so no row's setting may.
        expect(setting, setting).not.toContain('KEY')
        expect(gatePosition(id, {}), id).toBe('block')
        for (const value of ['remind', 'off']) {
          const refused = await change(asPerson, setting, value)
          expect(refused.status, refused.raw).toBe(400)
          expect(refused.body['error']).toContain(setting)
          expect(stored(setting), `${setting} at ${value}`).toBeUndefined()
          expect(() => gatePosition(id, { [setting]: value }), `${setting} at ${value}`).toThrow(new RegExp(`${setting} is "${value}"`))
        }
        const bySecretary = await change({ 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': SECRETARY, 'x-mole-office-key': secretaryKey }, setting, 'block')
        expect(bySecretary.status, `a secretary moved ${setting}: ${bySecretary.raw}`).toBeGreaterThanOrEqual(400)
        expect(stored(setting), setting).toBeUndefined()
        const saved = await change(asPerson, setting, 'block')
        expect(saved.status, saved.raw).toBe(200)
        expect(stored(setting)?.value, setting).toBe('block')
      }
    }
  })

  // Mutation: drop a reason from either row's words, count either row at the server's start or at the outside door,
  // or draw the two with the sentence of a gate that is only not counted yet.
  it('shows the two rows nothing counts at block, with no count, and says in their words why nothing counts them', async () => {
    const { gateCountsBegin } = await import('../src/server/lib/gate-counts.ts')
    gateCountsBegin()
    for (const [id, setting] of COUNTED_BY_NOBODY) {
      const words = (SETTING_WORDS as Record<string, string>)[setting]!
      for (const reason of WHY_NOBODY_COUNTS[id]!) expect(words, `${id}: ${reason}`).toContain(reason)
      const read = await call('GET', `/api/office/gates?gate=${id}`, asPerson)
      expect(read.status, read.raw).toBe(200)
      expect(read.body['row'], id).toMatchObject({ id, value: 'block', countedBy: 'nobody', counts: null })
      const sent = await call('POST', `/api/office/gates/${id}/met`, office, { position: 'block' })
      expect(sent.status, sent.raw).toBe(409)
      expect(sent.body['code'], id).toBe('gateCountNobodyCounts')
      expect(sent.body['error'], id).toMatch(/Nothing was counted\.$/)
      expect(counted(id), id).toEqual([])
    }
    // The page draws its own sentence for such a row, not the one for a gate that is only not counted yet.
    const nobody = theWordAPageDraws('en', 'gates.count.nobody')
    expect(nobody).toEqual(expect.any(String))
    expect(nobody).not.toBe(theWordAPageDraws('en', 'gates.notCounted'))
  })

  // Mutation: let the outside door take a count for one of the four, or leave one without its first zero row.
  it('begins counting the four the server counts, and refuses a count for them from outside', async () => {
    const { gateCountsBegin } = await import('../src/server/lib/gate-counts.ts')
    gateCountsBegin()
    for (const [id] of COUNTED_BY_THE_SERVER) {
      expect(counted(id), id).toHaveLength(1)
      const before = counted(id)
      const sent = await call('POST', `/api/office/gates/${id}/met`, office, { position: 'block' })
      expect(sent.status, sent.raw).toBe(409)
      expect(sent.body['code'], id).toBe('gateCountAlreadyInServer')
      expect(counted(id), id).toEqual(before)
    }
  })

})
