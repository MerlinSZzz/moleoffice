// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MOVED OFFICE SAYS IT MOVED FROM ITS FIRST REPLY (criterion DF28 of
 * design/window/the-data-folder-move.criteria.md, and OP2 of
 * design/messages/ONE-PERSON-EVERY-MACHINE-ACCEPTANCE.md).
 *
 * A move of the data folder gives the office a new world, because a world's identity is made from the
 * database's place. The page still sends its remembered home, the old identity, and the office sends the
 * moved-home header only when the worlds table holds that home as ended. The start now ends the rows the
 * former place left on this port before it listens (src/server/lib/a-moved-office-ends-its-former-rows.ts),
 * so the first reply already carries the header.
 *
 * The cases:
 * - an office that was not moved reads no process, leaves its own earlier row to the registration after
 *   listening, and answers a page that remembers it with no header and no warning;
 * - a moved office whose former home's row is still open and whose former office has ended answers the
 *   first request from a page that remembers the former home with the moved-home header naming the new
 *   database;
 * - a former home whose office still runs is not ended, gets no header, and the request is read as from
 *   another office;
 * - a home of another installation, and a home nobody knows, get no header;
 * - the start calls the step before it listens.
 *
 * Under a test runner a server registers its world as kind 'test', so the home rows are written here, as
 * tests/the-person-key-outranks-the-remembered-world.test.ts writes them. The office listens on a free
 * port, and its database is in this test's own temporary folder. The former offices are child processes
 * this file starts and stops.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { spawn, type ChildProcess } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { aFreePort } from './terminal-holder-stand.ts'
import type { FastifyInstance } from 'fastify'
import { HOME_HEADER, HOME_MOVED_HEADER, VISIT_WARNING_HEADER } from '../src/config/visit-headers.mjs'

type StepLib = typeof import('../src/server/lib/a-moved-office-ends-its-former-rows.ts')
type OfficeLib = typeof import('../src/server/lib/office.ts')
type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type RuntimeLib = typeof import('../src/server/lib/runtime.ts')
type WorldLib = typeof import('../src/server/lib/world.ts')

let t: TestDb
let app: FastifyInstance
let step: StepLib
let office: OfficeLib
let resources: ResourcesLib
let runtime: RuntimeLib
let world: WorldLib
/** The port this file's office listens on, a free one. */
let port: number
/** The identity of the database this test's office answers from, which is home now. */
let here: string
/** The identity of the database that was home before the move. */
let oldHome: string
/** The installation both test databases belong to. */
let theInstallation: string
/** The run every ledger row of this file names. */
let run: string
/** The child processes this file starts, stopped at the end. */
const started: ChildProcess[] = []

/** A home of this installation whose office is still running. */
const A_HOME_STILL_RUNNING = 'cccccccccccccccc'
/** A home that belongs to another installation, so it is never read as this office's own. */
const HOME_OF_ANOTHER_INSTALLATION = 'eeeeeeeeeeeeeeee'
/** A home the worlds table has never heard of. */
const A_HOME_NOBODY_KNOWS = 'dddddddddddddddd'
const OTHER_INSTALLATION = 'another-installation'

const ACTOR = { type: 'agent', id: 'builder-au' } as const
const THE_SERVER = { type: 'agent', id: 'mole-office/the-api-server' } as const
const WHO = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'builder-au',
  'x-mole-office-workspace': 'default',
}

beforeAll(async () => {
  // THE OTHER DATABASE OF THE ONE INSTALLATION, made and closed first, so `oldHome` is the identity of a
  // real database an office answered from.
  const old = await freshDb()
  const words = await import('../src/server/lib/world.ts')
  words.forgetTheWorld()
  const said = words.theWorldThisDatabaseIs()
  if (said === null) throw new Error('the old test database has no identity')
  oldHome = said
  const belonged = words.theInstallationThisDatabaseBelongsTo()
  if (belonged === null || belonged === '') throw new Error('the old test database belongs to no installation')
  theInstallation = belonged
  old.close()
  t = await freshDb()
  step = await import('../src/server/lib/a-moved-office-ends-its-former-rows.ts')
  office = await import('../src/server/lib/office.ts')
  resources = await import('../src/server/lib/resources.ts')
  runtime = await import('../src/server/lib/runtime.ts')
  world = await import('../src/server/lib/world.ts')
  world.forgetTheWorld()
  t.client.sqlite.prepare('UPDATE installation SET id = ? WHERE only_row = 1').run(theInstallation)
  const thisHome = world.theWorldThisDatabaseIs()
  if (thisHome === null) throw new Error('this test database has no identity')
  here = thisHome
  port = await aFreePort()
  run = t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'The run this test is',
    data: { state: 'running', runtime: 'vitest' },
    actor: ACTOR,
  }).id
  app = (await apiApp()).app
})

afterAll(async () => {
  for (const child of started) child.kill()
  app.server.closeAllConnections()
  await app.close()
  t.close()
})

/** A process this file starts, standing for an office that is running. */
function anOfficeRunning(): ChildProcess {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 600000)'], { stdio: 'ignore' })
  started.push(child)
  return child
}

/** Stop a process this file started, and wait until it has ended. */
async function itEnds(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  const ended = new Promise((done) => child.once('exit', done))
  child.kill()
  await ended
}

