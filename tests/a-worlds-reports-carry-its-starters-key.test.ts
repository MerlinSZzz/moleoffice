// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORLD'S REPORTS CARRY A KEY OF THE AGENT THAT STARTED IT. Keys wave piece 10; criterion P83
 * point 5; the secretary's decision jjfwwrrJy-qV (answer B).
 *
 * A test world's server reports to the office it was copied from: that it started, what it is
 * called, which visits it holds, and that it ended. It sent those reports under the office's own
 * name with no key. The world holds only its own keys, which the office does not know, so once a
 * header claim counts for nothing the reports would count as nobody.
 *
 * What was decided: when an agent registers a world with its own key, the office makes one more
 * live key of that agent, as it does for a run, records which key row it is on the world's row, and
 * answers it once. `tools/isolated-mole-office.mjs` registers the world that way before the world's
 * server starts, and hands the key to that server through its environment. The world sends it under
 * the starter's name on every report. Every way the row is marked ended revokes it.
 *
 * WHAT THIS FILE MEASURES, one `describe` for each of the brief's tests:
 *   1. registering a world with the starter's key answers a key that proves the starter;
 *   2. the world's report carries it under the starter's name and is accepted, and the world's own
 *      later registration finds the row the tool wrote rather than making a second one;
 *   3. closing the world revokes it, by the close door and by the sweep of worlds nothing serves;
 *   4. a keyless registration makes no key and still registers.
 * The fifth, that tools/isolated-mole-office.mjs builds its headers through the one helper, was a
 * check of source text in another file, which has since been deleted.
 *
 * MUTATIONS, each with a control run first:
 *   - make no key in `registerAWorld` (src/server/lib/office.ts): the first and second describes go red;
 *   - skip `revokeTheKeyNamed` in `closeWorldHere`: the third goes red;
 *   - make `theHeadersThisWorldReportsUnder` ignore the key: the second goes red.
 */

import type { AddressInfo } from 'node:net'
import { createHash, randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { databaseIdentity } from '../src/config/database-identity.mjs'
import { WORLD_HEADER, formatWorldHeader } from '../src/config/world-header.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

type OfficeLib = typeof import('../src/server/lib/office.ts')

const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')

/** The names of the environment variables this file sets and puts back, spelled once. */
const THE_AGENT_KEY = 'MOLE_AGENT_KEY'
const THE_AGENT = 'MOLE_OFFICE_AGENT'
const THE_REPORT_KEY = 'MOLE_WORLD_REPORT_KEY'
const THE_REPORT_AS = 'MOLE_WORLD_REPORT_AS'

let t: TestDb
let app: FastifyInstance
let api: string
let office: OfficeLib
/** The registration key of the agent that starts worlds here. */
let startersKey = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The request headers of an agent sending its own key under its own name. */
function asAgentWithKey(handle: string, key: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    'x-mole-office-key': key,
  }
}

/** A world's registration body, with a database identity nothing else in this file uses. */
function aWorldBody(databaseIdentityOfIt: string): Record<string, unknown> {
  return {
    name: `the world ${databaseIdentityOfIt}`,
    kind: 'agent-made',
    startedBy: { kind: 'agent', id: 'world-starter' },
    checkout: '/nowhere',
    head: null,
    databaseIdentity: databaseIdentityOfIt,
    address: 'http://127.0.0.1:9',
    addressForOtherMachines: null,
    standing: 'scratch',
    parentWorld: null,
    installation: 'an-installation',
  }
}

/** The `held_keys` row a key's SHA-256 is kept under, revoked or not. */
function theRowOfTheKey(key: string): { id: string; whose_id: string; revoked_at: string | null } | undefined {
  const hash = createHash('sha256').update(key).digest('hex')
  return t.client.sqlite
    .prepare('SELECT id, whose_id, revoked_at FROM held_keys WHERE key_hash = ?')
    .get(hash) as { id: string; whose_id: string; revoked_at: string | null } | undefined
}

function idOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
}

function countOfKeys(): number {
  return (t.client.sqlite.prepare('SELECT count(*) AS n FROM held_keys').get() as { n: number }).n
}

async function registerAWorld(
  headers: Record<string, string>,
  identity: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: '/api/office/worlds', headers, payload: aWorldBody(identity) })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

/** Set some environment variables for one call, and put every one back as it was. */
async function withEnvironment<T>(values: Record<string, string | undefined>, run: () => Promise<T> | T): Promise<T> {
  const before: Record<string, string | undefined> = {}
  for (const name of Object.keys(values)) before[name] = process.env[name]
  const put = (from: Record<string, string | undefined>): void => {
    for (const [name, value] of Object.entries(from)) {
      if (value === undefined) Reflect.deleteProperty(process.env, name)
      else process.env[name] = value
    }
  }
  put(values)
  try {
    return await run()
  } finally {
    put(before)
  }
}

/** A write made with this key alone, and who the office said made it, or the refusal. */
async function whoAKeyWritesAs(key: string): Promise<{ status: number; actor: string | null }> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-key': key },
    payload: { kind: 'note', title: `written with a world's key ${randomBytes(4).toString('hex')}` },
  })
  const body = reply.json() as { record?: { id?: string } }
  if (reply.statusCode !== 201 || body.record?.id === undefined) return { status: reply.statusCode, actor: null }
  const row = t.client.sqlite
    .prepare('SELECT actor_id AS id FROM changes WHERE record_id = ? ORDER BY at DESC LIMIT 1')
    .get(body.record.id) as { id: string } | undefined
  return { status: reply.statusCode, actor: row?.id ?? null }
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  office = await import('../src/server/lib/office.ts')
  const registered = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: 'world-starter', name: 'World Starter', role: 'worker', runtime: 'claude-code' },
  })
  startersKey = String((registered.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key)
  expect(startersKey, 'the registration of world-starter answered no key').toMatch(/^[0-9a-f]{64}$/)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('1. registering a world with the starter’s own key answers a key that proves the starter', () => {
  it('answers one key, of the starter, recorded on the world’s row', async () => {
    const { status, body } = await registerAWorld(asAgentWithKey('world-starter', startersKey), '1111111111111111')
    expect(status).toBe(201)
    const made = body['reportsKey'] as { key?: string; holder?: string } | null
    expect(made, String(body['reportsKeySays'])).not.toBeNull()
    expect(made?.key).toMatch(/^[0-9a-f]{64}$/)
    expect(made?.key).not.toBe(startersKey)
    expect(made?.holder).toBe('world-starter')
    const row = theRowOfTheKey(String(made?.key))
    expect(row?.whose_id).toBe(idOf('world-starter'))
    expect(row?.revoked_at).toBeNull()
    const world = body['world'] as { id: string }
    expect(office.theReportsKeyRowOf(world.id)).toBe(row?.id)
    // AND IT PROVES THE STARTER: a write carrying nothing but this key is the starter's.
    expect(await whoAKeyWritesAs(String(made?.key))).toEqual({ status: 201, actor: idOf('world-starter') })
  })
})

describe('2. the world’s reports carry the key under the starter’s name, and are accepted', () => {
  it('the tool registers first; the world’s own registration finds that row and makes no second row or key', async () => {
    const tool = await import('../tools/isolated-mole-office.mjs')
    const registered = await withEnvironment({ [THE_AGENT_KEY]: startersKey, [THE_AGENT]: 'world-starter' }, () =>
      tool.registerTheWorldAtTheOffice({
        showToThePerson: true,
        officeApi: api,
        workspace: 'default',
        run: null,
        name: 'the tool’s world',
        db: t.file,
        apiAddress: 'http://127.0.0.1:9',
        apiForOtherMachines: null,
        purpose: 'to be looked at',
        handback: null,
      }),
    )
    expect(registered.key, registered.says).toMatch(/^[0-9a-f]{64}$/)
    expect(registered.holder).toBe('world-starter')
    const identity = databaseIdentity(t.file).id
    const rowsBefore = office.worldsHere().filter((one) => one.databaseIdentity === identity)
    expect(rowsBefore.map((one) => one.id)).toEqual([registered.atTheOffice])

    // THE WORLD'S SERVER, WITH THE TWO VARIABLES THE TOOL PUT IN ITS ENVIRONMENT, reports itself.
    const headers = await withEnvironment({ [THE_REPORT_KEY]: registered.key, [THE_REPORT_AS]: registered.holder }, () =>
      office.theHeadersThisWorldReportsUnder(),
    )
    expect(headers['x-mole-office-actor-id']).toBe('world-starter')
    expect(headers['x-mole-office-key']).toBe(registered.key)
    const keysBefore = countOfKeys()
    const report = await app.inject({
      method: 'POST',
      url: '/api/office/worlds',
      headers: { 'content-type': 'application/json', ...headers },
      payload: aWorldBody(identity),
    })
    expect(report.statusCode, report.body).toBe(201)
    const said = report.json() as { world: { id: string }; reportsKey: unknown }
    expect(said.world.id).toBe(registered.atTheOffice)
    expect(said.reportsKey).toBeNull()
    expect(countOfKeys()).toBe(keysBefore)
    expect(office.worldsHere().filter((one) => one.databaseIdentity === identity)).toHaveLength(1)
  })

  it('a visit report goes under the starter’s name with the key, and the office takes it', async () => {
    const { body } = await registerAWorld(asAgentWithKey('world-starter', startersKey), '2222222222222222')
    const made = body['reportsKey'] as { key: string; holder: string }
    const headers = await withEnvironment({ [THE_REPORT_KEY]: made.key, [THE_REPORT_AS]: made.holder }, () =>
      office.theHeadersThisWorldReportsUnder(),
    )
    const visit = await app.inject({
      method: 'POST',
      url: '/api/office/visits',
      headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', ...headers },
      payload: {
        visitor: { kind: 'agent', id: 'world-starter' },
        fromWorld: '3333333333333333',
        toWorld: '2222222222222222',
        why: 'a report from a world',
        id: `a-visit-${randomBytes(4).toString('hex')}`,
      },
    })
    expect(visit.statusCode, visit.body).toBe(201)
  })

  it('with no key in its environment a world reports under the office’s own name and sends no key, as before', async () => {
    const headers = await withEnvironment({ [THE_REPORT_KEY]: undefined, [THE_REPORT_AS]: undefined }, () =>
      office.theHeadersThisWorldReportsUnder(),
    )
    expect(headers).toEqual({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-api-server' })
  })
})

describe('2b. the world\u2019s servers are never handed the starter\u2019s own key', () => {
  it('takes MOLE_AGENT_KEY, and any report key left in the tool\u2019s environment, out of the world\u2019s', async () => {
    const tool = await import('../tools/isolated-mole-office.mjs')
    const env = tool.environmentForTheWorld({
      base: { PATH: '/usr/bin', [THE_AGENT_KEY]: startersKey, [THE_REPORT_KEY]: 'a-left-over-key', [THE_REPORT_AS]: 'somebody' },
      db: '/nowhere/copy.db',
      apiPort: 9,
      webPort: 10,
      withMessageWorker: false,
      authority: { startedBy: 'world-starter', secretaries: [], problems: [] },
      purpose: null,
      handback: null,
      otherHost: null,
      place: '/nowhere',
      workspace: 'default',
    }) as Record<string, string | undefined>
    expect(env['PATH']).toBe('/usr/bin')
    expect(Object.keys(env)).not.toContain(THE_AGENT_KEY)
    expect(Object.keys(env)).not.toContain(THE_REPORT_KEY)
    expect(Object.keys(env)).not.toContain(THE_REPORT_AS)
    expect(Object.values(env)).not.toContain(startersKey)
  })
})

describe('3. every way a world ends revokes its key', () => {
  it('closing the world takes the key back, and the key then proves nobody', async () => {
    const { body } = await registerAWorld(asAgentWithKey('world-starter', startersKey), '4444444444444444')
    const made = body['reportsKey'] as { key: string; holder: string }
    const world = body['world'] as { id: string }
    // THE WORLD'S OWN DEATH REPORT, sent under the key it is about to lose.
    const closed = await app.inject({
      method: 'POST',
      url: `/api/office/worlds/${world.id}/close`,
      headers: asAgentWithKey(made.holder, made.key),
      payload: { because: 'the server was stopped' },
    })
    expect(closed.statusCode, closed.body).toBe(200)
    expect(theRowOfTheKey(made.key)?.revoked_at).not.toBeNull()
    const after = await whoAKeyWritesAs(made.key)
    expect(after.actor).not.toBe(idOf('world-starter'))
    // AND THE STARTER'S OWN KEY IS UNTOUCHED: only the world's key was taken back.
    expect(theRowOfTheKey(startersKey)?.revoked_at ?? null).toBeNull()
  })

  it('the sweep of worlds nothing serves takes the key back when it closes the row', async () => {
    const { body } = await registerAWorld(asAgentWithKey('world-starter', startersKey), '5555555555555555')
    const made = body['reportsKey'] as { key: string }
    const world = body['world'] as { id: string }
    // Something else answers at the world's address, as another database: the sweep closes the row.
    const somebodyElse = (async () =>
      new Response('{}', {
        status: 200,
        headers: {
          [WORLD_HEADER]: formatWorldHeader({
            database: 'ffffffffffffffff',
            repository: '/somewhere',
            port: '9',
            head: '546d00f',
            standing: 'scratch',
          }),
        },
      })) as unknown as typeof fetch
    await office.closeTheWorldsNothingIsServing({ fetchImpl: somebodyElse })
    expect(office.worldById(world.id)?.diedAt, 'the sweep did not close the row, so this test measured nothing').not.toBeNull()
    expect(theRowOfTheKey(made.key)?.revoked_at).not.toBeNull()
  })
})

describe('4. a registration with no agent key makes no key, and still registers', () => {
  it('registers the world, answers no key, says why, and writes no key row', async () => {
    const keysBefore = countOfKeys()
    const { status, body } = await registerAWorld(AS_THE_PERSON, '6666666666666666')
    expect(status).toBe(201)
    expect(body['reportsKey']).toBeNull()
    expect(body['reportsKeySays']).toBe(
      'No key was made for this world’s reports, because it was not registered with an agent’s own key.',
    )
    const world = body['world'] as { id: string }
    expect(office.worldById(world.id)).not.toBeNull()
    expect(office.theReportsKeyRowOf(world.id)).toBeNull()
    expect(countOfKeys()).toBe(keysBefore)
  })

  it('the tool with no key registers nothing, and says so', async () => {
    const tool = await import('../tools/isolated-mole-office.mjs')
    const before = office.worldsHere().length
    const registered = await withEnvironment({ [THE_AGENT_KEY]: undefined, [THE_AGENT]: 'world-starter' }, () =>
      tool.registerTheWorldAtTheOffice({
        showToThePerson: true,
        officeApi: api,
        workspace: 'default',
        run: null,
        name: 'a keyless world',
        db: t.file,
        apiAddress: 'http://127.0.0.1:9',
        apiForOtherMachines: null,
        purpose: null,
        handback: null,
      }),
    )
    expect(registered.key).toBeNull()
    expect(registered.atTheOffice).toBeNull()
    expect(registered.says).toMatch(/holds no key \(MOLE_AGENT_KEY is not set\)/)
    expect(office.worldsHere().length).toBe(before)
  })
})
