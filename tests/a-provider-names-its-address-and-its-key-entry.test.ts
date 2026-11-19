// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROVIDER NAMES ITS BASE ADDRESS AND AN ENTRY OF THE KEY FILE, AND NO ANSWER CARRIES THE KEY'S VALUE.
 *
 * WHAT IS REAL: a scratch office with a real listener on a port of its own, and a key file of the test's own beside
 * the scratch database, written before the office starts. Its one provider entry holds a value this file makes at
 * random. No real key file is read. A secretary, a worker and a supervisor are made-up agents, each registered by the
 * person and each holding the key the office answered. No provider is called: every address below is only stored.
 *
 *   1. The person adds, reads, lists, changes and removes a provider. Each write answers its change row with the
 *      fields before and after, and the change rows in the table say the same.
 *   2. A body, an id, a name or programs of a wrong shape are refused with their codes, and so are a change of the id,
 *      a change that names nothing, a taken id and an id nobody has. Nothing is written.
 *   3. A base address is refused with its code where it is http: on any host but one written exactly 127.0.0.1 or
 *      [::1], where it carries a user or a password, a query or a fragment, where it has another scheme, and where it
 *      names no host. 127.1, 2130706433, 0x7f.0.0.1 and [0:0:0:0:0:0:0:1] are other spellings of those two, and each
 *      is refused and named as it was written. A refusal never echoes the password or the query. http: on 127.0.0.1
 *      and on [::1], each with a port, is taken. An address is stored as given, trimmed, with its path and its
 *      trailing slash.
 *   4. A key name of a wrong shape is refused without echoing what was given. So is each entry the office keeps for
 *      itself: the push signing key, the push devices and the office's own keys. A name of an entry that is not set
 *      is taken, and its row says `not set`.
 *   5. A worker and a supervisor, each with its own key, and a request that names the secretary with no key, are
 *      refused at each write with a 403 and a code, and nothing is written. The two reads stay open to them.
 *   6. A secretary's add, and its change of the address, the programs or the key name, each send the person one
 *      message. It names the row, the host and the key name, and not the whole address or the value. The secretary's
 *      change of the name alone and its removal send nothing, and nor does any write of the person's.
 *   7. The value is in no reply of the list, the read, an add, a change or a remove, in no row of any table of the
 *      database (so in no change row and no message), and in nothing this process prints while they run. The read
 *      says `set` for the entry the key file holds.
 *   8. A page reads each stored message's sentence back with the values it was written with, so it can draw the
 *      sentence in its own language with the same row, host and key name. A sentence Mole Office did not write is
 *      kept as stored.
 *  10. A request that names the person and carries no key, sent while the key window is open, is refused at each
 *      write with a 403 and its code, and nothing is written. The Casting gate takes such a request as the person,
 *      so each provider door asks for the proved person after the gate.
 *
 * MUTATIONS, NAMED, EACH ALONE AFTER A GREEN CONTROL:
 *   a. In src/server/lib/the-provider-table.ts, `theBaseAddress` also takes http: on localhost: case 3 goes red.
 *   b. In the same file, the user-and-password check taken out of `theBaseAddress`: case 3 goes red.
 *   c. In the same file, the two push entries taken out of the kept names in `theKeyName`: case 4 goes red.
 *   d. In src/server/api/the-provider-table.ts, the gate taken out of the change door: case 5 goes red.
 *   e. In src/server/lib/the-provider-table.ts, `addAProvider` sending the message whoever writes: cases 1 and 6 go
 *      red.
 *   f. In the same file, `changeAProvider` sending the message on a change of the name too: case 6 goes red.
 *   g. In the same file, `aRowOf` answering `not set` for every entry: case 7 goes red.
 *   h. In src/shared/office-lines.ts, the added line's branch taken out of `theWordsOfAFixedOfficeLine`: case 8
 *      goes red.
 *   i. In src/server/lib/the-provider-table.ts, a change row storing the fields before as its after: case 1 goes red.
 *   j. In the same file, the refusal of a changed id taken out of `changeAProvider`: case 2 goes red.
 *   k. In the same file, `theBaseAddress` judging http: on the host the parser read and not on the host as written:
 *      case 3 goes red.
 *   m. In src/server/lib/the-provider-table.ts, the proved-person check taken out of
 *      `onlyAProvedPersonWritesAProvider`: case 10 goes red.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { theWordsOfAnOfficeLine, type AnOfficeLineOnAPage } from '../src/shared/dead-letter-lines.ts'
