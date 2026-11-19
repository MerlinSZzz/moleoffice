// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY KEY RECORDS HOW THE CALL THAT MADE IT WAS PROVED, AND ONE READER NAMES THE LIVE AGENTS THAT
 * HOLD NO PROVED KEY. It follows point 3 of a decision. List SuiA61s5C7KO says 222 of
 * 233 keys held had no proved holder. Migration 0180, src/server/lib/provedkeys.ts.
 *
 * In a test office of its own, driven through the doors over a real listener:
 *
 *   (a) A key made by the person's grant records their press. A key made by a registration that carried
 *       no key, while the window is open, records that no key proved it, and reads as unproved. A key
 *       row from before migration 0180 holds nothing and reads as unproved.
 *   (b) The reader lists exactly the live agents with no proved key, each with its reason, and leaves
 *       out every agent that holds a proved key, and every retired agent. A key a starter makes with
 *       its own key is proved only when the starter's own keys are. The sentence names at most 20.
 *
 * WHAT MAKES IT GO RED (each proved after a control run; see the commit message):
 *   holdTheKeyWhoseHashIs writes every key as proved ('the-persons-key')    → (a) and (b)
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'
import type { FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let here = ''
let provedkeys: typeof import('../src/server/lib/provedkeys.ts')

const PERSON_KEY = randomBytes(32).toString('hex')
const OFFICE_KEY = randomBytes(32).toString('hex')
const DIR = `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`

/** A reply shown in a failure message with every key in it replaced, so no log ever carries a key. */
const hidden = (text: string): string => text.replace(/[0-9a-f]{64}/g, '<a secret>')

const asAgent = (handle: string, key?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
})
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-key': PERSON_KEY,
}
/** The owner's name and no key: a claim the open window still lets through from this computer. */
const THE_OWNERS_NAME_WITH_NO_KEY = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

interface Reply {
  status: number
  json: Record<string, unknown>
  text: string
}

