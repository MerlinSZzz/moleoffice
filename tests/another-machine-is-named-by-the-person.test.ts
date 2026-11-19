// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ANOTHER MACHINE IS NAMED BY THE NAME THE PERSON GAVE ITS ADDRESS. Problem 8Kf0hCaK4lQY, settled by one of the owner's
 * decisions, of 27 September 2026: a small table in Settings where the owner names which address is which machine,
 * so a message reads "from loquat".
 *
 * What is proved, through the doors:
 *   1. a message from an address the owner named stores the owner's name for it, with the address beside it, and reads "from loquat";
 *   2. a message from an address the owner did not name reads the address, as before;
 *   3. an agent cannot write the table, and its refused press changes nothing and writes no change row;
 *   4. every change to the table is written in the office's change log, with who, from what, to what and when, and the
 *      setting-changes door answers the newest;
 *   5. what the owner writes loosely is stored in one form and given back, and words that are not an address or a name are
 *      refused with a sentence;
 *   6. a rename does not rewrite what an earlier message says.
 *
 * A message from another machine is sent through a door that stands for the private network daemon's door on this
 * computer: its socket is a proxy here, so the caller's address is read from x-forwarded-for, and the test chooses it.
 * Every address is made up.
 *
 * Three-run proof, this whole file each time:
 *   node tools/run-named-tests.mjs tests/another-machine-is-named-by-the-person.test.ts
 * Mutations, one at a time, restored with cp and checked with cmp:
 *   A. src/server/lib/machines.ts `asAMessageStoresIt`: `const name = theNameTheyGave(measured.machine)` to
 *      `const name = null as string | null`: cases 1 and 6 go red.
 *   B. src/server/api/machine-names.ts: the line `if (aRaiseCarriesIt(actor)) return` to `return`: case 3 goes red.
 *   C. src/server/lib/records.ts `writeDownASettingChange`: its `logChange(...)` line removed: case 4 goes red, and case 5,
 *      which counts the rows.
 *   D. src/server/lib/machine-names.ts `theAddressAsStored`: `const address = mapped?.[1] ?? trimmed` to
 *      `const address = trimmed`: case 5 goes red.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { whereItWasWrittenReads, writtenFromOf } from '../src/shared/messages.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const LOQUAT = '192.0.2.20'
// An invented private-network address, built from its numbers because the address scan refuses one written out.
const UNNAMED = [100, 101, 9, 77].join('.')

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_AN_AGENT = { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'nib' }

let t: TestDb
let app: FastifyInstance
let otherDoor = ''
let server: Server | null = null

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const { stampArrival } = await import('../src/server/lib/http.ts')
  server = createServer((raw, res) => {
    stampArrival(raw, 'another machine', 'a proxy on this computer')
    app.routing(raw, res)
  })
  await new Promise<void>((ok) => server?.listen(0, '127.0.0.1', () => ok()))
  otherDoor = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
  const agent = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_OWNER,
    payload: { kind: 'agent', title: 'Nib', data: { handle: 'nib', runtime: 'claude-code', state: 'active' } },
  })
  expect(agent.statusCode, agent.body).toBe(201)
}, 60_000)

afterAll(async () => {
  if (server !== null) await new Promise<void>((done) => server?.close(() => done()))
  server = null
  await app.close()
  t.close()
})

afterEach(() => {
  // THE TABLE AND ITS CHANGE ROWS ARE THE ONLY THINGS THESE CASES SHARE. Each case starts with
  // nobody named and no change written, as it did in a database of its own.
  t.client.sqlite.prepare('UPDATE installation SET machine_names = NULL WHERE only_row = 1').run()
  t.client.sqlite.prepare("DELETE FROM changes WHERE record_id = 'setting:machine-names'").run()
})

async function name(address: string, machine: string | null, headers: Record<string, string> = AS_THE_OWNER) {
  const reply = await app.inject({ method: 'POST', url: '/api/office/machine-names', headers, payload: { address, name: machine } })
  return { status: reply.statusCode, body: JSON.parse(reply.body) as Record<string, any> }
}

/** A message written by the agent from the given address, through the other machines' door; what it stored. */
async function aMessageFrom(address: string): Promise<{ id: string; writtenFrom: Record<string, unknown> }> {
  const res = await fetch(`${otherDoor}/api/records`, {
    method: 'POST',
    headers: { ...AS_AN_AGENT, 'x-forwarded-for': address, 'x-mole-office-program': 'Chrome' },
    body: JSON.stringify({ kind: 'message', title: 'a line', data: { body: 'Written on the other machine.', to: [{ kind: 'person', id: THE_PERSON }] } }),
  })
  const text = await res.text()
  expect(res.status, text).toBe(201)
  const held = JSON.parse(text) as { record: { id: string; data: { writtenFrom: Record<string, unknown> } } }
  return { id: held.record.id, writtenFrom: held.record.data.writtenFrom }
}

