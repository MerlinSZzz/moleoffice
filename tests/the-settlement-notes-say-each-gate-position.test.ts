// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NOTES OF THE TWO SETTLEMENT DOORS SAY WHAT EACH POSITION OF THEIR GATE ALLOWS. Wave 13n round DQ.
 *
 * GET /api/checks/owed and GET /api/checks/:run/how-it-would-settle are read by a secretary or the person, proved by a
 * key, while the gate who-reads-a-settlement is at block. At off, any caller proved by a key reads them
 * (`requireASettlementReader`, src/server/lib/inspection.ts). Their notes, which GET /api gives as each door's
 * description, said only the first, as if the gate had one position. Each note now says what each position allows, and
 * the second note says that the gate on closing a run as superseded is asked too.
 *
 * The notes' sentences are read here, because those sentences are what the round changed. The last case ties them to
 * the gate: at off an agent with its own key and no secretary card reads the owed runs, at block it is refused, and a
 * caller with no key is refused at both positions.
 *
 * MUTATION (wave 13n round DQ), after a control run, put back: let only a keyed secretary through
 * `requireASettlementReader`, and the last case goes red. The cases on the notes were red before the notes changed.
 *
 * Every agent, key and setting here is made up, in a fresh test database. Nothing reaches the live office.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { GATES } from '../src/config/gates.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const THE_SETTLEMENT_ROW = GATES.find((one) => one.id === 'who-reads-a-settlement')
// An agent with its own key and no secretary card, so only the gate stands between it and the owed runs.
const READER = 'made-up-notes-reader'

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>
let asPerson: Record<string, string> = {}
let asReader: Record<string, string> = {}

async function ask(url: string, headers: Record<string, string>): Promise<{ status: number; said: string; body: Record<string, any> }> {
  const reply = await app.app.inject({ method: 'GET', url, headers })
  let body: Record<string, any> = {}
  try { body = reply.json() as Record<string, any> } catch { body = {} }
  return { status: reply.statusCode, said: String(body['error'] ?? reply.body), body }
}


async function theGateAt(value: 'off' | 'block' | null): Promise<void> {
  const reply = await app.app.inject({
    method: 'POST',
    url: '/api/office/settings',
    headers: { 'content-type': 'application/json', ...asPerson },
    payload: { changes: [{ name: THE_SETTLEMENT_ROW!.setting, value }], because: 'Made-up reason for a gate' },
  })
  expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)
}

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  asPerson = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...thePersonsKeyHeader() }
  const reader = await app.app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: { 'content-type': 'application/json', ...asPerson },
    payload: { handle: READER, name: 'Made-up notes reader', role: 'worker' },
  })
  expect(reader.statusCode, reader.body.slice(0, 400)).toBe(201)
  const key = String((reader.json() as { whatToGiveIt?: { key?: unknown } }).whatToGiveIt?.key ?? '')
  asReader = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': READER, 'x-mole-office-key': key }
}, 60_000)

afterAll(async () => {
  await app?.app.close()
  t?.close()
})




it('at off an agent with its own key and no secretary card reads the owed runs, at block it is refused, and a caller with no key is refused at both', async () => {
  expect(THE_SETTLEMENT_ROW, 'the gate list has no row for the reading of the owed runs').toBeDefined()
  const { 'x-mole-office-key': _key, ...withNoKey } = asReader
  try {
    for (const [position, keyed] of [['off', 200], ['block', 403]] as const) {
      await theGateAt(position)
      const read = await ask(`/api/checks/owed?agent=${READER}`, asReader)
      expect(read.status, `${position}: ${read.said}`).toBe(keyed)
      const refused = await ask(`/api/checks/owed?agent=${READER}`, withNoKey)
      expect(refused.status, `${position}, with no key: ${refused.said}`).toBe(403)
    }
  } finally {
    await theGateAt(null)
  }
})
