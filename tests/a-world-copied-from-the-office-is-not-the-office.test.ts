// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORLD COPIED FROM THE OFFICE KNOWS IT IS NOT THE OFFICE. Keys wave, round 4, piece c3.
 *
 * The office is the database that holds a world of kind `home` (`theOfficeIsInThisDatabase` in
 * src/server/lib/office.ts). A world's database is a copy of the office's, made by `copyDatabase` in
 * tools/isolated-mole-office.mjs. The copy kept the office's home row, so the world read itself as
 * the office, and its reports to the office stopped at their first line. The key the office makes
 * for a world's reports was made and never sent.
 *
 * Now the copy that becomes a world deletes the office's home rows
 * (THE_ROWS_A_WORLDS_COPY_REMOVES in src/config/what-a-copy-must-not-carry.mjs). A backup of the
 * same database keeps them, because a backup is the office.
 *
 * WHAT THIS FILE MEASURES, on one office database holding a live home row and a dead one:
 *   1. the world's copy, made by the tool's own `copyDatabase`, answers `theOfficeIsInThisDatabase()`
 *      false, and the office it was copied from still answers true;
 *   2. the world's report of itself is sent, under the starter's name and with the key the office
 *      made for this world, and the office takes it onto the row the tool wrote;
 *   3. a backup of the same database, made by scripts/backup.ts, still holds both home rows;
 *   4. inside the world, a citizen copied from the office is still named as a citizen of "my world":
 *      the name is read from the office's mirror (`theWorldsThisWorldCanName`), and the sentence
 *      beside it is true on each path — read from the mirror, no mirror, and at the office itself.
 *
 * HOW THE REPORT IS SENT WITHOUT A NETWORK. `reportThisWorldToTheOffice` sends nothing under a test
 * runner, and it sends to the address the declaration names, which on a real machine is the owner's
 * office. So for that one call this file answers "no test runner" and replaces `fetch` with a
 * function that hands the request to this file's own office through `app.inject`. Nothing leaves
 * the process, whatever address the report was sent to.
 *
 * MUTATIONS, each after a control run:
 *   - pass `{}` instead of `{ becomesAWorld: true }` to `emptyAndScrub` in `copyDatabase`: cases 1
 *     and 2 go red;
 *   - make `theWorldsThisWorldCanName` not read the mirror: case 4 goes red.
 */

import type { AddressInfo } from 'node:net'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import type { World } from '../src/shared/worlds.ts'
import { databaseIdentity } from '../src/config/database-identity.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

/** Whether `aTestRunnerIsBehindThisProcess` answers false for the one call that sends a report. */
const pretend = vi.hoisted(() => ({ noTestRunner: false }))

vi.mock('../src/server/lib/runtime.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/server/lib/runtime.ts')>()
  return {
    ...actual,
    aTestRunnerIsBehindThisProcess: () => (pretend.noTestRunner ? false : actual.aTestRunnerIsBehindThisProcess()),
  }
})

type OfficeLib = typeof import('../src/server/lib/office.ts')
type ClientLib = typeof import('../src/server/db/client.ts')
type ParticipantsApi = typeof import('../src/server/api/participants.ts')

const REPO = fileURLToPath(new URL('..', import.meta.url))
const BACKUP_SCRIPT = join(REPO, 'scripts/backup.ts')

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let t: TestDb
let app: FastifyInstance
let api: string
/** The office's own library, on the office's database. */
let office: OfficeLib
/** The same library loaded again on the world's copy, which is what the world's server runs. */
let world: OfficeLib
let worldClient: ClientLib
/** The participants door's library, on the office's database and on the world's copy. */
let officeParticipants: ParticipantsApi
let worldParticipants: ParticipantsApi
let copyFile = ''
let startersKey = ''

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

/** A home row of the office, on the office's own database. */
function aHomeRow(name: string, identity = databaseIdentity(t.file).id): Parameters<OfficeLib['registerWorldHere']>[0] {
  return {
    name,
    purpose: null,
    handback: null,
    kind: 'home',
    startedBy: { kind: 'person', id: THE_PERSON },
    checkout: '/nowhere',
    head: null,
    databaseIdentity: identity,
    address: 'http://127.0.0.1:9',
    addressForOtherMachines: null,
    standing: 'canonical',
    parentWorld: null,
    installation: 'an-installation',
  }
}