import type { Say } from '../src/shared/i18n.ts'
import { OFFICE_KEY_PROVIDERS } from '../src/shared/office-keys.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { forgetTheWorldsOwnAuthority } from '../src/server/lib/worldauthority.ts'

/** Made-up values. Nothing here is, or was ever, a key any office issued or any provider takes. */
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const THE_ENTRYS_VALUE = `made-up-provider-value-${randomBytes(24).toString('hex')}`
const A_MADE_UP_PASSWORD = `made-up-password-${randomBytes(12).toString('hex')}`
/** The key file's one provider entry, which holds THE_ENTRYS_VALUE. */
const THE_SET_ENTRY = 'test-own-entry'

const WORKSPACE = { 'x-mole-office-workspace': 'default' }
const THE_PERSON_ASKS = { ...WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-key': A_MADE_UP_PERSON_KEY }
const SECRETARY = `${THE_TEST_OFFICES_SECRETARY.handle}-vale`

let t: TestDb
let app: FastifyInstance
let door = ''
const keys = new Map<string, string>()
const ids = new Map<string, string>()

type Said = { status: number; body: Record<string, any>; text: string; code: unknown; error: string }

async function ask(method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<Said> {
  const res = await fetch(`${door}${path}`, {
    method,
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await res.text()
  const read = JSON.parse(text) as Record<string, any>
  return { status: res.status, body: read, text, code: read['code'], error: typeof read['error'] === 'string' ? read['error'] : '' }
}

/** An agent by its handle, with its own key. */
function as(handle: string): Record<string, string> {
  return { ...WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': keys.get(handle) ?? '' }
}

/** An agent by its handle, and no key. */
function named(handle: string): Record<string, string> {
  return { ...WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}

/** Both provider tables, whole, to prove a refused write changed nothing. */
function stored(): string {
  return JSON.stringify([
    t.client.sqlite.prepare('SELECT * FROM providers ORDER BY id').all(),
    t.client.sqlite.prepare('SELECT * FROM provider_changes ORDER BY id').all(),
  ])
}

/** The change rows of one provider, oldest first, with their JSON read. */
function theChangeRows(provider: string): { what: string; by_kind: string; by_id: string; before: unknown; after: unknown }[] {
  const rows = t.client.sqlite.prepare('SELECT what, by_kind, by_id, before, after FROM provider_changes WHERE provider_id = ? ORDER BY id').all(provider) as {
    what: string
    by_kind: string
    by_id: string
    before: string | null
    after: string | null
  }[]
  return rows.map((one) => ({ ...one, before: one.before === null ? null : JSON.parse(one.before), after: one.after === null ? null : JSON.parse(one.after) }))
}

/** How many messages the office holds. */
function theMessageCount(): number {
  return (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'message'").get() as { n: number }).n
}

/** One stored message's data. */
function theMessage(id: string): Record<string, any> {
  const row = t.client.sqlite.prepare("SELECT data FROM records WHERE id = ? AND kind = 'message'").get(id) as { data: string } | undefined
  expect(row, `no message ${id} is stored`).toBeDefined()
  return JSON.parse(row!.data) as Record<string, any>
}

/** Every row of every table of the database, as text. */
function everyStoredRow(): string {
  const tables = t.client.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
  return tables.map((one) => JSON.stringify(t.client.sqlite.prepare(`SELECT * FROM "${one.name.replaceAll('"', '""')}"`).all())).join('\n')
}

/** A provider body, with any field changed. */
function aBody(id: string, change: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, name: `The test's own ${id}`, programs: ['opencode'], baseAddress: `https://${id}.example/v1`, keyName: 'an-unset-entry', ...change }
}

/** Add a provider as the person, and expect it taken. */
async function addedByThePerson(body: Record<string, unknown>): Promise<Said> {
  const said = await ask('POST', '/api/casting/providers', THE_PERSON_ASKS, body)
  expect(said.status, said.error).toBe(201)
  return said
}

/** A refusal, with its status, its code and its values. */
function expectRefused(said: Said, status: number, code: string, values?: Record<string, unknown>): void {
  expect(said.status, `${code}: ${said.error}`).toBe(status)
  expect(said.code, said.error).toBe(code)
  if (values !== undefined) expect(said.body['values'], code).toEqual(values)
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  forgetTheWorldsOwnAuthority()
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: { [THE_SET_ENTRY]: THE_ENTRYS_VALUE } }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  door = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  for (const [handle, name, role] of [[SECRETARY, `${THE_TEST_OFFICES_SECRETARY.name} Vale`, 'secretary'], ['moss-tally', 'Moss Tally', 'worker'], ['fern-ledger', 'Fern Ledger', 'supervisor']] as const) {
    const made = await ask('POST', '/api/agents/started', THE_PERSON_ASKS, { handle, name, role })
    expect(made.status, made.error).toBe(201)
    keys.set(handle, String(made.body['whatToGiveIt']?.key ?? ''))
    ids.set(handle, String(made.body['agent']?.id ?? ''))
  }
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the person', () => {
  it('1: adds, reads, lists, changes and removes a provider, and each write has a change row with before and after', async () => {
    const body = { id: 'person-own', name: '  The person’s own provider  ', programs: ['codex', 'dsh'], baseAddress: 'https://person-own.example/v1', keyName: 'person-own-entry' }
    const added = await addedByThePerson(body)
    const fields = { id: 'person-own', name: 'The person’s own provider', programs: ['codex', 'dsh'], baseAddress: 'https://person-own.example/v1', keyName: 'person-own-entry' }
    const person = { kind: 'human', id: THE_PERSON }
    expect(added.body['provider']).toMatchObject({ ...fields, key: 'not set', added: { by: person }, changed: { by: person } })
    expect(added.body['change']).toMatchObject({ provider: 'person-own', what: 'add', by: person, before: null, after: fields })
    expect(added.body['told'], 'the person was sent a message about their own add').toBeNull()

    const read = await ask('GET', '/api/casting/providers/person-own', THE_PERSON_ASKS)
    expect(read.status, read.error).toBe(200)
    // EVERY READ'S REPLY SAYS whether a permission narrowed it, beside the row.
    const { narrowedByPermission, ...row } = read.body
    expect(narrowedByPermission).toBeNull()
    expect(row).toEqual(added.body['provider'])
    const listed = await ask('GET', '/api/casting/providers', THE_PERSON_ASKS)
    expect(listed.status, listed.error).toBe(200)
    expect(listed.body['providers'].find((one: { id: string }) => one.id === 'person-own')).toEqual(added.body['provider'])

    const changed = await ask('PATCH', '/api/casting/providers/person-own', THE_PERSON_ASKS, { id: 'person-own', programs: ['claude-code'], baseAddress: 'https://elsewhere.example/v2/' })
    expect(changed.status, changed.error).toBe(200)
    const now = { ...fields, programs: ['claude-code'], baseAddress: 'https://elsewhere.example/v2/' }
    expect(changed.body['provider']).toMatchObject({ ...now, changed: { by: person } })
    expect(changed.body['change']).toMatchObject({ what: 'change', before: fields, after: now })
    expect(changed.body['told'], 'the person was sent a message about their own change').toBeNull()

    const removed = await ask('DELETE', '/api/casting/providers/person-own', THE_PERSON_ASKS)
    expect(removed.status, removed.error).toBe(200)
    expect(removed.body['provider']).toMatchObject(now)
    expect(removed.body['change']).toMatchObject({ what: 'remove', before: now, after: null })
    expect(removed.body['told']).toBeNull()
    expectRefused(await ask('GET', '/api/casting/providers/person-own', THE_PERSON_ASKS), 404, 'providerNotFound', { id: 'person-own' })

    expect(theChangeRows('person-own')).toEqual([
      { what: 'add', by_kind: 'human', by_id: THE_PERSON, before: null, after: fields },
      { what: 'change', by_kind: 'human', by_id: THE_PERSON, before: fields, after: now },
      { what: 'remove', by_kind: 'human', by_id: THE_PERSON, before: now, after: null },
    ])
  })

  it('2: refuses a body, an id, a name or programs of a wrong shape, and a change of the id, and writes nothing', async () => {
    await addedByThePerson(aBody('shapes'))
    const before = stored()
    const add = (body: unknown) => ask('POST', '/api/casting/providers', THE_PERSON_ASKS, body)
    expectRefused(await add(['shapes']), 400, 'providerBodyNotAnObject', {})
    expectRefused(await add({ ...aBody('other-fields'), models: ['a-model'] }), 400, 'providerBodyHasOtherFields', { fields: 'models' })
    for (const id of ['a', 'x'.repeat(41), 'Upper', 'has_underscore', 'has space', 'dot.ted', '', 7, null]) {
      expectRefused(await add(aBody('ignored', { id })), 400, 'providerIdNotValid', {})
    }
    expectRefused(await add({ name: 'No id', programs: ['codex'], baseAddress: 'https://no-id.example', keyName: 'no-id' }), 400, 'providerIdNotValid', {})
    expectRefused(await add(aBody('name-empty', { name: '   ' })), 400, 'providerNameNotValid', { length: 0 })
    expectRefused(await add(aBody('name-long', { name: 'n'.repeat(121) })), 400, 'providerNameNotValid', { length: 121 })
    expectRefused(await add(aBody('name-number', { name: 12 })), 400, 'providerNameNotValid', { length: 0 })
    for (const programs of [[], 'codex', [1], null]) {
      expectRefused(await add(aBody('programs-shape', { programs })), 400, 'providerProgramsNotAList', {})
    }
    expectRefused(await add(aBody('program-unknown', { programs: ['codex', 'a-made-up-program'] })), 400, 'providerProgramNotKnown', { program: 'a-made-up-program' })
    expectRefused(await add(aBody('program-twice', { programs: ['codex', 'dsh', 'codex'] })), 400, 'providerProgramRepeated', { program: 'codex' })
    expectRefused(await add(aBody('shapes')), 409, 'providerIdTaken', { id: 'shapes' })

    const change = (id: string, body: unknown) => ask('PATCH', `/api/casting/providers/${id}`, THE_PERSON_ASKS, body)
    expectRefused(await change('shapes', { id: 'shapes-renamed', name: 'A new name' }), 400, 'providerIdChanged', { id: 'shapes' })
    expectRefused(await change('shapes', {}), 400, 'providerChangeNamesNothing', { id: 'shapes' })
    expectRefused(await change('shapes', { id: 'shapes' }), 400, 'providerChangeNamesNothing', { id: 'shapes' })
    expectRefused(await change('shapes', { programs: [] }), 400, 'providerProgramsNotAList', {})
    expectRefused(await change('nobody-has-it', { name: 'A name' }), 404, 'providerNotFound', { id: 'nobody-has-it' })
    expectRefused(await change('Not_An_Id', { name: 'A name' }), 400, 'providerIdNotValid', {})
    expectRefused(await ask('DELETE', '/api/casting/providers/nobody-has-it', THE_PERSON_ASKS), 404, 'providerNotFound', { id: 'nobody-has-it' })
    expect(stored(), 'a refused write wrote something').toBe(before)

    // THE EDGES ARE TAKEN: an id of 2 and of 40 characters, and a name of 120.
    await addedByThePerson(aBody('ab', { name: 'n'.repeat(120) }))
    await addedByThePerson(aBody('x'.repeat(40)))
  })

  it('3: refuses a base address that breaks a rule, names only its host, and takes http: on 127.0.0.1 and [::1] as written', async () => {
    const before = stored()
    const add = (id: string, baseAddress: unknown) => ask('POST', '/api/casting/providers', THE_PERSON_ASKS, aBody(id, { baseAddress }))
    const refusals: [unknown, string, Record<string, unknown>][] = [
      ['http://203.0.113.7/v1', 'providerAddressHttpNotLoopback', { host: '203.0.113.7' }],
      ['http://localhost:11434/v1', 'providerAddressHttpNotLoopback', { host: 'localhost' }],
      ['http://plain.example/v1', 'providerAddressHttpNotLoopback', { host: 'plain.example' }],
      ['http://[::2]:8080/', 'providerAddressHttpNotLoopback', { host: '[::2]' }],
      ['http://127.1/v1', 'providerAddressHttpNotLoopback', { host: '127.1' }],
      ['http://2130706433:11434/v1', 'providerAddressHttpNotLoopback', { host: '2130706433' }],
      ['http://0x7f.0.0.1/v1', 'providerAddressHttpNotLoopback', { host: '0x7f.0.0.1' }],
      ['http://[0:0:0:0:0:0:0:1]:8080/', 'providerAddressHttpNotLoopback', { host: '[0:0:0:0:0:0:0:1]' }],
      [`https://made-up-user:${A_MADE_UP_PASSWORD}@creds.example/v1`, 'providerAddressHasCredentials', { host: 'creds.example' }],
      [`http://made-up-user:${A_MADE_UP_PASSWORD}@127.0.0.1:8080/v1`, 'providerAddressHasCredentials', { host: '127.0.0.1' }],
      ['https://made-up-user@creds.example/v1', 'providerAddressHasCredentials', { host: 'creds.example' }],
      [`https://query.example/v1?key=${A_MADE_UP_PASSWORD}`, 'providerAddressHasQuery', { host: 'query.example' }],
      ['https://fragment.example/v1#part', 'providerAddressHasFragment', { host: 'fragment.example' }],
      ['ftp://other.example/v1', 'providerAddressScheme', { scheme: 'ftp' }],
      ['file:///etc/hosts', 'providerAddressScheme', { scheme: 'file' }],
      ['https://', 'providerAddressNoHost', { scheme: 'https' }],
      ['https:///v1', 'providerAddressNoHost', { scheme: 'https' }],
      ['https:no-slashes.example', 'providerAddressNoHost', { scheme: 'https' }],
      ['not an address', 'providerAddressNotAnAddress', {}],
      ['no-scheme.example/v1', 'providerAddressNotAnAddress', {}],
      ['', 'providerAddressNotAnAddress', {}],
      [42, 'providerAddressNotAnAddress', {}],
    ]
    for (const [address, code, values] of refusals) {
      const said = await add('address-refused', address)
      expectRefused(said, 400, code, values)
      expect(said.text, `the refusal of ${String(address)} echoes the password`).not.toContain(A_MADE_UP_PASSWORD)
      expect(said.text, `the refusal of ${String(address)} echoes the user`).not.toContain('made-up-user')
    }
    expect(stored(), 'a refused address wrote something').toBe(before)

    const v4 = await add('loopback-v4', 'http://127.0.0.1:11434/v1')
    expect(v4.status, v4.error).toBe(201)
    expect(v4.body['provider'].baseAddress).toBe('http://127.0.0.1:11434/v1')
    const v6 = await add('loopback-v6', 'http://[::1]:8080/')
    expect(v6.status, v6.error).toBe(201)
    expect(v6.body['provider'].baseAddress).toBe('http://[::1]:8080/')
    // STORED AS GIVEN, TRIMMED: the path and the trailing slash are kept.
    const kept = await add('kept-as-given', '  https://kept.example/api/v1/  ')
    expect(kept.status, kept.error).toBe(201)
    expect(kept.body['provider'].baseAddress).toBe('https://kept.example/api/v1/')
    const changed = await ask('PATCH', '/api/casting/providers/kept-as-given', THE_PERSON_ASKS, { baseAddress: 'http://localhost/v1' })
    expectRefused(changed, 400, 'providerAddressHttpNotLoopback', { host: 'localhost' })
  })

  it('4: refuses a key name of a wrong shape and every entry the office keeps, and takes a name of an unset entry', async () => {
    const before = stored()
    const add = (id: string, keyName: unknown) => ask('POST', '/api/casting/providers', THE_PERSON_ASKS, aBody(id, { keyName }))
    for (const keyName of ['', '   ', 'Upper', 'has_underscore', 'has space', 'dot.ted', 'k'.repeat(65), 42, null, `sk_${A_MADE_UP_PASSWORD}`]) {
      const said = await add('key-name-refused', keyName)
      expectRefused(said, 400, 'providerKeyNameNotValid', {})
      if (typeof keyName === 'string' && keyName.trim() !== '') expect(said.text, 'the refusal echoes the key name it was given').not.toContain(keyName)
    }
    for (const kept of ['push-signing-key', 'push-devices', ...OFFICE_KEY_PROVIDERS]) {
      expectRefused(await add('key-name-kept', kept), 400, 'providerKeyNameKeptByTheOffice', { name: kept })
    }
    expect(stored(), 'a refused key name wrote something').toBe(before)

    for (const [id, keyName, kept] of [['key-one', 'a', 'a'], ['key-long', 'k'.repeat(64), 'k'.repeat(64)], ['key-trimmed', '  padded-entry-2  ', 'padded-entry-2']] as const) {
      const said = await add(id, keyName)
      expect(said.status, said.error).toBe(201)
      expect(said.body['provider']).toMatchObject({ keyName: kept, key: 'not set' })
    }
    expectRefused(await ask('PATCH', '/api/casting/providers/key-one', THE_PERSON_ASKS, { keyName: 'push-signing-key' }), 400, 'providerKeyNameKeptByTheOffice', { name: 'push-signing-key' })
  })
})

describe('nobody else but the person and a secretary', () => {
  it('5: refuses a worker, a supervisor and a name with no key at each write, with a 403 and a code, and writes nothing', async () => {
    await addedByThePerson(aBody('guarded'))
    const before = stored()
    for (const [who, headers, words] of [
      ['the worker', as('moss-tally'), 'Changing the Casting table is for the owner, or for an agent holding the secretary card.'],
      ['the supervisor', as('fern-ledger'), 'Changing the Casting table is for the owner, or for an agent holding the secretary card.'],
      ['the secretary with no key', named(SECRETARY), 'only when its own key proves it'],
    ] as const) {
      const writes = {
        add: await ask('POST', '/api/casting/providers', headers, aBody('not-theirs')),
        change: await ask('PATCH', '/api/casting/providers/guarded', headers, { baseAddress: 'https://theirs.example/v1' }),
        remove: await ask('DELETE', '/api/casting/providers/guarded', headers),
      }
      for (const [write, said] of Object.entries(writes)) {
        expect(said.status, `${who} ${write}: ${said.error}`).toBe(403)
        expect(said.code, `${who} ${write}`).toBe('castingNotOwnerOrSecretary')
        expect(said.error, `${who} ${write}`).toContain(words)
      }
      expect((await ask('GET', '/api/casting/providers', headers)).status, `${who} cannot list`).toBe(200)
      expect((await ask('GET', '/api/casting/providers/guarded', headers)).status, `${who} cannot read`).toBe(200)
    }
    expect(stored(), 'a refused caller wrote something').toBe(before)
  })
})

describe("the person's message", () => {
  it("6: a secretary's add and its change of the address, programs or key name each send the person one; nothing else does", async () => {
    const secretary = { kind: 'agent', id: ids.get(SECRETARY) }
    expect(secretary.id, 'the registration answered an id').toBeTruthy()
    const toThePerson = [{ kind: 'person', id: THE_PERSON }]

    let count = theMessageCount()
    const added = await ask('POST', '/api/casting/providers', as(SECRETARY), aBody('by-secretary', { programs: ['codex', 'opencode'], baseAddress: 'https://first-host.example/v1', keyName: THE_SET_ENTRY }))
    expect(added.status, added.error).toBe(201)
    expect(added.body['provider'].added.by).toEqual(secretary)
    expect(theMessageCount(), 'the add sent no message, or more than one').toBe(++count)
    const first = theMessage(String(added.body['told']))
    expect(first).toMatchObject({ body: 'A secretary added a provider', notice: 'aSecretaryAddedAProvider', to: toThePerson, sentBy: moleOffice() })
    expect(first['saidInFull']).toBe(
      `${SECRETARY} added the provider by-secretary, named The test's own by-secretary. It is for codex, opencode. It sends to ` +
        `first-host.example. It names the key file's entry ${THE_SET_ENTRY} for its key. If you did not ask for this, tell the secretary.`,
    )

    const told: string[] = []
    for (const [change, host, keyName, hostBefore, keyNameBefore] of [
      [{ baseAddress: 'https://second-host.example/v2' }, 'second-host.example', THE_SET_ENTRY, 'first-host.example', THE_SET_ENTRY],
      [{ programs: ['dsh'] }, 'second-host.example', THE_SET_ENTRY, 'second-host.example', THE_SET_ENTRY],
      [{ keyName: 'another-entry' }, 'second-host.example', 'another-entry', 'second-host.example', THE_SET_ENTRY],
    ] as const) {
      const changed = await ask('PATCH', '/api/casting/providers/by-secretary', as(SECRETARY), change)
      expect(changed.status, changed.error).toBe(200)
      expect(theMessageCount(), `the change ${JSON.stringify(change)} sent no message, or more than one`).toBe(++count)
      const message = theMessage(String(changed.body['told']))
      expect(message).toMatchObject({ body: 'A secretary changed a provider', notice: 'aSecretaryChangedAProvider', to: toThePerson })
      const said = String(message['saidInFull'])
      expect(said).toContain(`${SECRETARY} changed the provider by-secretary`)
      expect(said).toContain(`sent to ${hostBefore} and named the key file's entry ${keyNameBefore}`)
      expect(said).toContain(`sends to ${host} and names the key file's entry ${keyName}`)
      expect(said, 'the message names the whole address').not.toContain('https://')
      told.push(String(changed.body['told']))
    }
    expect(theMessage(told[1]!)['saidInFull']).toContain('Before, it was for codex, opencode,')
    expect(theMessage(told[1]!)['saidInFull']).toContain('Now it is for dsh,')

    const renamed = await ask('PATCH', '/api/casting/providers/by-secretary', as(SECRETARY), { name: 'A new name only' })
    expect(renamed.status, renamed.error).toBe(200)
    expect(renamed.body['told'], 'a change of the name alone sent a message').toBeNull()
    const removed = await ask('DELETE', '/api/casting/providers/by-secretary', as(SECRETARY))
    expect(removed.status, removed.error).toBe(200)
    expect(removed.body['told'], 'a removal sent a message').toBeNull()
    expect(theMessageCount(), 'a name-only change or a removal sent a message').toBe(count)
    expect(theChangeRows('by-secretary').map((one) => [one.what, one.by_kind, one.by_id])).toEqual(
      ['add', 'change', 'change', 'change', 'change', 'remove'].map((what) => [what, 'agent', secretary.id]),
    )

    const persons = await addedByThePerson(aBody('by-the-person', { keyName: THE_SET_ENTRY }))
    expect(persons.body['told'], "the person's add sent a message").toBeNull()
    for (const change of [{ baseAddress: 'https://third-host.example/v1' }, { programs: ['codex'] }, { keyName: 'another-entry' }]) {
      const changed = await ask('PATCH', '/api/casting/providers/by-the-person', THE_PERSON_ASKS, change)
      expect(changed.status, changed.error).toBe(200)
      expect(changed.body['told'], `the person's change ${JSON.stringify(change)} sent a message`).toBeNull()
    }
    expect(theMessageCount(), "a write of the person's sent a message").toBe(count)

    for (const id of [String(added.body['told']), ...told]) {
      expect(JSON.stringify(theMessage(id)), 'a message carries the value').not.toContain(THE_ENTRYS_VALUE)
    }
  })
})

describe("no key's value", () => {
  it('7: is in no reply, no stored row and nothing printed, and the read says set', async () => {
    const printed: string[] = []
    const keep = (...args: unknown[]): void => {
      printed.push(args.map((one) => (typeof one === 'string' ? one : JSON.stringify(one))).join(' '))
    }
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(keep),
      vi.spyOn(console, 'info').mockImplementation(keep),
      vi.spyOn(console, 'warn').mockImplementation(keep),
      vi.spyOn(console, 'error').mockImplementation(keep),
      vi.spyOn(console, 'debug').mockImplementation(keep),
      ...[process.stdout, process.stderr].map((stream) => {
        const original = stream.write
        const passedOn = (chunk: unknown, ...rest: unknown[]): boolean => {
          keep(String(chunk))
          return Reflect.apply(original, stream, [chunk, ...rest]) as boolean
        }
        return vi.spyOn(stream, 'write').mockImplementation(passedOn as never)
      }),
    ]
    const replies: Said[] = []
    try {
      replies.push(await addedByThePerson(aBody('holds-the-entry', { keyName: THE_SET_ENTRY })))
      replies.push(await ask('POST', '/api/casting/providers', as(SECRETARY), aBody('also-holds-it', { keyName: THE_SET_ENTRY })))
      replies.push(await ask('GET', '/api/casting/providers', THE_PERSON_ASKS))
      replies.push(await ask('GET', '/api/casting/providers', as('moss-tally')))
      replies.push(await ask('GET', '/api/casting/providers/holds-the-entry', THE_PERSON_ASKS))
      replies.push(await ask('PATCH', '/api/casting/providers/holds-the-entry', THE_PERSON_ASKS, { name: 'Still holds the entry' }))
      replies.push(await ask('PATCH', '/api/casting/providers/also-holds-it', as(SECRETARY), { baseAddress: 'https://holds-it.example/v1' }))
      replies.push(await ask('PATCH', '/api/casting/providers/holds-the-entry', THE_PERSON_ASKS, { keyName: THE_SET_ENTRY }))
      replies.push(await ask('DELETE', '/api/casting/providers/also-holds-it', THE_PERSON_ASKS))
      replies.push(await ask('POST', '/api/casting/providers', THE_PERSON_ASKS, aBody('holds-the-entry', { keyName: THE_SET_ENTRY })))
      replies.push(await addedByThePerson(aBody('names-an-unset-entry', { keyName: 'an-unset-entry' })))
      replies.push(await ask('GET', '/api/casting/providers', THE_PERSON_ASKS))
    } finally {
      for (const spy of spies) spy.mockRestore()
    }
    expect(replies.map((one) => one.status)).toEqual([201, 201, 200, 200, 200, 200, 200, 200, 200, 409, 201, 200])
    for (const said of replies) expect(said.text, 'a reply carries the value').not.toContain(THE_ENTRYS_VALUE)
    expect(replies[4]!.body['key'], 'the read of a row naming the set entry').toBe('set')
    expect(replies[0]!.body['provider'].key).toBe('set')
    expect(replies[8]!.body['provider'].key).toBe('set')
    expect(replies[2]!.body['providers'].find((one: { id: string }) => one.id === 'holds-the-entry').key).toBe('set')
    expect(replies[10]!.body['provider'].key, 'a row naming an entry the key file does not hold').toBe('not set')
    const listed = new Map(replies[11]!.body['providers'].map((one: { id: string; key: string }) => [one.id, one.key]))
    expect([listed.get('holds-the-entry'), listed.get('names-an-unset-entry')]).toEqual(['set', 'not set'])
    expect(typeof replies[1]!.body['told'], "the secretary's add sent no message").toBe('string')
    expect(typeof replies[6]!.body['told'], "the secretary's change of the address sent no message").toBe('string')
    expect(everyStoredRow(), 'a stored row carries the value').not.toContain(THE_ENTRYS_VALUE)
    expect(printed.join('\n'), 'something printed carries the value').not.toContain(THE_ENTRYS_VALUE)
  })
})

describe('a page reads the message back', () => {
  /** A made-up reader that answers each word's key with the values it was given. */
  const marked: Say = (key, values) => `[${key}] ${JSON.stringify(values ?? {})}`
  const aLine = (data: Record<string, any>): AnOfficeLineOnAPage => ({
    sentBy: moleOffice(),
    body: String(data['body']),
    saidInFull: data['saidInFull'] ?? null,
    sentAt: '2026-11-04 09:00:00',
    toGroup: null,
    deliveries: [],
  })
  const theValuesIn = (said: string | null, key: string): unknown => {
    expect(said?.startsWith(`[${key}] `), `the sentence was not drawn by its own words: ${String(said)}`).toBe(true)
    return JSON.parse(said!.slice(key.length + 3))
  }

  it('8: with the values each stored sentence was written with, and keeps a sentence Mole Office did not write', async () => {
    const added = await ask('POST', '/api/casting/providers', as(SECRETARY), aBody('read-back', { name: 'A name. With a stop', programs: ['claude-code', 'dsh'], baseAddress: 'https://read-back.example:8443/v1', keyName: 'read-back-entry' }))
    expect(added.status, added.error).toBe(201)
    const changed = await ask('PATCH', '/api/casting/providers/read-back', as(SECRETARY), { baseAddress: 'http://[::1]:9000/', programs: ['codex'], keyName: THE_SET_ENTRY })
    expect(changed.status, changed.error).toBe(200)

    const first = theWordsOfAnOfficeLine(marked, aLine(theMessage(String(added.body['told']))))
    expect(first.line).toBe('[officeLines.aSecretaryAddedAProvider.line] {}')
    const values = { agent: SECRETARY, id: 'read-back', name: 'A name. With a stop', programs: 'claude-code, dsh', host: 'read-back.example', keyName: 'read-back-entry' }
    expect(theValuesIn(first.said, 'officeLines.aSecretaryAddedAProvider.said')).toEqual(values)

    const second = theWordsOfAnOfficeLine(marked, aLine(theMessage(String(changed.body['told']))))
    expect(second.line).toBe('[officeLines.aSecretaryChangedAProvider.line] {}')
    expect(theValuesIn(second.said, 'officeLines.aSecretaryChangedAProvider.said')).toEqual({
      ...values,
      programs: 'codex',
      host: '[::1]',
      keyName: THE_SET_ENTRY,
      programsBefore: 'claude-code, dsh',
      hostBefore: 'read-back.example',
      keyNameBefore: 'read-back-entry',
    })

    const other = theWordsOfAnOfficeLine(marked, aLine({ body: 'A secretary added a provider', saidInFull: 'A sentence somebody else stored.' }))
    expect(other).toEqual({ line: '[officeLines.aSecretaryAddedAProvider.line] {}', said: 'A sentence somebody else stored.' })
  })
})


describe('the person, proved', () => {
  it('10: refuses a request that names the person with no key, while the key window is open, at each write, and writes nothing', async () => {
    await addedByThePerson(aBody('proved-only'))
    const window = await ask('GET', '/api/office/key-window', THE_PERSON_ASKS)
    expect(window.body['open'], 'the key window is closed, so this case would prove nothing').toBe(true)
    const thePersonSaysSo = { ...WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
    const before = stored()
    const messages = theMessageCount()
    const writes = {
      add: await ask('POST', '/api/casting/providers', thePersonSaysSo, aBody('not-proved')),
      change: await ask('PATCH', '/api/casting/providers/proved-only', thePersonSaysSo, { baseAddress: 'https://not-proved.example/v1' }),
      remove: await ask('DELETE', '/api/casting/providers/proved-only', thePersonSaysSo),
    }
    for (const [write, said] of Object.entries(writes)) {
      expect(said.status, `the ${write}: ${said.error}`).toBe(403)
      expect(said.code, `the ${write}: ${said.error}`).toBe('providerPersonNotProved')
      expect(said.body['values'], `the ${write}`).toEqual({})
    }
    expect(stored(), 'a request that only names the person wrote something').toBe(before)
    expect(theMessageCount(), 'a request that only names the person sent a message').toBe(messages)
  })
})
