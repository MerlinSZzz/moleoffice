// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RAISE CARRIES REVOKING AN AGENT'S KEY, AND STILL NOT THE OWNER'S THREE ACTS; A REVOKE NAMES ITS KEY BY ID.
 * Problems aCZiUynEQao0 and yZ71bheXm-Ji.
 *
 * On 29 September 2026 a secretary the owner had raised to revoke a leaked key was refused, as though the
 * revoke were one of the acts the owner keeps. A raise carries every act of the owner's except the three a
 * second decision names: closing the key window, changing the regulations, and changing
 * who the owner is.
 *
 * WHAT IS REAL: a scratch office with a real listener, the key window closed with the person's key,
 * as the live office's is. The coordinator Vale, a secretary, and Moss Tally, a worker, are made-up agents, each
 * holding the key the office answered.
 *
 *   1. Unraised, the secretary may not revoke the worker's key. Raised, it may: the key stops
 *      working, and the act is written down as done under the raise.
 *   2. Raised, the secretary is still refused closing the key window, writing a regulation, and
 *      changing who the owner is (confirming a device as the owner, and revoking a device key of the owner's),
 *      because the secretary card keeps each of them and this office changed nothing. The window's refusal
 *      says so, in the check's words.
 *   3. The revoke door refuses a revoke that names no key by its id, with a code: a blank id, and an
 *      agent's id where a key's id belongs. Nothing is revoked.
 *
 * MUTATIONS, NAMED, EACH ALONE AFTER A GREEN CONTROL (src/server/api/visitors.ts unless named):
 *   a. the raise clause taken out of `onlyThePersonMay`: case 1 goes red;
 *   b. office.close-key-window taken off the card's `neverPresses` (src/config/roles.json): case 2 goes red (the window);
 *   c. a regulation written under a raise (lib/records.ts, the refusal in `assertMayWrite` switched off): case 2 goes red;
 *   d. the confirm door passes `true` for its raise: case 2 goes red (the owner);
 *   e. `theKeyARevokeNames` answers the id it was sent without asking whether it is a key: case 3 goes red.
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, FOR_THE_PERSON, type TestDb } from './helpers.ts'
import { forgetTheWorldsOwnAuthority } from '../src/server/lib/worldauthority.ts'