function homeRowsIn(file: string): number {
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    return (db.prepare("SELECT count(*) AS n FROM worlds WHERE kind = 'home'").get() as { n: number }).n
  } finally {
    db.close()
  }
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: randomBytes(32).toString('hex'), office: randomBytes(32).toString('hex'), providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  office = await import('../src/server/lib/office.ts')
  officeParticipants = await import('../src/server/api/participants.ts')

  // THE OFFICE'S HOME ROWS: one that died, of the database the office was before a restore, and the
  // live one. `theOfficeIsInThisDatabase` counts both.
  const dead = office.registerWorldHere(aHomeRow('the home before a restore', 'fedcba9876543210'))
  office.closeWorldHere(dead.id, 'the database was restored')
  office.registerWorldHere(aHomeRow('my world'))

  const registered = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: 'world-starter', name: 'World Starter', role: 'worker', runtime: 'claude-code' },
  })
  startersKey = String((registered.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key)
  expect(startersKey, 'the registration of world-starter answered no key').toMatch(/^[0-9a-f]{64}$/)

  // THE WORLD'S COPY, made by the tool's own copy step.
  const tool = await import('../tools/isolated-mole-office.mjs')
  copyFile = join(dirname(t.file), 'the-worlds-copy.db')
  const copied = (await tool.copyDatabase(t.file, copyFile)) as { problems: string[] }
  expect(copied.problems, `copyDatabase refused: ${JSON.stringify(copied.problems)}`).toEqual([])

  // THE WORLD'S SERVER RUNS THE SAME LIBRARY ON THE COPY. The office's modules keep their own
  // handle on the office's database; these are loaded again on the copy.
  const officeDb = process.env['MOLE_OFFICE_DB']
  process.env['MOLE_OFFICE_DB'] = copyFile
  vi.resetModules()
  try {
    worldClient = await import('../src/server/db/client.ts')
    world = await import('../src/server/lib/office.ts')
    worldParticipants = await import('../src/server/api/participants.ts')
  } finally {
    process.env['MOLE_OFFICE_DB'] = officeDb
  }
}, 60_000)

afterAll(async () => {
  worldClient?.sqlite.close()
  await app?.close()
  t?.close()
})

describe('1. the world’s copy is not the office', () => {
  it('answers theOfficeIsInThisDatabase() false in the copy, and true in the office it came from', () => {
    expect(office.theOfficeIsInThisDatabase(), 'the office itself no longer reads as the office').toBe(true)
    expect(world.theOfficeIsInThisDatabase(), 'the world’s copy still reads as the office').toBe(false)
  })
})

describe('2. the world’s report goes out, with the key the office made for this world', () => {
  it('sends its row under the starter’s name and that key, and the office takes it onto the tool’s row', async () => {
    const tool = await import('../tools/isolated-mole-office.mjs')
    const registered = await withEnvironment({ MOLE_AGENT_KEY: startersKey, MOLE_OFFICE_AGENT: 'world-starter' }, () =>
      tool.registerTheWorldAtTheOffice({
        showToThePerson: true,
        officeApi: api,
        workspace: 'default',
        run: null,
        name: 'the copied world',
        db: copyFile,
        apiAddress: 'http://127.0.0.1:9',
        apiForOtherMachines: null,
        purpose: 'to be looked at',
        handback: null,
      }),
    )
    expect(registered.key, registered.says).toMatch(/^[0-9a-f]{64}$/)
    expect(registered.holder).toBe('world-starter')

    // THE WORLD'S OWN ROW, written in its own table as its server does at start.
    const identity = databaseIdentity(copyFile).id
    const itself: World = world.registerWorldHere({
      name: 'the copied world',
      purpose: 'to be looked at',
      handback: null,
      kind: 'agent-made',
      startedBy: { kind: 'agent', id: 'world-starter' },
      checkout: '/nowhere',
      head: null,
      databaseIdentity: identity,
      address: 'http://127.0.0.1:9',
      addressForOtherMachines: null,
      standing: 'scratch',
      parentWorld: null,
      installation: 'an-installation',
    })

    const sent: { path: string; headers: Record<string, string> }[] = []
    const toThisOffice = async (url: string | URL, init?: RequestInit): Promise<Response> => {
      pretend.noTestRunner = false
      const headers = Object.fromEntries(new Headers(init?.headers).entries())
      const path = new URL(String(url)).pathname
      sent.push({ path, headers })
      const reply = await app.inject({
        method: (init?.method ?? 'GET') as 'POST',
        url: path,
        headers,
        payload: typeof init?.body === 'string' ? init.body : undefined,
      })
      return new Response(reply.body, { status: reply.statusCode, headers: { 'content-type': 'application/json' } })
    }
    vi.stubGlobal('fetch', toThisOffice)
    pretend.noTestRunner = true
    let told: Awaited<ReturnType<OfficeLib['reportThisWorldToTheOffice']>>
    try {
      told = await withEnvironment(
        { MOLE_WORLD_REPORT_KEY: registered.key ?? undefined, MOLE_WORLD_REPORT_AS: registered.holder ?? undefined },
        () => world.reportThisWorldToTheOffice(itself),
      )
    } finally {
      pretend.noTestRunner = false
      vi.unstubAllGlobals()
    }

    expect(told.told, told.why).toBe(true)
    expect(sent.map((one) => one.path)).toEqual(['/api/office/worlds'])
    expect(sent[0]?.headers['x-mole-office-actor-id']).toBe('world-starter')
    expect(sent[0]?.headers['x-mole-office-key'] === registered.key, 'the report did not carry the world’s key').toBe(true)
    expect(told.atTheOffice).toBe(registered.atTheOffice)
    expect(office.worldsHere().filter((one) => one.databaseIdentity === identity)).toHaveLength(1)
  })
})