async function call(method: string, url: string, headers: Record<string, string>, body?: unknown): Promise<Reply> {
  const res = await fetch(`${here}${url}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: res.status, json, text: hidden(text) }
}

function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as
    | { id: string }
    | undefined
  expect(row, `no live agent row for ${handle}`).toBeDefined()
  return row!.id
}

/** The words the agent's live keys record, oldest first. */
function liveKeyWordsOf(handle: string): (string | null)[] {
  return (
    t.client.sqlite
      .prepare('SELECT mint_proved_by AS how FROM held_keys WHERE whose_id = ? AND revoked_at IS NULL ORDER BY made_at, id')
      .all(idOf(handle)) as { how: string | null }[]
  ).map((row) => row.how)
}

/** Start an agent through the door and hand back its key. */
async function start(handle: string, headers: Record<string, string>): Promise<string> {
  const made = await call('POST', '/api/agents/started', headers, { handle, name: `The agent ${handle}` })
  expect(made.status, made.text).toBe(201)
  const key = String((made.json['whatToGiveIt'] as { key?: string }).key)
  expect(key).toMatch(/^[0-9a-f]{64}$/)
  return key
}

const register = (handle: string, extra: Record<string, unknown> = {}): Promise<Reply> =>
  call('POST', '/api/agents/register-myself', asAgent(handle), {
    handle,
    name: `The agent ${handle}`,
    workingDirectory: DIR,
    ...extra,
  })

/** The agent asks for a new key, and the person grants it with their key. Nothing is collected yet. */
async function askAndGrant(handle: string): Promise<string> {
  const asked = await register(handle, { newKey: true })
  expect(asked.status, asked.text).toBe(202)
  const granted = await call('POST', `/api/roles/requests/${String(asked.json['request'])}/grant`, AS_THE_PERSON, {})
  expect(granted.status, granted.text).toBe(200)
  return String(asked.json['askSecret'])
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: PERSON_KEY, office: OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  here = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  provedkeys = await import('../src/server/lib/provedkeys.ts')
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('(a) a key records how the call that made it was proved', () => {
  it('a key made by the person’s grant records their press, and it is proved', async () => {
    await start('granted-one', AS_THE_PERSON)
    expect(liveKeyWordsOf('granted-one'), 'a registration with the person’s key').toEqual(['the-persons-key'])
    const secret = await askAndGrant('granted-one')
    expect(liveKeyWordsOf('granted-one'), 'the grant revokes every key it held').toEqual([])
    const collected = await register('granted-one', { newKey: true, askSecret: secret })
    expect(collected.status, collected.text).toBe(200)
    expect(liveKeyWordsOf('granted-one')).toEqual(['the-persons-press'])
    expect(provedkeys.thisLiveAgentHoldsAProvedKey(idOf('granted-one'))).toBe(true)
  })

  it('a key made by a registration that carried no key, while the window is open, records no key and is unproved', async () => {
    const made = await call('POST', '/api/agents/started', THE_OWNERS_NAME_WITH_NO_KEY, { handle: 'by-name', name: 'By name' })
    expect(made.status, made.text).toBe(201)
    expect(liveKeyWordsOf('by-name')).toEqual(['no-key'])
    expect(provedkeys.thisLiveAgentHoldsAProvedKey(idOf('by-name'))).toBe(false)
  })

  it('a key row from before migration 0180 holds nothing and reads as unproved', async () => {
    await start('old-row', AS_THE_PERSON)
    // THE ROW AS MIGRATION 0180 LEAVES EVERY OLDER ROW: the column added and nothing in it.
    t.client.sqlite.prepare('UPDATE held_keys SET mint_proved_by = NULL WHERE whose_id = ?').run(idOf('old-row'))
    expect(liveKeyWordsOf('old-row')).toEqual([null])
    expect(provedkeys.thisLiveAgentHoldsAProvedKey(idOf('old-row'))).toBe(false)
  })
})

describe('(b) one reader names every live agent that holds no proved key, and why', () => {
  it('lists exactly the live agents with no proved key, with their reasons', async () => {
    // PROVED: the person's key; the person's grant (above); a starter whose own keys are proved, with its own key.
    const provedStarterKey = await start('proved-starter', AS_THE_PERSON)
    await start('proved-worker', asAgent('proved-starter', provedStarterKey))
    expect(liveKeyWordsOf('proved-worker')).toEqual(['a-proved-agents-key'])

    // NOT PROVED, one of each reason.
    const byNameKey = await start('a-by-name-starter', THE_OWNERS_NAME_WITH_NO_KEY)
    await start('on-an-unproved-key', asAgent('a-by-name-starter', byNameKey))
    expect(liveKeyWordsOf('on-an-unproved-key')).toEqual(['an-unproved-agents-key'])
    await start('never-keyed', AS_THE_PERSON)
    t.client.sqlite.prepare('DELETE FROM held_keys WHERE whose_id = ?').run(idOf('never-keyed'))
    await start('all-revoked', AS_THE_PERSON)
    await askAndGrant('all-revoked')
    await start('several', THE_OWNERS_NAME_WITH_NO_KEY)
    t.client.sqlite
      .prepare(
        "INSERT INTO held_keys (id, whose_kind, whose_id, key_hash, made_at, mint_proved_by) VALUES ('several-old', 'agent', ?, ?, '2026-09-01 10:00:00', NULL)",
      )
      .run(idOf('several'), randomBytes(32).toString('hex'))

    // AND A RETIRED AGENT WITH NO KEY IS NOT LISTED.
    await start('retired-one', THE_OWNERS_NAME_WITH_NO_KEY)
    const retired = await call('POST', '/api/participants/agent/retired-one/retire', AS_THE_PERSON, { because: 'the test retires it' })
    expect(retired.status, retired.text).toBe(200)

    const listed = provedkeys.theLiveAgentsWithNoProvedKey().map((one) => [one.handle, one.why])
    expect(listed).toEqual([
      ['a-by-name-starter', 'only-keys-given-without-a-key'],
      ['all-revoked', 'every-key-revoked'],
      ['by-name', 'only-keys-given-without-a-key'],
      ['never-keyed', 'never-held-a-key'],
      ['old-row', 'only-keys-whose-proof-nobody-recorded'],
      ['on-an-unproved-key', 'only-keys-given-on-an-unproved-key'],
      ['several', 'only-unproved-keys-of-several-kinds'],
    ])

    // THE SAME LIST, AND ITS SENTENCE, ON THE WINDOW'S READING.
    const window = await call('GET', '/api/office/key-window', AS_THE_PERSON)
    expect(window.status, window.text).toBe(200)
    const refused = window.json['closeIsRefusedBecause'] as { count: number; agents: { handle: string }[]; says: string }
    expect(refused.count).toBe(7)
    expect(refused.agents.map((one) => one.handle)).toEqual(listed.map(([handle]) => handle))
    expect(refused.says).toContain('7 live agents hold no proved key')
    expect(refused.says).toContain('"never-keyed" (never held a key)')
  })

  it('the sentence names the first 20 and says how many more', async () => {
    for (let i = 0; i < 14; i += 1) await start(`z-by-name-${String(i).padStart(2, '0')}`, THE_OWNERS_NAME_WITH_NO_KEY)
    const said = provedkeys.whyTheKeyWindowMayNotCloseYet()
    expect(said?.count).toBe(21)
    expect(said?.agents).toHaveLength(21)
    expect(said?.says).toContain('The first 20 are ')
    expect(said?.says).toContain('"z-by-name-12"')
    expect(said?.says).not.toContain('"z-by-name-13"')
    expect(said?.says).toContain(', and 1 more.')
  })
})