/** Made-up values. Nothing here is, or was ever, a key any office issued. */
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const WORKSPACE = { 'x-mole-office-workspace': 'default' }
const AS_THE_OWNER = { ...WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-key': A_MADE_UP_PERSON_KEY }

let t: TestDb
let app: FastifyInstance
let door = ''
const keys = new Map<string, string>()
const ids = new Map<string, string>()

async function ask(method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; body: Record<string, any>; error: string }> {
  const res = await fetch(`${door}${path}`, {
    method,
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const read = (await res.json()) as Record<string, any>
  return { status: res.status, body: read, error: typeof read['error'] === 'string' ? read['error'] : '' }
}

function as(handle: string): Record<string, string> {
  return { ...WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': keys.get(handle) ?? '' }
}

/** The live `held_keys` rows of the agent with this handle. */
function liveKeysOf(handle: string): string[] {
  return (t.client.sqlite.prepare('SELECT id FROM held_keys WHERE whose_id = ? AND revoked_at IS NULL ORDER BY rowid').all(ids.get(handle)) as { id: string }[]).map((one) => one.id)
}

/** Whether the worker's key still proves it: a write under it is answered, or refused as nobody. */
async function theWorkersKeyWorks(): Promise<boolean> {
  const filed = await ask('POST', '/api/records', as('moss-tally'), { kind: 'note', title: 'A note Moss Tally wrote', data: { body: 'Counted the jars.' } })
  return filed.status === 201
}

async function raise(): Promise<void> {
  const pressed = await ask('POST', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}-vale`, AS_THE_OWNER, { reason: 'Revoke a leaked key' })
  expect(pressed.status, pressed.error).toBe(201)
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  forgetTheWorldsOwnAuthority()
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`, { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  door = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  for (const [handle, name, role] of [[`${THE_TEST_OFFICES_SECRETARY.handle}-vale`, `${THE_TEST_OFFICES_SECRETARY.name} Vale`, 'secretary'], ['moss-tally', 'Moss Tally', 'worker']] as const) {
    const made = await ask('POST', '/api/agents/started', AS_THE_OWNER, { handle, name, role })
    expect(made.status, made.error).toBe(201)
    keys.set(handle, String(made.body['whatToGiveIt']?.key ?? ''))
    ids.set(handle, String(made.body['agent']?.id ?? ''))
  }
  const closed = await ask('POST', '/api/office/key-window/close', AS_THE_OWNER)
  expect(closed.status, closed.error).toBe(200)
}, 60_000)

afterEach(async () => {
  await ask('DELETE', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}-vale`, AS_THE_OWNER)
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe("a raise and an agent's key", () => {
  it("1: unraised the secretary may not revoke a worker's key; raised it may, and it is written down", async () => {
    const [key] = liveKeysOf('moss-tally')
    expect(key, 'the worker holds its own key').toBeTruthy()
    expect(await theWorkersKeyWorks(), 'the worker key works before').toBe(true)

    const unraised = await ask('POST', `/api/office/held-keys/${key!}/revoke`, as(`${THE_TEST_OFFICES_SECRETARY.handle}-vale`), {})
    expect(unraised.status, unraised.error).toBe(403)
    expect(liveKeysOf('moss-tally')).toEqual([key])

    await raise()
    const raised = await ask('POST', `/api/office/held-keys/${key!}/revoke`, as(`${THE_TEST_OFFICES_SECRETARY.handle}-vale`), FOR_THE_PERSON)
    expect(raised.status, raised.error).toBe(200)
    expect(raised.body['key'], 'the reply names the key it revoked').toMatchObject({ id: key, is: 'its-own' })
    expect(liveKeysOf('moss-tally'), 'the key is revoked').toEqual([])
    expect(await theWorkersKeyWorks(), 'and it proves nobody now').toBe(false)
    const written = t.client.sqlite
      .prepare("SELECT elevation FROM changes WHERE record_id = 'setting:held-keys' AND actor_id = ? ORDER BY rowid DESC LIMIT 1")
      .get(`${THE_TEST_OFFICES_SECRETARY.handle}-vale`) as { elevation: string | null } | undefined
    expect(written?.elevation ?? null, 'the act is written down as done under the raise').not.toBeNull()
  })

  it('2: raised, the secretary is still refused the owner’s three acts', async () => {
    await raise()
    // CLOSING THE KEY WINDOW. It is closed already, so a press that got through would be answered 409.
    const window = await ask('POST', '/api/office/key-window/close', as(`${THE_TEST_OFFICES_SECRETARY.handle}-vale`), {})
    expect(window.status, window.error).toBe(403)
    expect(window.error, 'refused because the card keeps it, not for another reason').toContain('The secretary card keeps office.close-key-window for the person')

    // WRITING A REGULATION.
    const regulation = await ask('POST', '/api/records', as(`${THE_TEST_OFFICES_SECRETARY.handle}-vale`), {
      kind: 'regulation', title: 'A regulation a secretary wrote', data: { sentence: 'A rule nobody made.', binds: 'person', since: '2026-09-29' },
    })
    expect(regulation.status, regulation.error).toBe(403)
    expect(regulation.error, 'refused because a raise does not carry it').toContain('a raise never carries a write of a regulation')

    // CHANGING WHO THE OWNER IS: a device asks to be the owner; the secretary may not confirm it.
    const asked = await ask('POST', '/api/office/visitors', WORKSPACE, { device: 'A made-up tablet' })
    expect(asked.status, asked.error).toBe(201)
    const device = String(asked.body['credential'].id)
    const confirm = await ask('POST', `/api/office/visitors/${device}/confirm`, as(`${THE_TEST_OFFICES_SECRETARY.handle}-vale`), {})
    expect(confirm.status, confirm.error).toBe(403)
    // AND ONCE THE OWNER HAS CONFIRMED IT, THE SECRETARY MAY NOT REVOKE THAT DEVICE'S KEY, which is the owner's.
    const confirmed = await ask('POST', `/api/office/visitors/${device}/confirm`, AS_THE_OWNER, {})
    expect(confirmed.status, confirmed.error).toBe(200)
    const deviceKey = String(confirmed.body['deviceKey']?.id ?? '')
    expect(deviceKey, 'the device holds a key').not.toBe('')
    const revoke = await ask('POST', `/api/office/held-keys/${deviceKey}/revoke`, as(`${THE_TEST_OFFICES_SECRETARY.handle}-vale`), {})
    expect(revoke.status, revoke.error).toBe(403)
  })
})

describe('a revoke names its key', () => {
  it('3: refuses, with a code, a revoke with no key id and one that names an agent', async () => {
    await raise()
    const before = liveKeysOf(`${THE_TEST_OFFICES_SECRETARY.handle}-vale`)
    expect(before.length, 'the secretary holds a key').toBe(1)
    for (const id of ['%20', ids.get(`${THE_TEST_OFFICES_SECRETARY.handle}-vale`)!, `${THE_TEST_OFFICES_SECRETARY.handle}-vale`]) {
      const refused = await ask('POST', `/api/office/held-keys/${id}/revoke`, AS_THE_OWNER, {})
      expect(refused.status, `${id}: ${refused.error}`).toBe(400)
      expect(refused.body['code'], id).toBe('embassyKeysNoKeyNamed')
      expect(refused.error).toContain('Nothing was revoked.')
    }
    expect(liveKeysOf(`${THE_TEST_OFFICES_SECRETARY.handle}-vale`), 'nothing was revoked').toEqual(before)
  })
})