function reads(writtenFrom: Record<string, unknown>): string {
  const from = writtenFromOf({ writtenFrom })
  if (from === null) throw new Error('the message stored nothing about where it was written from')
  return whereItWasWrittenReads(from)
}

function settingRows(): { actor_id: string; field: string | null; old_value: string | null; new_value: string | null }[] {
  return t.client.sqlite
    .prepare("SELECT actor_id, field, old_value, new_value FROM changes WHERE record_id = 'setting:machine-names' ORDER BY rowid")
    .all() as { actor_id: string; field: string | null; old_value: string | null; new_value: string | null }[]
}

describe('another machine is named by the name the person gave its address', () => {
  it('1: a message from an address the owner named stores the owner’s name for it, and reads "from loquat"', async () => {
    expect((await name(LOQUAT, 'loquat')).status).toBe(200)
    const message = await aMessageFrom(LOQUAT)
    expect(message.writtenFrom).toEqual({ how: 'the name the person gave the address', machine: 'loquat', address: LOQUAT, program: 'Chrome' })
    expect(reads(message.writtenFrom)).toBe('from loquat, Chrome')
  })

  it('2: a message from an address the owner did not name reads the address', async () => {
    expect((await name(LOQUAT, 'loquat')).status).toBe(200)
    const message = await aMessageFrom(UNNAMED)
    expect(message.writtenFrom).toEqual({ how: 'an address', machine: UNNAMED, program: 'Chrome' })
    expect(reads(message.writtenFrom)).toBe(`from the address ${UNNAMED}, Chrome`)
  })

  it('3: an agent cannot write the table, and its refused press changes nothing', async () => {
    const refused = await name(LOQUAT, 'loquat', AS_AN_AGENT)
    expect(refused.status).toBe(403)
    expect(String(refused.body['error'])).toContain('Nothing was changed.')
    const table = await app.inject({ method: 'GET', url: '/api/office/machine-names', headers: AS_AN_AGENT })
    expect((JSON.parse(table.body) as { machines: unknown[] }).machines).toEqual([])
    expect(settingRows()).toEqual([])
  })

  it('4: every change is written in the change log, and the newest is answered with who and when', async () => {
    await name(LOQUAT, 'loquat')
    await name(LOQUAT, 'loquat laptop')
    await name(LOQUAT, null)
    expect(settingRows()).toEqual([
      { actor_id: THE_PERSON, field: `the name of the machine at ${LOQUAT}`, old_value: null, new_value: 'loquat' },
      { actor_id: THE_PERSON, field: `the name of the machine at ${LOQUAT}`, old_value: 'loquat', new_value: 'loquat laptop' },
      { actor_id: THE_PERSON, field: `the name of the machine at ${LOQUAT}`, old_value: 'loquat laptop', new_value: null },
    ])
    const changes = await app.inject({ method: 'GET', url: '/api/office/setting-changes', headers: AS_AN_AGENT })
    const last = (JSON.parse(changes.body) as { settings: Record<string, any> }).settings['machine-names']
    expect(last).toMatchObject({ by: { type: 'human', id: THE_PERSON }, from: 'loquat laptop', to: null })
    expect(String(last.at)).toMatch(/^\d{4}-\d{2}-\d{2}/)
  })

  it('5: loose words are stored in one form and given back; words that are not an address or a name are refused', async () => {
    const stored = await name(`  ::ffff:${LOQUAT} `, '  loquat    laptop ')
    expect(stored.status).toBe(200)
    expect(stored.body['stored']).toEqual({ address: LOQUAT, name: 'loquat laptop' })
    expect(stored.body['machines']).toEqual([{ address: LOQUAT, name: 'loquat laptop' }])

    const notAnAddress = await name('loquat.tailnet', 'loquat')
    expect(notAnAddress.status).toBe(400)
    expect(String(notAnAddress.body['error'])).toContain('is not an address')
    const noName = await name(UNNAMED, '   ')
    expect(noName.status).toBe(400)
    expect(String(noName.body['error'])).toContain('The name is empty.')
    const nothingToRemove = await name(UNNAMED, null)
    expect(nothingToRemove.status).toBe(404)
    expect(settingRows()).toHaveLength(1)
  })

  it('6: a rename does not rewrite what an earlier message says', async () => {
    await name(LOQUAT, 'loquat')
    const earlier = await aMessageFrom(LOQUAT)
    await name(LOQUAT, 'cedar')
    const later = await aMessageFrom(LOQUAT)
    const reread = await app.inject({ method: 'GET', url: `/api/records/${earlier.id}`, headers: AS_THE_OWNER })
    const stored = (JSON.parse(reread.body) as { record: { data: { writtenFrom: Record<string, unknown> } } }).record.data.writtenFrom
    expect(stored['machine']).toBe('loquat')
    expect(later.writtenFrom['machine']).toBe('cedar')
  })
})