describe('3. a backup of the same database is the office, and keeps its home rows', () => {
  it('holds both home rows after scripts/backup.ts', () => {
    const backupFile = join(dirname(t.file), 'the-backup.db')
    const run = spawnSync('npx', ['tsx', BACKUP_SCRIPT, '--to', backupFile], {
      cwd: REPO,
      encoding: 'utf8',
      env: { ...process.env, MOLE_OFFICE_DB: t.file },
      timeout: 60_000,
    })
    expect(run.status, run.stderr).toBe(0)
    expect(homeRowsIn(t.file)).toBe(2)
    expect(homeRowsIn(backupFile)).toBe(2)
  }, 90_000)
})

describe('4. inside the world, a citizen copied from the office keeps the name of its home world', () => {
  const officeIdentity = (): string => databaseIdentity(t.file).id

  it('reads the name from the office’s mirror, and says so', () => {
    const mirrorFile = join(dirname(t.file), 'worlds.json')
    const writtenAt = '2026-09-26 03:00:00'
    writeFileSync(
      mirrorFile,
      `${JSON.stringify({ writtenAt, writtenBy: officeIdentity(), worlds: office.worldsHere(), visits: [] }, null, 2)}\n`,
    )
    const said = worldParticipants.theCitizenship(officeIdentity(), { file: mirrorFile, why: 'the test wrote this mirror' })
    expect(said.citizenOf?.name).toBe('my world')
    expect(said.citizenOf?.kind).toBe('home')
    expect(said.citizenshipSays).toBe(
      'This is the roll of the database this server holds. The name of that world comes from the office\u2019s list, ' +
        `as the office last wrote it at ${writtenAt}. Another world keeps its own roll, and nothing here reads it.`,
    )
  })

  it('with no mirror, says this world holds no row and why it read no list, and invents no name', () => {
    const said = worldParticipants.theCitizenship(officeIdentity(), { file: null, why: 'no mirror was handed to this test.' })
    expect(said.citizenOf?.name).toBeNull()
    expect(said.citizenshipSays).toBe(
      'This world holds no row for that world, so there is a database identity here and no name for it. ' +
        'It did not read the office\u2019s list: no mirror was handed to this test.',
    )
  })

  it('a mirror that is not there is named by its path', () => {
    const missing = join(dirname(t.file), 'no-such-mirror.json')
    const said = worldParticipants.theCitizenship(officeIdentity(), { file: missing, why: 'the test named this file' })
    expect(said.citizenOf?.name).toBeNull()
    expect(said.citizenshipSays).toContain(`no list the office wrote could be read at ${missing}.`)
  })

  it('at the office, an identity no row names is still “the office holds no row”', () => {
    const said = officeParticipants.theCitizenship('0123456789abcdef', { file: null, why: 'unused at the office.' })
    expect(said.citizenOf?.name).toBeNull()
    expect(said.citizenshipSays).toBe('The office holds no row for that world, so there is a database identity here and no name for it.')
    expect(officeParticipants.theCitizenship(officeIdentity()).citizenOf?.name).toBe('my world')
  })
})