/** Write the row an office left: its process, on this port, serving the database `databaseIdentity`. */
function theRowAnOfficeLeft(child: ChildProcess, databaseIdentity: string): string {
  if (child.pid === undefined) throw new Error('the child process has no pid')
  return resources.registerResource({
    workspaceId: 'default',
    sessionRecordId: run,
    type: 'process',
    key: String(child.pid),
    detail: 'an office serving its home before the move',
    world: { ...runtime.worldNow(), databaseIdentity, port },
    actor: ACTOR,
  }).id
}

/** Write an open home world, as the worlds table holds a home whose office has not yet ended. */
function anOpenHome(databaseIdentity: string, belongsTo: string): string {
  return office.registerWorldHere({
    name: 'a home before the move',
    kind: 'home',
    startedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
    checkout: null,
    head: null,
    databaseIdentity,
    address: null,
    addressForOtherMachines: null,
    standing: 'canonical',
    parentWorld: null,
    installation: belongsTo,
  }).id
}

/** The start's step, as src/server/index.ts calls it before it listens. */
function theStartsStep(): ReturnType<StepLib['endTheRowsAFormerPlaceLeft']> {
  return step.endTheRowsAFormerPlaceLeft({ workspaceId: 'default', port, actor: THE_SERVER })
}

/** The office listening on its free port, once the step has run. */
let listening: string | null = null
async function theOfficeListening(): Promise<string> {
  listening ??= await app.listen({ port, host: '127.0.0.1' })
  return listening
}

/** A read from a page that remembers `home`. */
async function aReadFromAPageThatRemembers(home: string): Promise<Response> {
  const address = await theOfficeListening()
  return fetch(`${address}/api/records?kind=note&limit=1`, { headers: { ...WHO, [HOME_HEADER]: home } })
}

describe('an office that was not moved', () => {
  it('reads no process before it listens, and answers a page that remembers it as today', async () => {
    const earlier = anOfficeRunning()
    const row = theRowAnOfficeLeft(earlier, here)
    await itEnds(earlier)

    expect(await theStartsStep(), 'no row names another database, so nothing is read').toBeNull()
    expect(resources.liveRowById(row, 'default'), 'its own earlier row is left to the registration after listening').not.toBeNull()

    const reply = await aReadFromAPageThatRemembers(here)
    expect(reply.status).toBe(200)
    expect(reply.headers.get(HOME_MOVED_HEADER)).toBeNull()
    expect(reply.headers.get(VISIT_WARNING_HEADER)).toBeNull()
  })
})

describe('a moved office whose former office has ended', () => {
  it('ends the former home before it listens, and sends the moved-home header from the first reply', async () => {
    const homeId = anOpenHome(oldHome, theInstallation)
    const former = anOfficeRunning()
    const row = theRowAnOfficeLeft(former, oldHome)
    await itEnds(former)

    const said = await theStartsStep()
    expect(said?.ok, said?.line).toBe(true)
    expect(resources.liveRowById(row, 'default'), 'the row of the ended office is ended').toBeNull()
    expect(resources.ledgerRowById(row, 'default')?.releaseNote).toContain('before it listened')
    expect(office.worldById(homeId)?.diedAt, 'nothing serves the former home, so it has ended').not.toBeNull()

    const first = await aReadFromAPageThatRemembers(oldHome)
    expect(first.status).toBe(200)
    expect(first.headers.get(HOME_MOVED_HEADER)).toBe(here)
    expect(first.headers.get(VISIT_WARNING_HEADER)).toBeNull()
  })
})

describe('a former home that is not truly gone', () => {
  it('is not ended while its office still runs, and a page that remembers it is read as from another office', async () => {
    const homeId = anOpenHome(A_HOME_STILL_RUNNING, theInstallation)
    const row = theRowAnOfficeLeft(anOfficeRunning(), A_HOME_STILL_RUNNING)

    const said = await theStartsStep()
    expect(said?.ok, said?.line).toBe(true)
    expect(resources.liveRowById(row, 'default'), 'a running office keeps its row').not.toBeNull()
    expect(office.worldById(homeId)?.diedAt, 'a running office keeps its home').toBeNull()

    const reply = await aReadFromAPageThatRemembers(A_HOME_STILL_RUNNING)
    expect(reply.headers.get(HOME_MOVED_HEADER)).toBeNull()
    expect(reply.headers.get(VISIT_WARNING_HEADER)).not.toBeNull()
  })

  it('gives a home never of this installation no header, whether or not its office has ended', async () => {
    anOpenHome(HOME_OF_ANOTHER_INSTALLATION, OTHER_INSTALLATION)
    const another = anOfficeRunning()
    theRowAnOfficeLeft(another, HOME_OF_ANOTHER_INSTALLATION)
    await itEnds(another)

    const said = await theStartsStep()
    expect(said?.ok, said?.line).toBe(true)

    for (const home of [HOME_OF_ANOTHER_INSTALLATION, A_HOME_NOBODY_KNOWS]) {
      const reply = await aReadFromAPageThatRemembers(home)
      expect(reply.headers.get(HOME_MOVED_HEADER), home).toBeNull()
      expect(reply.headers.get(VISIT_WARNING_HEADER), home).not.toBeNull()
    }
  })
})

describe('the start', () => {
  it('ends the rows a former place left after it prepares to serve and before it listens', () => {
    const start = readFileSync(new URL('../src/server/index.ts', import.meta.url), 'utf8')
    const prepared = start.indexOf('prepareToServe(sqlite')
    const ended = start.indexOf('await endTheRowsAFormerPlaceLeft(')
    const listens = start.indexOf('await app.listen({ port, host })')
    expect(prepared).toBeGreaterThan(-1)
    expect(ended).toBeGreaterThan(prepared)
    expect(listens).toBeGreaterThan(ended)
  })
})
